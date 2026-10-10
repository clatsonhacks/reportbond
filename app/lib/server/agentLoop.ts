// A bounded tool loop: the model investigates with the tools it is given, then writes its findings.
// The loop decides nothing by itself; callers turn the findings into a structured answer afterwards.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AiError, aiModel, aiProvider, groqChat, modelsFor, type GroqMessage } from "./ai";

export type AgentTool = {
  name: string;
  description: string;
  /** JSON Schema for the arguments (an object schema). */
  parameters: Record<string, unknown>;
  /** Returns text for the model. Throw an Error to report a failure to the model without ending the loop. */
  run(args: Record<string, unknown>): Promise<string>;
};

/** One tool call the model made, kept for the audit log. */
export type AgentStep = { tool: string; input: string; ok: boolean; note: string; /** Internal: identifies a repeated call. */ key?: string };

type Options = {
  system: string;
  user: string;
  tools: AgentTool[];
  /** How many times the model may come back with tool calls. */
  maxRounds?: number;
  /** Total tool calls across all rounds. */
  maxCalls?: number;
  effort?: "low" | "medium" | "high";
  /** Longest tool result passed back to the model, in characters. */
  maxResultChars?: number;
  /** Steps already done for the model (e.g. a playbook given up front). They appear first in the log, and asking for them again is answered as a repeat. */
  seedSteps?: AgentStep[];
};

const MAX_RESULT_CHARS = 12_000;
const WRAP_UP = "You have used your investigation budget. Do not call more tools. Write your findings now.";

async function execute(tools: AgentTool[], name: string, rawArgs: unknown, steps: AgentStep[], cap = MAX_RESULT_CHARS): Promise<string> {
  // The same call twice returns the same thing: say so instead of spending the budget again.
  const key = `${name} ${typeof rawArgs === "string" ? rawArgs.replace(/\s+/g, "") : JSON.stringify(rawArgs ?? {})}`;
  if (steps.some((s) => s.key === key)) {
    return "You already made this exact call. Use the earlier result, or try something different.";
  }
  const tool = tools.find((t) => t.name === name);
  let args: Record<string, unknown> = {};
  let text: string;
  let ok = true;
  try {
    args = typeof rawArgs === "string" ? (rawArgs.trim() ? JSON.parse(rawArgs) : {}) : ((rawArgs as Record<string, unknown>) ?? {});
    if (!tool) throw new Error(`There is no tool named ${name}.`);
    text = await tool.run(args);
  } catch (e) {
    ok = false;
    text = `Error: ${(e as Error).message}`;
  }
  if (text.length > cap) text = `${text.slice(0, cap)}\n[... truncated; ask for a narrower range ...]`;
  steps.push({ tool: name, input: JSON.stringify(args).slice(0, 200), ok, note: text.split("\n")[0].slice(0, 160), key });
  return text;
}

export async function investigate(opts: Options): Promise<{ notes: string; steps: AgentStep[]; model: string }> {
  const provider = aiProvider();
  if (!provider) throw new AiError("The AI isn't set up on this server (no GROQ_API_KEY or ANTHROPIC_API_KEY).");
  return provider === "groq" ? investigateGroq(opts) : investigateClaude(opts);
}

// ---------------------------------------------------------------------- Groq

async function investigateGroq(opts: Options): Promise<{ notes: string; steps: AgentStep[]; model: string }> {
  const maxRounds = opts.maxRounds ?? 8;
  const maxCalls = (opts.maxCalls ?? 24) + (opts.seedSteps?.length ?? 0);
  const tools = opts.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
  const messages: GroqMessage[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];
  const steps: AgentStep[] = [...(opts.seedSteps ?? [])];
  let model = aiModel();
  const models = modelsFor("investigate");

  // What the tools returned, kept so the final answer can be asked for in a clean request.
  const transcript: string[] = [];

  for (let round = 0; ; round++) {
    if (round >= maxRounds || steps.length >= maxCalls) {
      // Out of budget. Ask for the findings in a fresh request with no tools in it: with tools still
      // on offer, models sometimes try one more call, which the API rejects.
      const res = await groqChat(
        {
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
          { role: "user", content: `What your tools returned:\n\n${transcript.join("\n\n")}\n\n${WRAP_UP}` },
        ],
        reasoning_effort: opts.effort ?? "high",
        max_completion_tokens: 3000,
        },
        models,
      );
      return { notes: (res.choice.message?.content ?? "").trim(), steps, model: res.model };
    }

    const res = await groqChat({ messages, tools, tool_choice: "auto", reasoning_effort: opts.effort ?? "high", max_completion_tokens: 3000 }, models);
    model = res.model;
    const msg = res.choice.message ?? {};
    const calls = msg.tool_calls ?? [];
    if (!calls.length) return { notes: (msg.content ?? "").trim(), steps, model };

    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });
    for (const call of calls) {
      const result =
        steps.length >= maxCalls
          ? "Error: tool budget used up."
          : await execute(opts.tools, call.function.name, call.function.arguments, steps, opts.maxResultChars);
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
      transcript.push(`${call.function.name} ${call.function.arguments}:\n${result}`);
    }
  }
}

// -------------------------------------------------------------------- Claude

let anthropicClient: Anthropic | null = null;

async function investigateClaude(opts: Options): Promise<{ notes: string; steps: AgentStep[]; model: string }> {
  const client = (anthropicClient ??= new Anthropic({ maxRetries: 2, timeout: 240_000 }));
  const maxRounds = opts.maxRounds ?? 8;
  const maxCalls = (opts.maxCalls ?? 24) + (opts.seedSteps?.length ?? 0);
  const tools: Anthropic.Tool[] = opts.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Tool["input_schema"],
  }));
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.user }];
  const steps: AgentStep[] = [...(opts.seedSteps ?? [])];

  for (let round = 0; ; round++) {
    const outOfBudget = round >= maxRounds || steps.length >= maxCalls;
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: aiModel(),
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: opts.effort ?? "high" },
        system: opts.system,
        tools,
        tool_choice: outOfBudget ? { type: "none" } : { type: "auto" },
        messages,
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
    const calls = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || !calls.length) {
      const notes = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      return { notes, steps, model: response.model };
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      const before = steps.length;
      const text =
        steps.length >= maxCalls ? "Error: tool budget used up." : await execute(opts.tools, call.name, call.input, steps, opts.maxResultChars);
      const failed = steps.length > before ? !steps[steps.length - 1].ok : true;
      results.push({ type: "tool_result", tool_use_id: call.id, content: text, is_error: failed });
    }
    const wrapUp = round + 1 >= maxRounds || steps.length >= maxCalls;
    // All tool results go back in one user message; the wrap-up note follows them.
    messages.push({ role: "user", content: wrapUp ? [...results, { type: "text", text: WRAP_UP }] : results });
  }
}
