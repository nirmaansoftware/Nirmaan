import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RunAgentResult } from "../agents/runAgent";
import { toolJudge, firstFencedBlock } from "./toolJudge";
import { allOf, flagsAtLeastOneRisk, judgeOf, mentionsAnyKeyword } from "./checkers";

// The hidden suite lives outside anything the agent sees.
const hiddenDir = fs.mkdtempSync(path.join(os.tmpdir(), "hidden-suite-"));
after(() => fs.rmSync(hiddenDir, { recursive: true, force: true }));
const suite = path.join(hiddenDir, "sum.test.mjs");
fs.writeFileSync(
  suite,
  ['import test from "node:test";', 'import assert from "node:assert/strict";', 'import { add } from "./add.mjs";', 'test("adds", () => assert.equal(add(2, 3), 5));', ""].join("\n")
);

function fakeResult(body: string): RunAgentResult {
  return {
    filePath: "/tmp/fake.md",
    rawResponse: `---\nstatus: "ready-for-handoff"\n---\n\n${body}`,
    model: "fake-model",
    provider: "fake",
    durationMs: 0,
    metadata: {
      project: "test",
      agent: "backend-engineer",
      status: "ready-for-handoff",
      confidence: "HIGH",
      assumptions: [],
      inputs: [],
      outputs: [],
      decisions: [],
      risks: [],
      open_questions: [],
      review_required: false,
    },
  };
}

const fence = "```";
const addJudge = toolJudge({
  suite,
  files: (r): Record<string, string> => {
    const code = firstFencedBlock(r.rawResponse, "js");
    return code ? { "add.mjs": code } : {};
  },
});

test("a tool-judged case passes when the hidden suite passes, and records the command and exit code 0", () => {
  const out = addJudge(fakeResult(`Here it is.\n\n${fence}js\nexport const add = (a, b) => a + b;\n${fence}\n`));
  assert.equal(out.passed, true, out.reason);
  assert.equal(out.exitCode, 0);
  assert.equal(out.command, "node --test hidden-sum.test.mjs");
  assert.equal(judgeOf(addJudge), "tool");
});

test("a tool-judged case fails when the hidden suite fails, with the non-zero exit code", () => {
  const out = addJudge(fakeResult(`${fence}js\nexport const add = (a, b) => a - b;\n${fence}\n`));
  assert.equal(out.passed, false);
  assert.ok(typeof out.exitCode === "number" && out.exitCode !== 0, `exit code ${out.exitCode}`);
  assert.equal(out.command, "node --test hidden-sum.test.mjs");
});

test("no file in the output, or a path outside the scratch folder, fails without running", () => {
  const none = addJudge(fakeResult("I could not write it."));
  assert.equal(none.passed, false);
  assert.match(none.reason, /no file/);
  const escape = toolJudge({ suite, files: () => ({ "../add.mjs": "export const add = (a, b) => a + b;" }) });
  const out = escape(fakeResult(""));
  assert.equal(out.passed, false);
  assert.match(out.reason, /outside/);
});

test("a command judge passes on exit 0 and fails on another exit code", () => {
  const judge = toolJudge({
    command: ["node", "-e", "process.exit(require('fs').readFileSync('out.json', 'utf8').includes('\"ok\":true') ? 0 : 3)"],
    files: (r) => ({ "out.json": firstFencedBlock(r.rawResponse, "json") ?? "" }),
  });
  assert.equal(judge(fakeResult(`${fence}json\n{"ok":true}\n${fence}`)).passed, true);
  const bad = judge(fakeResult(`${fence}json\n{"ok":false}\n${fence}`));
  assert.equal(bad.passed, false);
  assert.equal(bad.exitCode, 3);
});

test("the judged run gets no token or key from the environment", () => {
  const previous = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "not-a-real-key";
  try {
    const judge = toolJudge({ command: ["node", "-e", "process.exit(process.env.ANTHROPIC_API_KEY || process.env.GITHUB_TOKEN ? 4 : 0)"], files: () => ({ "x.txt": "x" }) });
    assert.equal(judge(fakeResult("")).exitCode, 0);
  } finally {
    if (previous === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previous;
  }
});

test("a judge needs exactly one of a suite or a command", () => {
  assert.throws(() => toolJudge({ files: () => ({}) }), /exactly one/);
  assert.throws(() => toolJudge({ suite, command: ["true"], files: () => ({}) }), /exactly one/);
});

test("the keyword and structure checkers are labelled heuristic; allOf is a tool judge only when every part is", () => {
  assert.equal(judgeOf(mentionsAnyKeyword(["x"])), "heuristic");
  assert.equal(judgeOf(flagsAtLeastOneRisk()), "heuristic");
  assert.equal(judgeOf(() => ({ passed: true, reason: "unlabelled" })), "heuristic");
  assert.equal(judgeOf(allOf(addJudge, flagsAtLeastOneRisk())), "heuristic");
  assert.equal(judgeOf(allOf(addJudge, addJudge)), "tool");
  const both = allOf(addJudge, addJudge)(fakeResult(`${fence}js\nexport const add = (a, b) => a + b;\n${fence}\n`));
  assert.deepEqual([both.passed, both.exitCode], [true, 0]);
});
