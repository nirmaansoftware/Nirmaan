import { test } from "node:test";
import assert from "node:assert/strict";
import { runCommand } from "./commandRunner";

// Use the Node binary that's already running this test (process.execPath)
// rather than relying on "node" being on PATH — safe, fast, no external
// dependency, and never touches the real npm test suite (avoiding the
// recursive-test-run problem of actually invoking `npm test` from within
// a test).

test("runCommand captures stdout and a zero exit code on success", async () => {
  const result = await runCommand(process.execPath, ["-e", "console.log('hello from child')"], {
    cwd: process.cwd(),
    timeoutMs: 5000,
  });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /hello from child/);
  assert.equal(result.timedOut, false);
});

test("runCommand captures a non-zero exit code", async () => {
  const result = await runCommand(process.execPath, ["-e", "process.exit(1)"], {
    cwd: process.cwd(),
    timeoutMs: 5000,
  });
  assert.equal(result.exitCode, 1);
  assert.equal(result.timedOut, false);
});

test("runCommand captures stderr", async () => {
  const result = await runCommand(process.execPath, ["-e", "console.error('oops')"], {
    cwd: process.cwd(),
    timeoutMs: 5000,
  });
  assert.match(result.stderr, /oops/);
});

test("runCommand kills a hung process after the timeout and reports timedOut", async () => {
  const result = await runCommand(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], {
    cwd: process.cwd(),
    timeoutMs: 300,
  });
  assert.equal(result.timedOut, true);
  assert.notEqual(result.exitCode, 0);
});

test("runCommand reports a spawn error for a nonexistent command rather than throwing", async () => {
  const result = await runCommand("this-command-does-not-exist-anywhere", [], {
    cwd: process.cwd(),
    timeoutMs: 2000,
  });
  assert.equal(result.exitCode, null);
  assert.match(result.stderr, /spawn error/);
});
