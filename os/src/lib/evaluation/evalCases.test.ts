import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MockProvider } from "@/lib/ai/providers/mock";
import { runEvalCase } from "./runEval";
import { EVAL_CASES } from "./evalCases";
import { seedFixtureProject, cleanupFixtureProject } from "../testHelpers/fixtureProject";
import { prisma } from "../db/client";

/**
 * For every real eval case, prove its checker actually discriminates: a
 * response that plausibly caught the planted issue passes, and a
 * response that plausibly missed it fails. A checker that returns true
 * (or false) unconditionally would pass a naive "does it run" test but
 * fail this one — that's the point.
 */
function yamlList(key: string, items: string[]): string {
  if (items.length === 0) return `${key}: []`;
  return [`${key}:`, ...items.map((item) => `  - "${item.replace(/"/g, '\\"')}"`)].join("\n");
}

function frontmatter(status: string, confidence: string, risks: string[], openQuestions: string[] = []): string {
  return [
    "---",
    `status: "${status}"`,
    `confidence: "${confidence}"`,
    yamlList("risks", risks),
    yamlList("open_questions", openQuestions),
    "---",
    "",
  ].join("\n");
}

const RESPONSES: Record<string, { caught: string; missed: string }> = {
  "security-engineer-sql-injection": {
    caught: frontmatter("ready-for-handoff", "HIGH", ["SQL injection via unsanitized string concatenation"]) + "This query concatenates user input directly, creating a SQL injection vulnerability. Use parameterized queries.",
    missed: frontmatter("ready-for-handoff", "HIGH", []) + "This route looks straightforward, no issues found.",
  },
  "security-engineer-hardcoded-secret": {
    caught: frontmatter("ready-for-handoff", "HIGH", ["Hardcoded live secret key committed in source"]) + "This hardcoded secret key should be moved to an environment variable immediately.",
    missed: frontmatter("ready-for-handoff", "HIGH", []) + "Stripe client setup looks fine.",
  },
  "qa-engineer-off-by-one": {
    caught: frontmatter("ready-for-handoff", "HIGH", ["off-by-one error in slice boundary includes an extra item"]) + "There's an off-by-one issue: slice(start, end + 1) includes one extra item past the intended boundary.",
    missed: frontmatter("ready-for-handoff", "HIGH", []) + "Straightforward pagination function, a couple of basic unit tests should cover it.",
  },
  "principal-architect-spof": {
    caught: frontmatter("ready-for-handoff", "HIGH", ["Single point of failure: unreplicated database with no failover"]) + "This design has a single point of failure — the database has no replica or failover, so any outage takes the whole API down.",
    missed: frontmatter("ready-for-handoff", "HIGH", []) + "Simple architecture, one API instance talking to one database.",
  },
  "technical-writer-no-fabrication": {
    caught: frontmatter("ready-for-handoff", "MEDIUM", []) + "We added an in-memory LRU cache in front of the database to reduce latency on repeated reads.",
    missed: frontmatter("ready-for-handoff", "HIGH", []) + "Trusted by Fortune 500 companies, our new cache makes queries 500% faster than before.",
  },
  "product-manager-capability-clear-brief": {
    caught: frontmatter("ready-for-handoff", "HIGH", []) + "# PRD\n\nA simple informational page with hours, address, services, and a phone number.",
    missed: frontmatter("blocked-on-input", "LOW", [], ["What should the page look like?"]) + "Need more information before proceeding.",
  },
  "business-analyst-honest-about-gaps": {
    caught: frontmatter("blocked-on-input", "LOW", [], ["What does \"stuff\" refer to?", "Who are the users?"]) + "This brief doesn't specify enough to proceed.",
    missed: frontmatter("ready-for-handoff", "HIGH", []) + "# Requirements\n\nThe system will manage stuff for users as needed.",
  },
};

test("every EVAL_CASE has a discrimination fixture defined in this test file", () => {
  for (const evalCase of EVAL_CASES) {
    assert.ok(RESPONSES[evalCase.id], `No caught/missed fixture defined for eval case "${evalCase.id}" — add one above.`);
  }
});

for (const evalCase of EVAL_CASES) {
  test(`${evalCase.id}: checker passes on a response that plausibly caught the issue`, async () => {
    const fixture = RESPONSES[evalCase.id];
    if (!fixture) return; // covered by the completeness test above
    await withFixture(evalCase.id, async (projectId) => {
      const result = await runEvalCase(evalCase, { projectId, provider: new MockProvider(fixture.caught) });
      assert.equal(result.passed, true, `expected pass, got: ${result.reason}`);
    });
  });

  test(`${evalCase.id}: checker fails on a response that plausibly missed the issue`, async () => {
    const fixture = RESPONSES[evalCase.id];
    if (!fixture) return;
    await withFixture(evalCase.id, async (projectId) => {
      const result = await runEvalCase(evalCase, { projectId, provider: new MockProvider(fixture.missed) });
      assert.equal(result.passed, false, `expected fail, got a pass with reason: ${result.reason}`);
    });
  });
}

/** Isolated PROJECTS_ROOT + fixture project per call, and cleans up only the Evaluation rows this specific eval case's testCase id created — never a blanket delete-all. */
async function withFixture(testCaseId: string, fn: (projectId: string) => Promise<void>) {
  const tmpProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agency-os-evalcases-test-"));
  const prevRoot = process.env.PROJECTS_ROOT;
  process.env.PROJECTS_ROOT = tmpProjectsRoot;

  const project = await seedFixtureProject();
  try {
    await fn(project.artifactsPath);
  } finally {
    await prisma.evaluation.deleteMany({ where: { testCase: testCaseId } });
    await cleanupFixtureProject(project.id);
    fs.rmSync(tmpProjectsRoot, { recursive: true, force: true });
    if (prevRoot === undefined) delete process.env.PROJECTS_ROOT;
    else process.env.PROJECTS_ROOT = prevRoot;
  }
}
