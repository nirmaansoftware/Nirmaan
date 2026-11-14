import { test } from "node:test";
import assert from "node:assert/strict";
import { forbiddenIn, modelFamily, modelLabel, SNAPSHOT_VERSION } from "./snapshot";
import { sampleSnapshot } from "./sample";

test("the sample snapshot carries no forbidden field", () => {
  assert.deepEqual(forbiddenIn(sampleSnapshot()), []);
});

test("a forbidden field anywhere is caught (must-fail control)", () => {
  const leaked = { ...sampleSnapshot(), lanes: [{ id: "x", apiKey: "sk-..." }], extra: { nested: { Cost: 3 } } };
  assert.deepEqual(forbiddenIn(leaked).sort(), ["Cost", "apiKey"]);
});

test("the sample has the current version and says it is a sample", () => {
  const s = sampleSnapshot();
  assert.equal(s.version, SNAPSHOT_VERSION);
  assert.equal(s.source, "sample");
});

test("progress never claims more than its total", () => {
  for (const p of sampleSnapshot().progress) assert.ok(p.done + p.active <= p.total, p.id);
});

test("model names map to families and labels", () => {
  assert.equal(modelFamily("claude-fable-5-2"), "fable");
  assert.equal(modelFamily("claude-opus-5-5"), "opus");
  assert.equal(modelFamily("sonnet"), "sonnet");
  assert.equal(modelFamily("claude-haiku-5-5"), "haiku");
  assert.equal(modelFamily("gpt-x"), "other");
  assert.equal(modelLabel("claude-opus-5-5"), "Opus 5.5");
  assert.equal(modelLabel("claude-fable-5-2"), "Fable 5.2");
  assert.equal(modelLabel("opus"), "opus");
});
