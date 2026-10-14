import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db/client";
import { decideGate, moveToNextStage, requestGate, issueStatusLink, projectForStatusToken } from "./service";
import { FOUNDER, actorAs, cleanupProjectGraph } from "../testHelpers/businessFixtures";
import { seedFixtureProject } from "../testHelpers/fixtureProject";

test("stage moves: ungated moves directly, gated waits for a real, permitted decision", async () => {
  const project = await seedFixtureProject({ stage: "APPROVED" });
  const pm = actorAs("PROJECT_MANAGER", "Priya (PM)");
  try {
    assert.equal((await moveToNextStage(pm, project.id)).stage, "PLANNING");
    await assert.rejects(() => moveToNextStage(pm, project.id), /Can't move on yet: No PLAN approval/, "PLANNING → DESIGN needs the PLAN gate");

    const approval = await requestGate(pm, project.id, "PLAN");
    await assert.rejects(() => requestGate(pm, project.id, "PLAN"), /already waiting/);
    await assert.rejects(() => decideGate(pm, approval.id, "APPROVED"), /permission/);
    await decideGate(FOUNDER, approval.id, "APPROVED");
    const after = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    assert.equal(after.stage, "DESIGN", "approving the blocking gate advances the project");
    const decided = await prisma.approval.findUniqueOrThrow({ where: { id: approval.id } });
    assert.equal(decided.decidedBy, "Test founder", "attributed to a person, not 'human'");
    await assert.rejects(() => decideGate(FOUNDER, approval.id, "REJECTED"), /already made/);
  } finally {
    await cleanupProjectGraph(project.id);
  }
});

test("status links: a fresh link replaces the old one and exposes no internal fields", async () => {
  const project = await seedFixtureProject({ stage: "QA" });
  try {
    const first = await issueStatusLink(FOUNDER, project.id);
    const second = await issueStatusLink(FOUNDER, project.id);
    assert.equal(await projectForStatusToken(first.token), null);
    const view = await projectForStatusToken(second.token);
    assert.equal(view?.stage, "QA");
    assert.deepEqual(Object.keys(view!).sort(), ["client", "code", "invoices", "name", "stage", "updatedAt"]);
    // Only sent invoices, and only what a client needs: no internal ids or drafts.
    for (const inv of view!.invoices) {
      assert.deepEqual(Object.keys(inv).sort(), ["code", "dueDate", "label", "paidAt", "payments", "status", "total"]);
      assert.notEqual(inv.status, "DRAFT");
    }
  } finally {
    await cleanupProjectGraph(project.id);
  }
});
