/**
 * Per-model USD pricing, per million tokens. This table needs manual
 * updates when pricing changes or new models are added to
 * lib/ai/router.ts — there's no way to fetch it automatically, and
 * guessing would be worse than an honest "unknown model" result. Prices
 * as of this writing; verify against the current provider pricing page
 * before trusting a cost estimate for anything that matters.
 */
export interface ModelPricing {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

const ANTHROPIC_PRICING: Record<string, ModelPricing> = {
  "claude-opus-5": { inputPerMillionUsd: 15, outputPerMillionUsd: 75 },
  "claude-sonnet-5": { inputPerMillionUsd: 3, outputPerMillionUsd: 15 },
  "claude-haiku-4-5-20251001": { inputPerMillionUsd: 1, outputPerMillionUsd: 5 },
};

export function pricingForModel(model: string): ModelPricing | null {
  return ANTHROPIC_PRICING[model] ?? null;
}
