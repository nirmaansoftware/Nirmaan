import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db/client";
import { addFeature, addTask, addTestCase, link, recordDeployment, recordEvidence, relationBetween, traceMatrix, upstreamRequirements } from "./service";
import { nextCode } from "../ids";
import { FOUNDER, actorAs, cleanupProjectGraph } from "../testHelpers/businessFixtures";
import { seedFixtureProject } from "../testHelpers/fixtureProject";

test("relationBetween only allows REQ → FEAT → TASK → TEST → DEPLOY", () => {
  assert.equal(relationBetween("REQ-001", "FEAT-001"), "SATISFIED_BY");
  assert.equal(relationBetween("FEAT-001", "TASK-001"), "IMPLEMENTED_BY");
  assert.equal(relationBetween("REQ-001", "TEST-001"), "VERIFIED_BY");
  assert.equal(relationBetween("TASK-001", "DEPLOY-001"), "SHIPPED_IN");
  assert.equal(relationBetween("REQ-001", "TASK-001"), null);
  assert.equal(relationBetween("TEST-001", "REQ-001"), null);
  assert.equal(relationBetween("REQ-001", "nonsense"), null);
});

test("trace matrix: gaps close one by one as the chain is built and proven", async () => {
  const project = await seedFixtureProject({ stage: "IMPLEMENTATION" });
  try {
    const req = await prisma.requirement.create({
      data: { code: await nextCode("REQ"), projectId: project.id, kind: "FUNCTIONAL", statement: "Customer can export invoices as PDF.", status: "APPROVED" },
    });
    await prisma.requirement.create({
      data: { code: await nextCode("REQ"), projectId: project.id, kind: "FUNCTIONAL", statement: "A native mobile app.", priority: "WONT", status: "APPROVED" },
    });
    const rows = await traceMatrix(project.id);
    assert.equal(rows.length, 1, "WONT requirements are exclusions, not work to trace");
    let [row] = rows;
    assert.deepEqual(row.gaps, ["No feature satisfies it yet.", "No test verifies it.", "Not shipped in any deployment."]);

    const feat = await addFeature(FOUNDER, project.id, { title: "Invoice export", requirementCode: req.code });
    const task = await addTask(FOUNDER, project.id, { title: "InvoiceExportService", featureCode: feat.code });
    const unit = await addTestCase(FOUNDER, project.id, { title: "Export renders totals", level: "UNIT", verifiesCode: req.code });
    [row] = await traceMatrix(project.id);
    assert.deepEqual(row.features, [feat.code]);
    assert.deepEqual(row.tasks, [task.code]);
    assert.ok(row.gaps.includes("A linked test has no evidence recorded."));

    const failing = await recordEvidence(FOUNDER, unit.id, { passed: 13, total: 14, summary: "CI unit suite" });
    assert.equal(failing.result, "FAIL", "13/14 is a failure regardless of wording");
    [row] = await traceMatrix(project.id);
    assert.ok(row.gaps.includes("Latest evidence includes a failure."));

    await recordEvidence(FOUNDER, unit.id, { passed: 14, total: 14, summary: "CI unit suite, re-run" });
    await assert.rejects(() => recordDeployment(FOUNDER, project.id, { environment: "production", succeeded: true, rollbackPlan: "Revert" }), /PRODUCTION gate/);
    const staging = await recordDeployment(FOUNDER, project.id, { environment: "staging", succeeded: true });
    await link(FOUNDER, project.id, task.code!, staging.code!);
    [row] = await traceMatrix(project.id);
    assert.deepEqual(row.gaps, [], "fully traced and proven");
    assert.deepEqual(row.tests.map((t) => t.latest?.result), ["PASS"]);

    assert.deepEqual(await upstreamRequirements(project.id, staging.code!), [req.code], "why does this deployment exist?");
  } finally {
    await cleanupProjectGraph(project.id);
  }
});

test("links refuse codes from other projects and nonsense relations; evidence needs the right capability", async () => {
  const a = await seedFixtureProject();
  const b = await seedFixtureProject();
  try {
    const featA = await addFeature(FOUNDER, a.id, { title: "Feature on A" });
    const testB = await addTestCase(FOUNDER, b.id, { title: "Test on B", level: "E2E" });
    await assert.rejects(() => link(FOUNDER, a.id, featA.code, testB.code), /isn't part of this project/);
    await assert.rejects(() => link(FOUNDER, a.id, testB.code, featA.code), /can't be linked/);
    await assert.rejects(() => recordEvidence(actorAs("DESIGNER"), testB.id, { passed: 1, total: 1, summary: "x" }), /permission/);
    await assert.rejects(() => recordEvidence(FOUNDER, testB.id, { passed: 2, total: 1, summary: "x" }), /between 0 and the total/);
  } finally {
    await cleanupProjectGraph(a.id);
    await cleanupProjectGraph(b.id);
  }
});
