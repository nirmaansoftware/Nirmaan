/**
 * Regression test for the full agent roster (Phase 4). Verifies every
 * agent.md under /agents parses correctly through the real loadAgent()
 * runtime and has non-empty core fields. Does NOT verify content quality
 * or that an agent produces good output against a real model — only that
 * the spec is structurally sound. See /agents/README.md for what "done"
 * means for this phase.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAgent, listAgentSlugs } from "./loadAgent";

const REQUIRED_SECTIONS = [
  "## Mission",
  "## Expertise",
  "## Responsibilities",
  "## Inputs",
  "## Outputs",
  "## Tools",
  "## Constraints",
  "## Decision rules",
  "## Quality criteria",
  "## Escalation rules",
];

test("at least the full 25-agent roster is present", () => {
  const slugs = listAgentSlugs();
  assert.ok(slugs.length >= 25, `expected >= 25 agents, found ${slugs.length}`);
});

test("every agent.md loads cleanly and has non-empty core fields", () => {
  for (const slug of listAgentSlugs()) {
    const agent = loadAgent(slug);
    assert.ok(agent.role.length > 0, `${slug}: empty role`);
    assert.ok(agent.reviewedBy.length > 0, `${slug}: empty reviewedBy`);
    assert.ok(
      typeof agent.permissions.execute === "boolean" &&
        typeof agent.permissions.deploy === "boolean" &&
        typeof agent.permissions.delete === "boolean",
      `${slug}: permissions.execute/deploy/delete must be explicit booleans`
    );
  }
});

test("every agent.md has all ten required section headers", () => {
  for (const slug of listAgentSlugs()) {
    const agent = loadAgent(slug);
    for (const section of REQUIRED_SECTIONS) {
      assert.ok(agent.body.includes(section), `${slug}: missing "${section}"`);
    }
  }
});

test("only the agents that legitimately run code or tests declare execute or deploy permissions", () => {
  const allowedExecuteOrDeploy = new Set([
    "devops-engineer",
    "design-system-engineer",
    "frontend-engineer",
    "backend-engineer",
    "database-engineer",
    "ai-ml-engineer",
    "qa-engineer",
    "performance-engineer",
    "sre",
  ]);

  for (const slug of listAgentSlugs()) {
    const agent = loadAgent(slug);
    const hasElevated = agent.permissions.execute === true || agent.permissions.deploy === true;
    if (hasElevated) {
      assert.ok(
        allowedExecuteOrDeploy.has(slug),
        `${slug}: declares execute/deploy permission but isn't in the expected allowlist — confirm this is intentional and update this test`
      );
    }
  }
});

test("only DevOps Engineer declares deploy permission", () => {
  for (const slug of listAgentSlugs()) {
    const agent = loadAgent(slug);
    if (agent.permissions.deploy === true) {
      assert.equal(slug, "devops-engineer", `${slug}: unexpectedly declares deploy: true`);
    }
  }
});
