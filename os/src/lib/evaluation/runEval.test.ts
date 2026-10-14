import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prisma } from "../db/client";
import { MockProvider } from "@/lib/ai/providers/mock";
import { runEvalCase } from "./runEval";
import { seedFixtureProject, cleanupFixtureProject } from "../testHelpers/fixtureProject";
import type { EvalCase } from "./types";

const PASSING_RESPONSE = [
  "---",
  'status: "ready-for-handoff"',
  'confidence: "HIGH"',
  "risks:",
  '  - "SQL injection via string concatenation"',
  "---",
  "",
  "This has a SQL injection vulnerability.",
].join("\n");

function makeCase(overrides: Partial<EvalCase> = {}): EvalCase {
  return {
    id: "test-eval-case",
    agentSlug: "security-engineer",
    category: "adversarial",
    description: "test case",
    input: "review this code",
    taskType: "architecture",
    outputRelativePath: "testing/eval-test.md",
    expectedOutcome: "flags the injection risk",
    checker: (result) => ({ passed: result.metadata.risks.length > 0, reason: "checked risks" }),
    ...overrides,
  };
}

test("runEvalCase runs the agent, applies the checker, and records a passing Evaluation row", async () => {
  const tmpProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agency-os-eval-test-"));
  const prevRoot = process.env.PROJECTS_ROOT;
  process.env.PROJECTS_ROOT = tmpProjectsRoot;

  const project = await seedFixtureProject();
  try {
    const result = await runEvalCase(makeCase(), {
      projectId: project.artifactsPath,
      provider: new MockProvider(PASSING_RESPONSE),
    });

    assert.equal(result.passed, true);

    const agentRow = await prisma.agent.findUniqueOrThrow({ where: { slug: "security-engineer" } });
    const evalRow = await prisma.evaluation.findFirstOrThrow({ where: { agentId: agentRow.id, testCase: "test-eval-case" } });
    assert.equal(evalRow.passed, true);
    assert.equal(evalRow.expectedOutcome, "flags the injection risk");
    assert.ok(evalRow.actualOutcome);

    await prisma.evaluation.deleteMany({ where: { agentId: agentRow.id } });
  } finally {
    await cleanupFixtureProject(project.id);
    fs.rmSync(tmpProjectsRoot, { recursive: true, force: true });
    if (prevRoot === undefined) delete process.env.PROJECTS_ROOT;
    else process.env.PROJECTS_ROOT = prevRoot;
  }
});

test("runEvalCase records a failing Evaluation row (not just successes) when the checker fails", async () => {
  const tmpProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agency-os-eval-test-"));
  const prevRoot = process.env.PROJECTS_ROOT;
  process.env.PROJECTS_ROOT = tmpProjectsRoot;

  const project = await seedFixtureProject();
  try {
    const missedResponse = [
      "---",
      'status: "ready-for-handoff"',
      'confidence: "HIGH"',
      "risks: []",
      "---",
      "",
      "This code looks fine to me.",
    ].join("\n");

    const result = await runEvalCase(makeCase({ id: "test-eval-case-failing" }), {
      projectId: project.artifactsPath,
      provider: new MockProvider(missedResponse),
    });

    assert.equal(result.passed, false);

    const agentRow = await prisma.agent.findUniqueOrThrow({ where: { slug: "security-engineer" } });
    const evalRow = await prisma.evaluation.findFirstOrThrow({ where: { agentId: agentRow.id, testCase: "test-eval-case-failing" } });
    assert.equal(evalRow.passed, false);

    await prisma.evaluation.deleteMany({ where: { agentId: agentRow.id } });
  } finally {
    await cleanupFixtureProject(project.id);
    fs.rmSync(tmpProjectsRoot, { recursive: true, force: true });
    if (prevRoot === undefined) delete process.env.PROJECTS_ROOT;
    else process.env.PROJECTS_ROOT = prevRoot;
  }
});
