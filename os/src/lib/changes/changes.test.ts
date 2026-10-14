import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db/client";
import { assessChangeRequest, convertInScope, createChangeRequest, decideChangeRequest } from "./service";
import { FOUNDER, actorAs, cleanupProjectGraph } from "../testHelpers/businessFixtures";
import { seedFixtureProject } from "../testHelpers/fixtureProject";

test("in-scope requests become a coded task; out-of-scope work must be priced and approved", async () => {
  const project = await seedFixtureProject({ stage: "IMPLEMENTATION" });
  const pm = actorAs("PROJECT_MANAGER");
  try {
    const inScope = await createChangeRequest(pm, project.id, { requestedBy: "Client", description: "Rename the 'Pending' column to 'Waiting on customer'." });
    assert.match(inScope.code, /^CR-\d{3,}$/);
    await assessChangeRequest(pm, inScope.id, { inScope: true, impact: "Label change only.", costDelta: 0, timelineDelta: 0 });
    const converted = await convertInScope(pm, inScope.id);
    assert.equal(converted.status, "CONVERTED");
    const task = await prisma.task.findUniqueOrThrow({ where: { id: converted.taskId! } });
    assert.match(task.code!, /^TASK-\d{3,}$/);

    const outOfScope = await createChangeRequest(pm, project.id, { requestedBy: "Client", description: "Add a customer-facing mobile app for order tracking." });
    await assert.rejects(
      () => assessChangeRequest(pm, outOfScope.id, { inScope: false, impact: "New app", costDelta: 0, timelineDelta: 0 }),
      /free work/
    );
    await assessChangeRequest(pm, outOfScope.id, { inScope: false, impact: "New mobile client and API auth.", costDelta: 120_000, timelineDelta: 30 });
    await assert.rejects(() => convertInScope(pm, outOfScope.id), /in-scope/);
    await assert.rejects(() => decideChangeRequest(pm, outOfScope.id, "APPROVED"), /permission/, "a PM can't accept cost impact");
    const approved = await decideChangeRequest(FOUNDER, outOfScope.id, "APPROVED");
    assert.equal(approved.status, "APPROVED");
    assert.ok(approved.taskId);
    assert.equal(approved.costDelta, 120_000);
  } finally {
    await cleanupProjectGraph(project.id);
  }
});
