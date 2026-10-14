import { test } from "node:test";
import assert from "node:assert/strict";
import { toolsForAgent, ALL_TOOLS } from "./registry";

test("security-engineer gets read+write tools but not the execute tool (execute: false)", () => {
  const names = toolsForAgent("security-engineer").map((t) => t.name);
  assert.ok(names.includes("read_project_file"));
  assert.ok(names.includes("write_project_artifact"));
  assert.ok(!names.includes("run_project_tests"));
});

test("qa-engineer gets read+write+execute tools (execute: true)", () => {
  const names = toolsForAgent("qa-engineer").map((t) => t.name);
  assert.ok(names.includes("read_project_file"));
  assert.ok(names.includes("write_project_artifact"));
  assert.ok(names.includes("run_project_tests"));
});

test("devops-engineer gets execute tools despite declaring deploy: true — deploy itself grants nothing because no deploy tool exists", () => {
  const names = toolsForAgent("devops-engineer").map((t) => t.name);
  assert.ok(names.includes("run_project_tests"));
  assert.ok(!names.some((n) => n.toLowerCase().includes("deploy")));
});

test("toolsForAgent throws a clear error for an unknown agent slug", () => {
  assert.throws(() => toolsForAgent("not-a-real-agent"), /No agent\.md found/);
});

test("safety invariant: no tool in this codebase does deployment or git writes, regardless of any agent's declared permissions", () => {
  for (const tool of ALL_TOOLS) {
    const haystack = `${tool.name} ${tool.description}`.toLowerCase();
    assert.ok(!haystack.includes("deploy"), `tool "${tool.name}" mentions deploy — this needs a real design review before it exists`);
    assert.ok(!/\bgit\b/.test(haystack), `tool "${tool.name}" mentions git — this needs a real design review before it exists`);
  }
});
