import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateCostUsd } from "@/lib/ai/costs/estimateCost";

test("estimateCostUsd computes the correct dollar amount for a priced model", () => {
  // claude-sonnet-5: $3/M input, $15/M output
  const estimate = estimateCostUsd("claude-sonnet-5", { inputTokens: 1_000_000, outputTokens: 1_000_000 });
  assert.equal(estimate.priced, true);
  assert.equal(estimate.usd, 18); // 3 + 15
});

test("estimateCostUsd scales correctly for realistic token counts", () => {
  const estimate = estimateCostUsd("claude-haiku-4-5-20251001", { inputTokens: 2000, outputTokens: 500 });
  // $1/M in, $5/M out -> (2000/1e6)*1 + (500/1e6)*5 = 0.002 + 0.0025 = 0.0045
  assert.ok(Math.abs(estimate.usd - 0.0045) < 1e-9);
});

test("estimateCostUsd returns priced:false and usd:0 for an unknown model, never a guess", () => {
  const estimate = estimateCostUsd("some-future-model-not-in-the-table", { inputTokens: 1000, outputTokens: 1000 });
  assert.equal(estimate.priced, false);
  assert.equal(estimate.usd, 0);
});
