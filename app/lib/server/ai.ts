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

async function askGroq<S extends z.ZodType>(opts: Ask<S>): Promise<{ text: string; model: string }> {
  const base = (process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");
  const body = {
    model: aiModel(),
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
  };

  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(240_000),
      });
    } catch (e) {
      if (attempt === 2) throw new AiError(`Couldn't reach the AI service: ${(e as Error).message}`);
      continue;
    }
    // Retry rate limits and server errors, with a short wait.
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      const wait = Math.min(Number(res.headers.get("retry-after") ?? 2) * 1000, 20_000);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    break;
  }

  const j = (await res!.json().catch(() => ({}))) as {
    error?: { message?: string };
    model?: string;
    choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
  };
  if (!res!.ok) {
    if (res!.status === 401) throw new AiError("The AI key was rejected. Check GROQ_API_KEY.");
    if (res!.status === 429) throw new AiError("The AI is rate-limited right now. Try again in a minute.");
    if (res!.status === 413) throw new AiError("The report and code were too large for the AI model.");
    throw new AiError(`The AI request failed (${res!.status}): ${j.error?.message ?? "unknown error"}`);
  }
  const choice = j.choices?.[0];
  if (choice?.message?.refusal) throw new AiError("The AI declined to review this content. A maintainer needs to look at it.");
  if (choice?.finish_reason === "length") throw new AiError("The AI's answer was cut off. Try again.");
  return { text: choice?.message?.content ?? "", model: j.model ?? body.model };
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
