import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db/client";
import { getProjectActivitySummary } from "./projectSummary";
import { seedFixtureProject, seedFixtureTask, cleanupFixtureProject } from "../testHelpers/fixtureProject";

test("getProjectActivitySummary aggregates task/approval counts and parses cost from Event messages", async () => {
  const project = await seedFixtureProject({ stage: "IMPLEMENTATION" });
  try {
    await seedFixtureTask(project.id, "frontend-engineer", "Task 1");
    const task2 = await seedFixtureTask(project.id, "backend-engineer", "Task 2");
    await prisma.task.update({ where: { id: task2.id }, data: { status: "DONE" } });

    await prisma.approval.create({ data: { projectId: project.id, gate: "IMPLEMENTATION", status: "PENDING", requestedBy: "backend-engineer" } });
    await prisma.approval.create({ data: { projectId: project.id, gate: "ARCHITECTURE", status: "APPROVED", requestedBy: "principal-architect", decidedBy: "human", decidedAt: new Date() } });

    await prisma.event.create({ data: { projectId: project.id, message: "backend-engineer completed with status=ready-for-handoff, confidence=HIGH, ~$0.0123 (500 in / 200 out tokens, claude-sonnet-5)." } });
    await prisma.event.create({ data: { projectId: project.id, message: "frontend-engineer completed with status=ready-for-handoff, confidence=HIGH, ~$0.0050 (300 in / 100 out tokens, claude-sonnet-5)." } });
    await prisma.event.create({ data: { projectId: project.id, message: "qa-engineer completed with status=ready-for-handoff, confidence=MEDIUM, cost unknown (provider reported no usage)." } });
    await prisma.event.create({ data: { projectId: project.id, message: "Dispatched task \"Task 1\" to frontend-engineer." } }); // not a completion line, must be ignored for cost purposes

    const summary = await getProjectActivitySummary(project.id);

    assert.equal(summary.stage, "IMPLEMENTATION");
    assert.equal(summary.taskCountsByStatus.READY, 1);
    assert.equal(summary.taskCountsByStatus.DONE, 1);
    assert.equal(summary.approvalCountsByStatus.PENDING, 1);
    assert.equal(summary.approvalCountsByStatus.APPROVED, 1);
    assert.equal(summary.pendingApprovals, 1);
    assert.ok(Math.abs(summary.estimatedSpendUsd - 0.0173) < 1e-9);
    assert.equal(summary.pricedDispatchCount, 2);
    assert.equal(summary.unpricedDispatchCount, 1);
  } finally {
    await cleanupFixtureProject(project.id);
  }
});

test("getProjectActivitySummary returns zeroed-out counts for a project with no activity yet", async () => {
  const project = await seedFixtureProject();
  try {
    const summary = await getProjectActivitySummary(project.id);
    assert.deepEqual(summary.taskCountsByStatus, {});
    assert.deepEqual(summary.approvalCountsByStatus, {});
    assert.equal(summary.pendingApprovals, 0);
    assert.equal(summary.estimatedSpendUsd, 0);
  } finally {
    await cleanupFixtureProject(project.id);
  }
});
