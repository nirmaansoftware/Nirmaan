import { test } from "node:test";
import assert from "node:assert/strict";
import { busyMap, laneOwner, modelPersona, overallStatus, plural, stageText } from "./plain";
import { sampleSnapshot } from "./sample";
import type { Health } from "./snapshot";

const h = (id: string, status: Health["status"]): Health => ({ id, label: id, status, detail: "d", since: "2026-01-01T00:00:00Z" });

test("models get a plain name and persona", () => {
  assert.deepEqual(modelPersona("claude-fable-5-2"), { name: "Fable 5.2", persona: "strategist", family: "fable" });
  assert.equal(modelPersona("claude-haiku-5-5").persona, "assistant");
});

test("review stages read as plain words, with no key numbers", () => {
  assert.equal(stageText("key1"), "First review");
  assert.equal(stageText("needs-founder"), "Needs your approval");
});

test("the company status: stopped beats paused beats warnings beats fine", () => {
  assert.equal(overallStatus([h("a", "ok")]).tone, "good");
  assert.equal(overallStatus([h("a", "warn")]).tone, "warn");
  assert.equal(overallStatus([h("orchestrator", "paused"), h("a", "warn")]).headline, "Work is paused");
  assert.equal(overallStatus([h("orchestrator", "paused"), h("b", "down")]).tone, "bad");
});

test("each working lane belongs to a person; unknown roles go to the orchestrator", () => {
  const s = sampleSnapshot();
  const people = s.people ?? [];
  assert.equal(laneOwner(s.lanes[0], people).id, "ai-engineer");
  assert.equal(laneOwner({ ...s.lanes[0], role: "nobody-here" }, people).id, "orchestrator");
  const busy = busyMap(s);
  assert.ok(busy.has("ai-engineer"));
  assert.ok(!busy.has("chair"));
});

test("plurals", () => {
  assert.equal(plural(1, "task"), "1 task");
  assert.equal(plural(3, "person is", "people are"), "3 people are");
});
