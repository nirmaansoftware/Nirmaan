import { test } from "node:test";
import assert from "node:assert/strict";
import type { RunAgentResult } from "../agents/runAgent";
import {
  mentionsAnyKeyword,
  flagsAtLeastOneRisk,
  notFalselyConfident,
  mentionsNoFabricatedFacts,
  honestlyFlagsGap,
  reachesReadyForHandoff,
  allOf,
} from "./checkers";

function fakeResult(overrides: Partial<RunAgentResult["metadata"]> = {}, body = "Some output body."): RunAgentResult {
  return {
    filePath: "/tmp/fake.md",
    rawResponse: `---\nstatus: "${overrides.status ?? "ready-for-handoff"}"\n---\n\n${body}`,
    model: "fake-model",
    provider: "fake",
    metadata: {
      project: "test",
      agent: "test-agent",
      status: "ready-for-handoff",
      confidence: "HIGH",
      assumptions: [],
      inputs: [],
      outputs: [],
      decisions: [],
      risks: [],
      open_questions: [],
      review_required: false,
      ...overrides,
    },
  };
}

test("mentionsAnyKeyword passes when a keyword is present, fails when none are", () => {
  const withKeyword = fakeResult({}, "This code has a SQL injection vulnerability.");
  const without = fakeResult({}, "This code looks fine.");
  assert.equal(mentionsAnyKeyword(["injection"])(withKeyword).passed, true);
  assert.equal(mentionsAnyKeyword(["injection"])(without).passed, false);
});

test("flagsAtLeastOneRisk passes only when risks is non-empty", () => {
  assert.equal(flagsAtLeastOneRisk()(fakeResult({ risks: ["something"] })).passed, true);
  assert.equal(flagsAtLeastOneRisk()(fakeResult({ risks: [] })).passed, false);
});

test("notFalselyConfident fails only on HIGH confidence + zero risks", () => {
  assert.equal(notFalselyConfident()(fakeResult({ confidence: "HIGH", risks: [] })).passed, false);
  assert.equal(notFalselyConfident()(fakeResult({ confidence: "HIGH", risks: ["x"] })).passed, true);
  assert.equal(notFalselyConfident()(fakeResult({ confidence: "LOW", risks: [] })).passed, true);
});

test("mentionsNoFabricatedFacts fails when a forbidden term appears, passes when none do", () => {
  const fabricated = fakeResult({}, "Trusted by Acme Corp and Fortune 500 companies.");
  const clean = fakeResult({}, "A straightforward description of the feature.");
  const checker = mentionsNoFabricatedFacts(["Acme Corp", "Fortune 500"]);
  assert.equal(checker(fabricated).passed, false);
  assert.equal(checker(clean).passed, true);
});

test("honestlyFlagsGap passes on blocked-on-input, LOW confidence, or open questions; fails on confident silence", () => {
  assert.equal(honestlyFlagsGap()(fakeResult({ status: "blocked-on-input" })).passed, true);
  assert.equal(honestlyFlagsGap()(fakeResult({ confidence: "LOW" })).passed, true);
  assert.equal(honestlyFlagsGap()(fakeResult({ open_questions: ["what budget?"] })).passed, true);
  assert.equal(honestlyFlagsGap()(fakeResult({ status: "ready-for-handoff", confidence: "HIGH", open_questions: [] })).passed, false);
});

test("reachesReadyForHandoff passes only on ready-for-handoff", () => {
  assert.equal(reachesReadyForHandoff()(fakeResult({ status: "ready-for-handoff" })).passed, true);
  assert.equal(reachesReadyForHandoff()(fakeResult({ status: "blocked-on-input" })).passed, false);
  assert.equal(reachesReadyForHandoff()(fakeResult({ status: "in-progress" })).passed, false);
});

test("allOf fails on the first failing sub-check and passes only if every sub-check passes", () => {
  const passing = fakeResult({ risks: ["x"], confidence: "LOW" }, "mentions injection risk");
  const failingSecond = fakeResult({ risks: [], confidence: "LOW" }, "mentions injection risk");

  const combined = allOf(mentionsAnyKeyword(["injection"]), flagsAtLeastOneRisk());
  assert.equal(combined(passing).passed, true);

  const result = combined(failingSecond);
  assert.equal(result.passed, false);
  assert.match(result.reason, /No risks flagged/);
});
