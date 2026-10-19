import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prisma } from "../db/client";
import { MockProvider } from "@/lib/ai/providers/mock";
import { dispatchTask } from "./dispatch";
import { seedFixtureProject, seedFixtureTask, cleanupFixtureProject } from "../testHelpers/fixtureProject";
import type { ModelProvider, CompletionResult } from "@/lib/ai/providers/types";

/** A provider reporting real costUsd directly (like ClaudeCodeCliProvider does) — MockProvider deliberately never sets this field, so this stands in for it here. */
function realCostProvider(text: string, costUsd: number): ModelProvider {
  return {
    async complete(): Promise<CompletionResult> {
      return { text, provider: "fake-real-cost-provider", model: "claude-sonnet-5", costUsd };
    },
  };
}

const READY_RESPONSE = [
  "---",
  'status: "ready-for-handoff"',
  'confidence: "HIGH"',
  "assumptions: []",
  "risks: []",
  "open_questions: []",
  "review_required: false",
  "---",
  "",
  "# Requirements spec",
  "",
  "Fixture content for the dispatch test.",
].join("\n");

const BLOCKED_RESPONSE = [
  "---",
  'status: "blocked-on-input"',
  'confidence: "LOW"',
  "assumptions: []",
  "risks: []",
  "open_questions:",
  '  - "What is the actual budget?"',
  "review_required: true",
  "---",
  "",
  "# Requirements spec (incomplete)",
].join("\n");

async function seedTestProject(ownerAgent: string) {
  const project = await seedFixtureProject();
  const task = await seedFixtureTask(project.id, ownerAgent, "Turn client brief into requirements spec");
  return { project, task };
}

const cleanupTestProject = cleanupFixtureProject;

test("dispatchTask runs the owner agent, writes an artifact, and advances task status (ready-for-handoff)", async () => {
  const tmpProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agency-os-dispatch-test-"));
  const prevRoot = process.env.PROJECTS_ROOT;
  process.env.PROJECTS_ROOT = tmpProjectsRoot;

  const { project, task } = await seedTestProject("business-analyst");
  try {
    const result = await dispatchTask(task.id, { provider: new MockProvider(READY_RESPONSE) });

    assert.equal(result.status, "ready-for-handoff");
    assert.equal(result.confidence, "HIGH");
    assert.ok(fs.existsSync(result.filePath));
    assert.equal(result.costUsd, null, "MockProvider reports no usage, so cost must be null, not a guessed number");

    const updatedTask = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    assert.equal(updatedTask.status, "REVIEW");

    const artifact = await prisma.artifact.findUniqueOrThrow({ where: { id: result.artifactId } });
    assert.equal(artifact.type, "REQUIREMENTS_SPEC");
    assert.equal(artifact.taskId, task.id);

    // business-analyst's reviewed_by is "product-manager, orchestrator" — both non-human, so 2 review tasks.
    assert.equal(result.reviewTaskIds.length, 2);
    const reviewTasks = await prisma.task.findMany({ where: { id: { in: result.reviewTaskIds } } });
    const reviewers = reviewTasks.map((t) => t.ownerAgent).sort();
    assert.deepEqual(reviewers, ["orchestrator", "product-manager"]);
    for (const rt of reviewTasks) {
      assert.equal(rt.status, "READY");
    }

    const agentRow = await prisma.agent.findUnique({ where: { slug: "business-analyst" } });
    assert.ok(agentRow, "dispatch should upsert an Agent row for a slug not yet in the DB");

    const events = await prisma.event.findMany({ where: { projectId: project.id }, orderBy: { timestamp: "asc" } });
    assert.ok(events.some((e) => e.message.includes("Dispatched task")));
    assert.ok(events.some((e) => e.message.includes("Requested review from")));
    assert.ok(events.some((e) => e.message.includes("cost unknown (provider reported no usage)")));
  } finally {
    await cleanupTestProject(project.id);
    fs.rmSync(tmpProjectsRoot, { recursive: true, force: true });
    if (prevRoot === undefined) delete process.env.PROJECTS_ROOT;
    else process.env.PROJECTS_ROOT = prevRoot;
  }
});

test("dispatchTask computes a real cost estimate and logs it when the provider reports usage for a priced model", async () => {
  const tmpProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agency-os-dispatch-test-"));
  const prevRoot = process.env.PROJECTS_ROOT;
  process.env.PROJECTS_ROOT = tmpProjectsRoot;

  const { project, task } = await seedTestProject("business-analyst");
  try {
    const provider = new MockProvider(READY_RESPONSE, { inputTokens: 1_000_000, outputTokens: 1_000_000 }, "claude-sonnet-5");
    const result = await dispatchTask(task.id, { provider });

    // claude-sonnet-5: $3/M in + $15/M out = $18 at 1M/1M tokens
    assert.equal(result.costUsd, 18);

    const events = await prisma.event.findMany({ where: { projectId: project.id } });
    assert.ok(events.some((e) => e.message.includes("~$18.0000") && e.message.includes("claude-sonnet-5")));
  } finally {
    await cleanupTestProject(project.id);
    fs.rmSync(tmpProjectsRoot, { recursive: true, force: true });
    if (prevRoot === undefined) delete process.env.PROJECTS_ROOT;
    else process.env.PROJECTS_ROOT = prevRoot;
  }
});

test("dispatchTask records cache-read and cache-creation tokens in the AiUsage row", async () => {
  const tmpProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agency-os-dispatch-test-"));
  const prevRoot = process.env.PROJECTS_ROOT;
  process.env.PROJECTS_ROOT = tmpProjectsRoot;

  const { project, task } = await seedTestProject("business-analyst");
  try {
    const usage = { inputTokens: 4, outputTokens: 812, cacheReadInputTokens: 218_769, cacheCreationInputTokens: 12_480 };
    await dispatchTask(task.id, { provider: new MockProvider(READY_RESPONSE, usage, "claude-sonnet-5") });

    const row = await prisma.aiUsage.findFirstOrThrow({ where: { projectId: project.id, success: true } });
    assert.equal(row.inputTokens, 4);
    assert.equal(row.cacheReadInputTokens, 218_769);
    assert.equal(row.cacheCreationInputTokens, 12_480);
  } finally {
    await cleanupTestProject(project.id);
    fs.rmSync(tmpProjectsRoot, { recursive: true, force: true });
    if (prevRoot === undefined) delete process.env.PROJECTS_ROOT;
    else process.env.PROJECTS_ROOT = prevRoot;
  }
});

test("dispatchTask reports costUsd null and logs 'unknown model' when usage exists but the model has no pricing entry", async () => {
  const tmpProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agency-os-dispatch-test-"));
  const prevRoot = process.env.PROJECTS_ROOT;
  process.env.PROJECTS_ROOT = tmpProjectsRoot;

  const { project, task } = await seedTestProject("business-analyst");
  try {
    const provider = new MockProvider(READY_RESPONSE, { inputTokens: 100, outputTokens: 100 }, "some-future-model");
    const result = await dispatchTask(task.id, { provider });

    assert.equal(result.costUsd, null);

    const events = await prisma.event.findMany({ where: { projectId: project.id } });
    assert.ok(events.some((e) => e.message.includes('no pricing entry for model "some-future-model"')));
  } finally {
    await cleanupTestProject(project.id);
    fs.rmSync(tmpProjectsRoot, { recursive: true, force: true });
    if (prevRoot === undefined) delete process.env.PROJECTS_ROOT;
    else process.env.PROJECTS_ROOT = prevRoot;
  }
});

test("dispatchTask prefers a provider's real reported costUsd over the estimated one when both could apply", async () => {
  const tmpProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agency-os-dispatch-test-"));
  const prevRoot = process.env.PROJECTS_ROOT;
  process.env.PROJECTS_ROOT = tmpProjectsRoot;

  const { project, task } = await seedTestProject("business-analyst");
  try {
    const provider = realCostProvider(READY_RESPONSE, 0.4242);
    const result = await dispatchTask(task.id, { provider });

    assert.equal(result.costUsd, 0.4242);

    const events = await prisma.event.findMany({ where: { projectId: project.id } });
    assert.ok(events.some((e) => e.message.includes("~$0.4242 (real, reported by fake-real-cost-provider)")));
  } finally {
    await cleanupTestProject(project.id);
    fs.rmSync(tmpProjectsRoot, { recursive: true, force: true });
    if (prevRoot === undefined) delete process.env.PROJECTS_ROOT;
    else process.env.PROJECTS_ROOT = prevRoot;
  }
});

/** Captures the model actually requested from the provider, so tests can prove the complexity heuristic changed what was asked for, not just that dispatch succeeded. */
function capturingProvider(text: string): { provider: ModelProvider; requestedModels: string[] } {
  const requestedModels: string[] = [];
  return {
    provider: {
      async complete(req) {
        requestedModels.push(req.model);
        return { text, provider: "fake-capturing-provider", model: req.model };
      },
    },
    requestedModels,
  };
}

test("dispatchTask upgrades the model when the task description reads as more complex than its role's baseline", async () => {
  const tmpProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agency-os-dispatch-test-"));
  const prevRoot = process.env.PROJECTS_ROOT;
  process.env.PROJECTS_ROOT = tmpProjectsRoot;

  const project = await seedFixtureProject();
  const task = await seedFixtureTask(
    project.id,
    "business-analyst", // baseline task type "requirements" -> claude-sonnet-5
    "Design the multi-tenant requirements",
    "This needs a multi-tenant architecture with SSO, an audit trail, and SOC 2 compliance, migrating off the legacy system with high availability across multi-region deployments."
  );
  try {
    const { provider, requestedModels } = capturingProvider(READY_RESPONSE);
    const result = await dispatchTask(task.id, { provider });

    assert.equal(result.model, "claude-opus-5");
    assert.deepEqual(requestedModels, ["claude-opus-5"]);

    const events = await prisma.event.findMany({ where: { projectId: project.id } });
    assert.ok(events.some((e) => e.message.includes("Complexity heuristic: up-tiered claude-sonnet-5 -> claude-opus-5")));
  } finally {
    await cleanupFixtureProject(project.id);
    fs.rmSync(tmpProjectsRoot, { recursive: true, force: true });
    if (prevRoot === undefined) delete process.env.PROJECTS_ROOT;
    else process.env.PROJECTS_ROOT = prevRoot;
  }
});

test("dispatchTask downgrades the model when the task description reads as simpler than its role's baseline", async () => {
  const tmpProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agency-os-dispatch-test-"));
  const prevRoot = process.env.PROJECTS_ROOT;
  process.env.PROJECTS_ROOT = tmpProjectsRoot;

  const project = await seedFixtureProject();
  const task = await seedFixtureTask(
    project.id,
    "business-analyst", // baseline task type "requirements" -> claude-sonnet-5
    "Write the requirements",
    "Just a simple one-page static site, no backend, no database, no CMS needed."
  );
  try {
    const { provider, requestedModels } = capturingProvider(READY_RESPONSE);
    const result = await dispatchTask(task.id, { provider });

    assert.equal(result.model, "claude-haiku-4-5-20251001");
    assert.deepEqual(requestedModels, ["claude-haiku-4-5-20251001"]);
  } finally {
    await cleanupFixtureProject(project.id);
    fs.rmSync(tmpProjectsRoot, { recursive: true, force: true });
    if (prevRoot === undefined) delete process.env.PROJECTS_ROOT;
    else process.env.PROJECTS_ROOT = prevRoot;
  }
});

test("AGENCY_OS_DISABLE_COMPLEXITY_ROUTING=1 turns the heuristic off entirely, even for a clearly complex description", async () => {
  const tmpProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agency-os-dispatch-test-"));
  const prevRoot = process.env.PROJECTS_ROOT;
  process.env.PROJECTS_ROOT = tmpProjectsRoot;
  process.env.AGENCY_OS_DISABLE_COMPLEXITY_ROUTING = "1";

  const project = await seedFixtureProject();
  const task = await seedFixtureTask(
    project.id,
    "business-analyst",
    "Design the multi-tenant requirements",
    "This needs a multi-tenant architecture with SSO, an audit trail, and SOC 2 compliance, migrating off the legacy system with high availability across multi-region deployments."
  );
  try {
    const { provider, requestedModels } = capturingProvider(READY_RESPONSE);
    const result = await dispatchTask(task.id, { provider });

    assert.equal(result.model, "claude-sonnet-5", "should stay at the unadjusted baseline with the kill switch on");
    assert.deepEqual(requestedModels, ["claude-sonnet-5"]);

    const events = await prisma.event.findMany({ where: { projectId: project.id } });
    assert.ok(!events.some((e) => e.message.includes("Complexity heuristic")));
  } finally {
    delete process.env.AGENCY_OS_DISABLE_COMPLEXITY_ROUTING;
    await cleanupFixtureProject(project.id);
    fs.rmSync(tmpProjectsRoot, { recursive: true, force: true });
    if (prevRoot === undefined) delete process.env.PROJECTS_ROOT;
    else process.env.PROJECTS_ROOT = prevRoot;
  }
});

test("dispatchTask marks the task BLOCKED and creates no review tasks when the agent reports blocked-on-input", async () => {
  const tmpProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agency-os-dispatch-test-"));
  const prevRoot = process.env.PROJECTS_ROOT;
  process.env.PROJECTS_ROOT = tmpProjectsRoot;

  const { project, task } = await seedTestProject("business-analyst");
  try {
    const result = await dispatchTask(task.id, { provider: new MockProvider(BLOCKED_RESPONSE) });

    assert.equal(result.status, "blocked-on-input");
    assert.equal(result.reviewTaskIds.length, 0);

    const updatedTask = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    assert.equal(updatedTask.status, "BLOCKED");
  } finally {
    await cleanupTestProject(project.id);
    fs.rmSync(tmpProjectsRoot, { recursive: true, force: true });
    if (prevRoot === undefined) delete process.env.PROJECTS_ROOT;
    else process.env.PROJECTS_ROOT = prevRoot;
  }
});

test("dispatchTask throws a clear error when the task has no ownerAgent", async () => {
  const { project, task } = await seedTestProject("business-analyst");
  await prisma.task.update({ where: { id: task.id }, data: { ownerAgent: null } });
  try {
    await assert.rejects(() => dispatchTask(task.id), /has no ownerAgent/);
  } finally {
    await cleanupTestProject(project.id);
  }
});

test("dispatchTask throws a clear error for an unknown agent slug", async () => {
  const { project, task } = await seedTestProject("not-a-real-agent");
  try {
    await assert.rejects(() => dispatchTask(task.id), /No agent\.md found/);
  } finally {
    await cleanupTestProject(project.id);
  }
});
