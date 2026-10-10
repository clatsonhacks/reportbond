// One place for model calls: ask for a JSON object matching a schema, and validate it before use.
// Provider is chosen by which key is set:
//   GROQ_API_KEY       -> Groq (OpenAI-compatible API), default model openai/gpt-oss-120b
//   ANTHROPIC_API_KEY  -> Claude, default model claude-opus-5-5
// AI_PROVIDER=groq|anthropic forces one; AI_MODEL overrides the model.
// GROQ_BASE_URL / ANTHROPIC_BASE_URL can point at a mock for tests.
import "server-only";
import "./env";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export type AiProvider = "groq" | "anthropic";
type Effort = "low" | "medium" | "high";

export function aiProvider(): AiProvider | null {
  const forced = process.env.AI_PROVIDER;
  if (forced === "groq" || forced === "anthropic") return forced;
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "anthropic";
  return null;
}

export const aiConfigured = () => aiProvider() !== null;

export function aiModel(): string {
  return process.env.AI_MODEL ?? (aiProvider() === "anthropic" ? "claude-opus-5-5" : "openai/gpt-oss-120b");
}

/** A failure with a message a maintainer can read. */
export class AiError extends Error {}

/**
 * Wraps untrusted text (a report, a README) so the model can tell it apart from instructions.
 * Anything that looks like our own closing tag is neutralised, so the text can't break out of the block.
 */
export function dataBlock(tag: string, text: string): string {
  const safe = text.replaceAll(`</${tag}`, `<\\/${tag}`);
  return `<${tag}>\n${safe}\n</${tag}>`;
}

type Ask<S extends z.ZodType> = {
  schema: S;
  /** Short name for the answer's shape, letters and underscores only. */
  name: string;
  system: string;
  user: string;
  effort?: Effort;
  maxTokens?: number;
};

/** Ask for one JSON object matching `schema`. Throws AiError on any failure. */
export async function askStructured<S extends z.ZodType>(opts: Ask<S>): Promise<{ output: z.infer<S>; model: string }> {
  const provider = aiProvider();
  if (!provider) throw new AiError("The AI isn't set up on this server (no GROQ_API_KEY or ANTHROPIC_API_KEY).");
  const { text, model } = provider === "groq" ? await askGroq(opts) : await askClaude(opts);

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AiError("The AI returned something that isn't valid JSON.");
  }
  const parsed = opts.schema.safeParse(json);
  if (!parsed.success) throw new AiError("The AI's answer didn't match the expected shape.");
  return { output: parsed.data, model };
}

// ---------------------------------------------------------------------- Groq

export type GroqToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type GroqMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: GroqToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
type GroqChoice = { finish_reason?: string; message?: { content?: string | null; refusal?: string | null; tool_calls?: GroqToolCall[] } };

// Groq plans cap tokens per minute (8,000 on the free tier). We learn the cap from response headers,
// wait for the window to reset before a request that wouldn't fit, and let callers size their work to it.
const limits = ((globalThis as { __rbAiLimits?: { tpm: number; remaining: number; resetAt: number } }).__rbAiLimits ??= {
  tpm: Number(process.env.AI_TOKENS_PER_MINUTE ?? 0),
  remaining: Infinity,
  resetAt: 0,
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_WAIT_MS = 65_000;

/** "22.5s", "1m3.2s" or plain seconds -> milliseconds. */
function durationMs(v: string | null): number {
  if (!v) return 0;
  const m = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?$/);
  if (m && (m[1] || m[2] || m[3])) return (Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) * 1000;
  return Number(v) * 1000 || 0;
}

function noteLimits(h: Headers) {
  const tpm = Number(h.get("x-ratelimit-limit-tokens"));
  if (tpm > 0 && !process.env.AI_TOKENS_PER_MINUTE) limits.tpm = tpm;
  const remaining = h.get("x-ratelimit-remaining-tokens");
  if (remaining !== null) {
    limits.remaining = Number(remaining);
    limits.resetAt = Date.now() + durationMs(h.get("x-ratelimit-reset-tokens"));
  }
}

/**
 * The provider's tokens-per-minute cap, or 0 when there is none we need to plan around (Claude, or a
 * Groq plan not yet seen). On Groq the first call of a process is a tiny probe that reads the cap.
 */
export async function tokensPerMinute(): Promise<number> {
  if (aiProvider() !== "groq") return 0;
  if (!limits.tpm) {
    await groqChat({ messages: [{ role: "user", content: "ok" }], max_completion_tokens: 1, reasoning_effort: "low" }).catch(() => {});
  }
  return limits.tpm;
}

/** One chat completion on Groq, paced to the plan's rate limit, with retries on 429 and server errors. */
export async function groqChat(body: Record<string, unknown>): Promise<{ choice: GroqChoice; model: string }> {
  const base = (process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");
  // Rough size of this request: prompt characters / 3.5, plus room for the answer.
  const estimate = Math.ceil(JSON.stringify(body.messages ?? "").length / 3.5) + Math.min(Number(body.max_completion_tokens ?? 2000), 2500);
  if (limits.tpm && estimate > limits.tpm) {
    throw new AiError(
      `This review needs about ${estimate.toLocaleString("en-US")} tokens in one request, but the AI plan allows ${limits.tpm.toLocaleString("en-US")} per minute. Use a higher Groq tier or a smaller report.`,
    );
  }
  let res: Response | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    // Not enough of this minute's allowance left: wait for it to reset instead of drawing a 429.
    if (estimate > limits.remaining && Date.now() < limits.resetAt) {
      await sleep(Math.min(limits.resetAt - Date.now() + 500, MAX_WAIT_MS));
    }
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ model: aiModel(), ...body }),
        signal: AbortSignal.timeout(240_000),
      });
    } catch (e) {
      // Network failure (dropped connection, DNS, timeout): back off and try again.
      const cause = (e as { cause?: { code?: string; message?: string } }).cause;
      const why = [(e as Error).message, cause?.code ?? cause?.message].filter(Boolean).join(": ");
      if (attempt === 4) throw new AiError(`The AI service could not be reached (${why}).`);
      await sleep(1500 * (attempt + 1));
      continue;
    }
    noteLimits(res.headers);
    // Rate limited: wait as long as the service asks (up to about a minute), then try again.
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const asked = durationMs(res.headers.get("retry-after")) || durationMs(res.headers.get("x-ratelimit-reset-tokens")) || 2000;
      await sleep(Math.min(asked + 500, MAX_WAIT_MS));
      limits.remaining = Infinity;
      continue;
    }
    break;
  }

  const j = (await res!.json().catch(() => ({}))) as { error?: { message?: string }; model?: string; choices?: GroqChoice[] };
  if (!res!.ok) {
    if (res!.status === 401) throw new AiError("The AI key was rejected. Check GROQ_API_KEY.");
    if (res!.status === 429) throw new AiError("The AI is rate-limited right now. Try again in a minute.");
    if (res!.status === 413) throw new AiError("The report and code were too large for the AI plan's per-minute limit.");
    throw new AiError(`The AI request failed (${res!.status}): ${j.error?.message ?? "unknown error"}`);
  }
  const choice = j.choices?.[0] ?? {};
  if (choice.message?.refusal) throw new AiError("The AI declined to review this content. A maintainer needs to look at it.");
  return { choice, model: j.model ?? aiModel() };
}

async function askGroq<S extends z.ZodType>(opts: Ask<S>): Promise<{ text: string; model: string }> {
  const { choice, model } = await groqChat({
    max_completion_tokens: opts.maxTokens ?? 16000,
    reasoning_effort: opts.effort ?? "high",
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    // Strict mode: the answer is guaranteed to match the schema.
    response_format: {
      type: "json_schema",
      json_schema: { name: opts.name, strict: true, schema: z.toJSONSchema(opts.schema) },
    },
  });
  if (choice.finish_reason === "length") throw new AiError("The AI's answer was cut off. Try again.");
  return { text: choice.message?.content ?? "", model };
}

// -------------------------------------------------------------------- Claude

let anthropicClient: Anthropic | null = null;

async function askClaude<S extends z.ZodType>(opts: Ask<S>): Promise<{ text: string; model: string }> {
  const client = (anthropicClient ??= new Anthropic({ maxRetries: 2, timeout: 240_000 }));
  let response;
  try {
    response = await client.beta.messages.create({
      model: aiModel(),
      max_tokens: opts.maxTokens ?? 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort ?? "high", format: zodOutputFormat(opts.schema) },
      // Security reports can trip the model's safety filters; let the API retry on a fallback model
      // instead of failing the whole triage.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("The AI key was rejected. Check ANTHROPIC_API_KEY.");
    if (e instanceof Anthropic.RateLimitError) throw new AiError("The AI is rate-limited right now. Try again in a minute.");
    if (e instanceof Anthropic.APIError) throw new AiError(`The AI request failed (${e.status ?? "network"}): ${e.message}`);
    throw e;
  }
  if (response.stop_reason === "refusal") {
    throw new AiError("The AI declined to review this content. A maintainer needs to look at it.");
  }
  if (response.stop_reason === "max_tokens") throw new AiError("The AI's answer was cut off. Try again.");
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return { text, model: response.model };
}
