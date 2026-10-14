import { test } from "node:test";
import assert from "node:assert/strict";
import { clientProgress, nextStage } from "./progress";

test("client progress: 0% at approval, 100% once live, phases in order", () => {
  const start = clientProgress("APPROVED");
  assert.equal(start.percent, 0);
  assert.deepEqual(start.phases.map((p) => p.state), ["current", "todo", "todo", "todo", "todo"]);

  const testing = clientProgress("QA");
  assert.deepEqual(testing.phases.map((p) => p.state), ["done", "done", "done", "current", "todo"]);
  assert.ok(testing.percent > 50 && testing.percent < 100);

  const live = clientProgress("MONITORING");
  assert.equal(live.percent, 100);
  assert.equal(live.live, true);
  assert.ok(live.phases.every((p) => p.state === "done"));
});

test("client progress never leaks internal stage names", () => {
  for (const stage of ["PLANNING", "SECURITY_REVIEW", "ARCHITECTURE"]) {
    const p = clientProgress(stage);
    assert.doesNotMatch(`${p.milestone} ${p.nextAction}`, /SECURITY_REVIEW|ARCHITECTURE|gate/i);
  }
});

test("nextStage walks the lifecycle and stops at the end", () => {
  assert.equal(nextStage("APPROVED"), "PLANNING");
  assert.equal(nextStage("MAINTENANCE"), null);
  assert.equal(nextStage("NOT_A_STAGE"), null);
});
