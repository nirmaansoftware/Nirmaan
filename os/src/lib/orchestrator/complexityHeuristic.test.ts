import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateComplexity, adjustModelForComplexity, MODEL_TIERS } from "./complexityHeuristic";

test("estimateComplexity returns 0 for plain, neutral text (no keyword signals, neutral length)", () => {
  const text =
    "Update the homepage hero copy to mention our new pricing tier. The current headline focuses on the old plan names, which we retired last month, so please swap in the new tier names and adjust the supporting subtext to match the updated messaging the marketing team approved.";
  const result = estimateComplexity(text);
  assert.equal(result.adjustment, 0);
});

test("estimateComplexity returns +1 when complexity-signaling keywords are present", () => {
  const result = estimateComplexity(
    "Design a multi-tenant architecture with SSO and an audit trail, migrating off the legacy system, ensuring high availability across multi-region deployments for SOC 2 compliance."
  );
  assert.equal(result.adjustment, 1);
  assert.ok(result.reasons.length > 0);
});

test("estimateComplexity returns -1 when simplicity-signaling keywords are present", () => {
  const result = estimateComplexity("Just a simple one-page static site, no backend, no database, no CMS needed.");
  assert.equal(result.adjustment, -1);
  assert.ok(result.reasons.length > 0);
});

test("estimateComplexity returns -1 for a very short input even with no keyword signal", () => {
  const result = estimateComplexity("Fix the typo in the footer.");
  assert.equal(result.adjustment, -1);
  assert.ok(result.reasons.some((r) => r.includes("short input")));
});

test("estimateComplexity returns +1 for a very long, detailed input even with no keyword signal", () => {
  const longText = Array(220).fill("word").join(" ");
  const result = estimateComplexity(longText);
  assert.equal(result.adjustment, 1);
  assert.ok(result.reasons.some((r) => r.includes("long input")));
});

test("estimateComplexity nets up/down signals against each other rather than just counting hits", () => {
  // 2 up-signals (sso, compliance), 2 down-signals (simple, straightforward),
  // 38 words (inside the neutral length range, so length doesn't interfere) -> net 0
  const text =
    "This project is simple in most respects, straightforward really, however the client also explicitly wants SSO added for compliance reasons which the team must not forget to implement carefully throughout the build process from start to finish always.";
  const result = estimateComplexity(text);
  assert.equal(result.adjustment, 0);
});

test("adjustModelForComplexity steps up one tier", () => {
  assert.equal(adjustModelForComplexity("claude-sonnet-5", 1), "claude-opus-5");
  assert.equal(adjustModelForComplexity("claude-haiku-4-5-20251001", 1), "claude-sonnet-5");
});

test("adjustModelForComplexity steps down one tier", () => {
  assert.equal(adjustModelForComplexity("claude-sonnet-5", -1), "claude-haiku-4-5-20251001");
  assert.equal(adjustModelForComplexity("claude-opus-5", -1), "claude-sonnet-5");
});

test("adjustModelForComplexity clamps at the top and bottom tiers rather than erroring", () => {
  assert.equal(adjustModelForComplexity("claude-opus-5", 1), "claude-opus-5");
  assert.equal(adjustModelForComplexity("claude-haiku-4-5-20251001", -1), "claude-haiku-4-5-20251001");
});

test("adjustModelForComplexity leaves an unrecognized model completely unchanged", () => {
  assert.equal(adjustModelForComplexity("some-future-model", 1), "some-future-model");
  assert.equal(adjustModelForComplexity("some-future-model", -1), "some-future-model");
});

test("adjustModelForComplexity is a no-op for adjustment 0", () => {
  assert.equal(adjustModelForComplexity("claude-sonnet-5", 0), "claude-sonnet-5");
});

test("MODEL_TIERS is ordered cheapest to most capable", () => {
  assert.deepEqual(MODEL_TIERS, ["claude-haiku-4-5-20251001", "claude-sonnet-5", "claude-opus-5"]);
});
