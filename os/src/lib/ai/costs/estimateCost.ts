import { pricingForModel } from "@/lib/ai/costs/pricing";
import type { TokenUsage } from "@/lib/ai/providers/types";

export interface CostEstimate {
  usd: number;
  model: string;
  usage: TokenUsage;
  /** false when the model isn't in pricing.ts — the estimate is then 0 and should not be trusted or summed into a budget total. */
  priced: boolean;
}

/**
 * Turns real usage (from CompletionResult.usage — never a guess) into a
 * dollar estimate. Returns priced: false rather than throwing when a
 * model isn't in the pricing table, since a new model existing is
 * expected (routes get added in lib/ai/router.ts) and shouldn't crash a
 * dispatch — it should just make clear the resulting number isn't real.
 */
export function estimateCostUsd(model: string, usage: TokenUsage): CostEstimate {
  const pricing = pricingForModel(model);
  if (!pricing) {
    return { usd: 0, model, usage, priced: false };
  }
  const usd =
    (usage.inputTokens / 1_000_000) * pricing.inputPerMillionUsd +
    (usage.outputTokens / 1_000_000) * pricing.outputPerMillionUsd;
  return { usd, model, usage, priced: true };
}
