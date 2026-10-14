import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db/client";
import { checkGate, advanceProjectStage, tryAdvanceAfterApproval } from "./qualityGates";
import { seedFixtureProject, cleanupFixtureProject } from "../testHelpers/fixtureProject";

test("checkGate reports blocked when no approval exists for the current gate", async () => {
  const project = await seedFixtureProject({ stage: "REQUIREMENTS" });
  try {
    const check = await checkGate(project.id);
    assert.equal(check.canAdvance, false);
    assert.equal(check.gate, "REQUIREMENTS");
    assert.equal(check.nextStage, "PLANNING");
    assert.match(check.reason, /No REQUIREMENTS approval has been requested/);
  } finally {
    await cleanupFixtureProject(project.id);
  }
});

test("checkGate reports blocked when the approval is still PENDING", async () => {
  const project = await seedFixtureProject({ stage: "DESIGN" });
  try {
    await prisma.approval.create({
      data: { projectId: project.id, gate: "DESIGN", status: "PENDING", requestedBy: "ux-designer" },
    });
    const check = await checkGate(project.id);
    assert.equal(check.canAdvance, false);
    assert.match(check.reason, /pending/);
  } finally {
    await cleanupFixtureProject(project.id);
  }
});

test("checkGate reports blocked when the approval was REJECTED", async () => {
  const project = await seedFixtureProject({ stage: "ARCHITECTURE" });
  try {
    await prisma.approval.create({
      data: {
        projectId: project.id,
        gate: "ARCHITECTURE",
        status: "REJECTED",
        requestedBy: "principal-architect",
        decidedBy: "human",
        decidedAt: new Date(),
      },
    });
    const check = await checkGate(project.id);
    assert.equal(check.canAdvance, false);
    assert.match(check.reason, /rejected/);
  } finally {
    await cleanupFixtureProject(project.id);
  }
});

test("checkGate reports advanceable once the gate is APPROVED", async () => {
  const project = await seedFixtureProject({ stage: "IMPLEMENTATION" });
  try {
    await prisma.approval.create({
      data: {
        projectId: project.id,
        gate: "IMPLEMENTATION",
        status: "APPROVED",
        requestedBy: "backend-engineer",
        decidedBy: "human",
        decidedAt: new Date(),
      },
    });
    const check = await checkGate(project.id);
    assert.equal(check.canAdvance, true);
    assert.equal(check.nextStage, "QA");
  } finally {
    await cleanupFixtureProject(project.id);
  }
});

test("checkGate reports no gate for a stage that isn't one of the gated transitions", async () => {
  const project = await seedFixtureProject({ stage: "MONITORING" });
  try {
    const check = await checkGate(project.id);
    assert.equal(check.canAdvance, false);
    assert.equal(check.gate, null);
    assert.match(check.reason, /no defined quality gate/);
  } finally {
    await cleanupFixtureProject(project.id);
  }
});

test("advanceProjectStage throws when the gate isn't approved, and does not mutate the project", async () => {
  const project = await seedFixtureProject({ stage: "QA" });
  try {
    await assert.rejects(() => advanceProjectStage(project.id), /Cannot advance project/);
    const unchanged = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    assert.equal(unchanged.stage, "QA");
  } finally {
    await cleanupFixtureProject(project.id);
  }
});

test("advanceProjectStage updates the stage and logs an event when the gate is approved", async () => {
  const project = await seedFixtureProject({ stage: "SECURITY_REVIEW" });
  try {
    await prisma.approval.create({
      data: {
        projectId: project.id,
        gate: "PRODUCTION",
        status: "APPROVED",
        requestedBy: "security-engineer",
        decidedBy: "human",
        decidedAt: new Date(),
      },
    });

    const { project: updated, event } = await advanceProjectStage(project.id);
    assert.equal(updated.stage, "DEPLOYMENT");
    assert.match(event.message, /Advanced from SECURITY_REVIEW to DEPLOYMENT/);

    const persisted = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    assert.equal(persisted.stage, "DEPLOYMENT");
  } finally {
    await cleanupFixtureProject(project.id);
  }
});

test("tryAdvanceAfterApproval is a no-op when the approved gate isn't the one currently blocking the project", async () => {
  const project = await seedFixtureProject({ stage: "REQUIREMENTS" });
  try {
    // Approve a DESIGN gate on a project that's still stuck on REQUIREMENTS (no requirements approval at all).
    await prisma.approval.create({
      data: { projectId: project.id, gate: "DESIGN", status: "APPROVED", requestedBy: "ux-designer", decidedBy: "human", decidedAt: new Date() },
    });

    const result = await tryAdvanceAfterApproval(project.id, "DESIGN");
    assert.equal(result, null);

    const unchanged = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    assert.equal(unchanged.stage, "REQUIREMENTS");
  } finally {
    await cleanupFixtureProject(project.id);
  }
});

test("tryAdvanceAfterApproval advances when the approved gate is what's currently blocking the project", async () => {
  const project = await seedFixtureProject({ stage: "REQUIREMENTS" });
  try {
    await prisma.approval.create({
      data: { projectId: project.id, gate: "REQUIREMENTS", status: "APPROVED", requestedBy: "product-manager", decidedBy: "human", decidedAt: new Date() },
    });

    const result = await tryAdvanceAfterApproval(project.id, "REQUIREMENTS");
    assert.ok(result);
    assert.equal(result!.project.stage, "PLANNING");
  } finally {
    await cleanupFixtureProject(project.id);
  }
});
