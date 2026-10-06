// Thin wrapper around the Anthropic SDK: one place for model choice, caching, usage and cost.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { RunUsage } from "./types";

export const MODEL = process.env.CROSSCHECK_MODEL ?? "claude-opus-5-5";

// USD per million tokens (claude-opus-5-5). Update if MODEL changes.
const PRICE = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 };

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local or use Demo replay mode.");
  }
  client ??= new Anthropic();
  return client;
}

export function emptyUsage(): RunUsage {
  return { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
}

export function addUsage(a: RunUsage, b: RunUsage): RunUsage {
  return {
    calls: a.calls + b.calls,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    costUsd: a.costUsd + b.costUsd,
  };
}

/**
 * One structured call. `system` is the stable, cacheable prefix (instructions + documents);
 * `task` is the per-call instruction. Returns the parsed object plus usage.
 */
export async function ask<T extends z.ZodType>(opts: {
  system: string[];
  task: string;
  schema: T;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<{ data: z.infer<T>; usage: RunUsage }> {
  const response = await getClient().messages.parse({
    model: MODEL,
    // Thinking counts against max_tokens; 20k leaves headroom and stays under the SDK's non-streaming limit.
    max_tokens: opts.maxTokens ?? 20000,
    system: opts.system.map((text, i) => ({
      type: "text" as const,
      text,
      // Cache breakpoint after the last system block (documents), shared across calls in a run.
      ...(i === opts.system.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {}),
    })),
    messages: [{ role: "user", content: opts.task }],
    output_config: { effort: opts.effort ?? "medium", format: zodOutputFormat(opts.schema) },
  });

  if (response.stop_reason === "refusal") throw new Error("Claude declined this request.");
  if (response.stop_reason === "max_tokens") throw new Error("Response was truncated (max_tokens).");
  if (!response.parsed_output) throw new Error("Claude's response did not match the expected schema.");

  const u = response.usage;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const costUsd =
    (u.input_tokens * PRICE.input +
      cacheWrite * PRICE.cacheWrite +
      cacheRead * PRICE.cacheRead +
      u.output_tokens * PRICE.output) /
    1_000_000;

  return {
    data: response.parsed_output as z.infer<T>,
    usage: {
      calls: 1,
      inputTokens: u.input_tokens + cacheWrite + cacheRead,
      outputTokens: u.output_tokens,
      costUsd,
    },
  };
}
