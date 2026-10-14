import { test } from "node:test";
import assert from "node:assert/strict";
import { createRunProjectTestsTool } from "./testTool";

// Always uses createRunProjectTestsTool's injectable runner — never the
// default export's real `npm test` runner, which would recursively
// re-invoke this entire test suite from inside itself.

test("run_project_tests reports ok:true on a clean exit", async () => {
  const tool = createRunProjectTestsTool(async () => ({
    exitCode: 0,
    stdout: "12 passing",
    stderr: "",
    timedOut: false,
    truncated: false,
  }));
  const result = await tool.handler({});
  assert.equal(result.ok, true);
  assert.match(result.output, /12 passing/);
});

test("run_project_tests reports ok:false on a non-zero exit", async () => {
  const tool = createRunProjectTestsTool(async () => ({
    exitCode: 1,
    stdout: "",
    stderr: "1 failing",
    timedOut: false,
    truncated: false,
  }));
  const result = await tool.handler({});
  assert.equal(result.ok, false);
  assert.match(result.output, /1 failing/);
});

test("run_project_tests reports ok:false on timeout", async () => {
  const tool = createRunProjectTestsTool(async () => ({
    exitCode: null,
    stdout: "",
    stderr: "",
    timedOut: true,
    truncated: false,
  }));
  const result = await tool.handler({});
  assert.equal(result.ok, false);
  assert.match(result.output, /timed out/);
});

test("run_project_tests takes no meaningful input — its schema declares no required fields", () => {
  const tool = createRunProjectTestsTool();
  assert.equal(tool.requiresPermission, "execute");
  const schema = tool.inputSchema as { required?: string[] };
  assert.equal(schema.required, undefined);
});
