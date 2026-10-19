export interface CompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  maxTokens: number;
}

export interface TokenUsage {
  /** Uncached input tokens only. Total input is this plus the two cache fields. */
  inputTokens: number;
  outputTokens: number;
  /** Input tokens served from the prompt cache. Undefined when the provider did not report the field (never a guessed 0). */
  cacheReadInputTokens?: number;
  /** Input tokens written to the prompt cache on this call. Undefined when the provider did not report the field. */
  cacheCreationInputTokens?: number;
}

export interface CompletionResult {
  text: string;
  provider: string;
  model: string;
  /** Real usage reported by the provider, when it reports one. Undefined — never a guessed number — if the provider doesn't report usage (e.g. MockProvider). See src/lib/ai/costs/ for what turns this into a dollar estimate. */
  usage?: TokenUsage;
  /** Real, provider-reported USD cost for this exact call, when the provider tells us directly (the claude CLI's total_cost_usd — see providers/claudeCodeCli.ts). More accurate than costs/estimateCost.ts's pricing-table guess; dispatch.ts prefers this when present. */
  costUsd?: number;
}

/**
 * Every model provider (Anthropic, or any future one) implements this one
 * method. Nothing outside this file and its implementations should know
 * which vendor is actually being called — that's the point of the model
 * routing abstraction (see /docs/history/agency-os-plan.md Section K).
 */
export interface ModelProvider {
  complete(req: CompletionRequest): Promise<CompletionResult>;
}
