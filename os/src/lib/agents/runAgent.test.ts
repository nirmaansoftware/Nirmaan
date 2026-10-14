/**
 * Plumbing test for the agent runtime — verifies agent.md loading, response
 * parsing, and artifact writing work correctly. Uses MockProvider, so this
 * does NOT verify that a real model produces a good PRD; it verifies the
 * scaffolding around a model call is correct. See scripts/demo-run-product-manager.ts
 * for a live run against the real Anthropic provider.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { loadAgent, listAgentSlugs } from "./loadAgent";
import { runAgent } from "./runAgent";
import { MockProvider } from "@/lib/ai/providers/mock";
import type { HandoffMetadata } from "./types";

test("loadAgent parses orchestrator/agent.md frontmatter and body", () => {
  const agent = loadAgent("orchestrator");
  assert.equal(agent.slug, "orchestrator");
  assert.equal(agent.role, "AI Technical Director + Project Orchestrator");
  assert.deepEqual(agent.reviewedBy, ["human"]);
  assert.equal(agent.permissions.execute, false);
  assert.match(agent.body, /## Mission/);
  assert.match(agent.body, /## Escalation rules/);
});

test("loadAgent parses product-manager/agent.md reviewed_by as a list", () => {
  const agent = loadAgent("product-manager");
  assert.deepEqual(agent.reviewedBy, ["business-analyst", "orchestrator"]);
});

test("loadAgent throws a clear error for a nonexistent agent", () => {
  assert.throws(() => loadAgent("does-not-exist"), /No agent\.md found/);
});

test("listAgentSlugs includes the two Phase 1/2 agents", () => {
  // Full-roster coverage (all 25 agents) is asserted in allAgentsLoad.test.ts
  // (Phase 4) — this test only pins the two agents this file's other tests
  // depend on existing.
  const slugs = listAgentSlugs();
  assert.ok(slugs.includes("orchestrator"));
  assert.ok(slugs.includes("product-manager"));
});

test("runAgent writes a well-formed artifact with handoff metadata (mock provider)", async () => {
  const tmpProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agency-os-test-"));
  const prevRoot = process.env.PROJECTS_ROOT;
  process.env.PROJECTS_ROOT = tmpProjectsRoot;

  try {
    const mockResponse = [
      "---",
      'status: "ready-for-handoff"',
      'confidence: "HIGH"',
      "assumptions:",
      '  - "Client wants a marketing site, not a web app."',
      "risks: []",
      "open_questions: []",
      "review_required: false",
      "---",
      "",
      "# PRD: Test Project",
      "",
      "## Problem",
      "A test problem statement.",
    ].join("\n");

    const result = await runAgent({
      agentSlug: "product-manager",
      taskType: "requirements",
      projectId: "demo-project",
      userInput: "Client wants a marketing site for their bakery.",
      outputRelativePath: "requirements/prd.md",
      provider: new MockProvider(mockResponse),
    });

    assert.ok(fs.existsSync(result.filePath));
    assert.equal(result.metadata.agent, "product-manager");
    assert.equal(result.metadata.project, "demo-project");
    assert.equal(result.metadata.status, "ready-for-handoff");
    assert.equal(result.metadata.confidence, "HIGH");
    assert.equal(result.metadata.review_required, false);
    assert.deepEqual(result.metadata.assumptions, ["Client wants a marketing site, not a web app."]);

    const onDisk = matter(fs.readFileSync(result.filePath, "utf-8"));
    const data = onDisk.data as HandoffMetadata;
    assert.equal(data.agent, "product-manager");
    assert.match(onDisk.content, /# PRD: Test Project/);
  } finally {
    if (prevRoot === undefined) delete process.env.PROJECTS_ROOT;
    else process.env.PROJECTS_ROOT = prevRoot;
    fs.rmSync(tmpProjectsRoot, { recursive: true, force: true });
  }
});

test("runAgent defaults to LOW confidence and review_required when the model returns no parseable frontmatter", async () => {
  const tmpProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agency-os-test-"));
  const prevRoot = process.env.PROJECTS_ROOT;
  process.env.PROJECTS_ROOT = tmpProjectsRoot;

  try {
    const result = await runAgent({
      agentSlug: "product-manager",
      taskType: "requirements",
      projectId: "demo-project",
      userInput: "A brief with no structure in the response.",
      outputRelativePath: "requirements/prd.md",
      provider: new MockProvider("Just plain text, no frontmatter at all."),
    });

    assert.equal(result.metadata.confidence, "LOW");
    assert.equal(result.metadata.review_required, true);
    assert.equal(result.metadata.status, "in-progress");
  } finally {
    if (prevRoot === undefined) delete process.env.PROJECTS_ROOT;
    else process.env.PROJECTS_ROOT = prevRoot;
    fs.rmSync(tmpProjectsRoot, { recursive: true, force: true });
  }
});

test("runAgent never overwrites an existing artifact — writes a versioned file instead", async () => {
  const tmpProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agency-os-test-"));
  const prevRoot = process.env.PROJECTS_ROOT;
  process.env.PROJECTS_ROOT = tmpProjectsRoot;

  try {
    const run = () =>
      runAgent({
        agentSlug: "product-manager",
        taskType: "requirements",
        projectId: "demo-project",
        userInput: "brief",
        outputRelativePath: "requirements/prd.md",
        provider: new MockProvider(),
      });

    const first = await run();
    const second = await run();

    assert.notEqual(first.filePath, second.filePath);
    assert.ok(fs.existsSync(first.filePath), "original artifact must still exist");
    assert.match(second.filePath, /prd-v2\.md$/);
  } finally {
    if (prevRoot === undefined) delete process.env.PROJECTS_ROOT;
    else process.env.PROJECTS_ROOT = prevRoot;
    fs.rmSync(tmpProjectsRoot, { recursive: true, force: true });
  }
});
