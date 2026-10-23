import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { MockProvider } from "@/lib/ai/providers/mock";
import { prisma } from "../db/client";
import { seedFixtureProject, cleanupFixtureProject } from "../testHelpers/fixtureProject";
import { appendRecords, evalRunRecords, type EvalRunRecord } from "./records";
import { runEvalSuite } from "./runEval";
import { flagsAtLeastOneRisk } from "./checkers";
import type { EvalCase, EvalRunResult } from "./types";

// The item 10 generator is the judge of the record format: these tests parse
// the emitted lines with it and compute levels with it.
const repoRoot = path.resolve(__dirname, "../../../..");
type Levels = {
  parseRecords: (file: string, text: string) => { records: Record<string, unknown>[]; problems: string[] };
  skillIndex: (entries: { file: string; text: string }[]) => Map<string, { sha: string }>;
  checkRecords: (records: Record<string, unknown>[], skills: Map<string, { sha: string }>) => { problems: string[]; live: Record<string, unknown>[] };
  generateLevels: (skills: Map<string, { sha: string }>, live: Record<string, unknown>[]) => string;
  blobSha: (text: string) => string;
  checkAppendOnly: (base: Map<string, string>, head: Map<string, string>) => string[];
};
const levels = (): Promise<Levels> => import(pathToFileURL(path.join(repoRoot, "capability/tools/levels.mjs")).href);

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "eval-records-"));
const saved = { CAPABILITY_ROOT: process.env.CAPABILITY_ROOT, SKILLS_ROOT: process.env.SKILLS_ROOT, PROJECTS_ROOT: process.env.PROJECTS_ROOT };
process.env.CAPABILITY_ROOT = path.join(scratch, "capability");
process.env.SKILLS_ROOT = path.join(scratch, "skills");
process.env.PROJECTS_ROOT = path.join(scratch, "projects");
after(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const SKILL_TEXT = ["---", "id: input-validation", "unit: engineering", "held_by: [security-engineer]", "owners:", "  writer: security-engineer", "  checker: qa-engineer", "---", "", "Use when: a test needs a skill.", ""].join("\n");
const COMMIT = "a".repeat(40);
const ctx = { commit: COMMIT, writerSession: "test-session-1", evidence: "local run log (test)" };

function result(id: string, passed: boolean, over: Partial<EvalRunResult> = {}, sha?: string): EvalRunResult {
  return {
    case: { id } as EvalCase,
    passed,
    reason: passed ? "ok" : "failed",
    rawOutput: "",
    judge: "tool",
    command: "node --test hidden-sum.test.mjs",
    exitCode: passed ? 0 : 1,
    model: "claude-opus-4-6",
    provider: "anthropic",
    skills: [`input-validation@${sha ?? "b".repeat(40)}`],
    ...over,
  };
}

async function levelOf(records: EvalRunRecord[]): Promise<{ level: string; tool_evals: { runs: number } }> {
  const L = await levels();
  const skills = L.skillIndex([{ file: "skills/engineering/input-validation.md", text: SKILL_TEXT }]);
  const sha = L.blobSha(SKILL_TEXT);
  const check = { record_id: "c1", event: "check", skill_id: "input-validation", skill_sha: sha, commit: COMMIT, result: "pass", evidence: "x", written_by: "checker", writer_session: "s", agent: "qa-engineer" };
  const text = [check, ...records].map((r) => JSON.stringify(r)).join("\n") + "\n";
  const parsed = L.parseRecords("capability/records/t.jsonl", text);
  assert.deepEqual(parsed.problems, []);
  const checked = L.checkRecords(parsed.records, skills);
  assert.deepEqual(checked.problems, []);
  return JSON.parse(L.generateLevels(skills, checked.live)).skills["input-validation"];
}

test("one line per skill and judge: n cases, pass only when all pass, failures kept", () => {
  const ok = evalRunRecords([result("a", true), result("b", true), result("c", true)], ctx);
  assert.equal(ok.length, 1);
  assert.deepEqual([ok[0].event, ok[0].written_by, ok[0].judge, ok[0].n, ok[0].result, ok[0].exit_code], ["eval_run", "tool", "tool", 3, "pass", 0]);
  assert.equal(ok[0].command, "node --test hidden-sum.test.mjs");
  assert.equal(ok[0].note, undefined);

  const mixed = evalRunRecords([result("a", true), result("b", false, { exitCode: 2 }), result("c", true, { judge: "heuristic", command: undefined, exitCode: undefined })], ctx);
  assert.equal(mixed.length, 2);
  const tool = mixed.find((r) => r.judge === "tool")!;
  assert.deepEqual([tool.n, tool.result, tool.exit_code, tool.note], [2, "fail", 2, "failed cases: b"]);
  const heur = mixed.find((r) => r.judge === "heuristic")!;
  assert.deepEqual([heur.n, heur.result, heur.exit_code], [1, "pass", 0]);
  assert.match(heur.command, /heuristic checker/);

  assert.deepEqual(evalRunRecords([result("a", true, { skills: [] })], ctx), [], "a run that loaded no skill gives no line");
  assert.throws(() => evalRunRecords([result("a", true)], { ...ctx, commit: "HEAD" }), /40-character/);
});

test("emitted lines validate against the item 10 records format", async () => {
  const L = await levels();
  const records = evalRunRecords([result("a", true), result("b", false), result("c", true, { judge: "heuristic", command: undefined, exitCode: undefined })], ctx);
  const text = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  assert.deepEqual(L.parseRecords("capability/records/eval-runs.jsonl", text).problems, []);
});

test("the generator counts a tool-judged run toward Tested and excludes heuristic and mock runs", async () => {
  const sha = (await levels()).blobSha(SKILL_TEXT);
  const three = (over: Partial<EvalRunResult>) => evalRunRecords(["a", "b", "c"].map((id) => result(id, true, over, sha)), ctx);
  assert.equal((await levelOf(three({}))).level, "Tested");
  const heuristic = await levelOf(three({ judge: "heuristic", command: undefined, exitCode: undefined }));
  assert.deepEqual([heuristic.level, heuristic.tool_evals.runs], ["Checked", 0]);
  assert.equal((await levelOf(three({ model: "mock-echo", provider: "mock" }))).level, "Checked");
  assert.equal((await levelOf(evalRunRecords([result("a", true, {}, sha), result("b", false, {}, sha), result("c", true, {}, sha)], ctx))).level, "Checked");
});

test("records are appended, never rewritten", async () => {
  const L = await levels();
  const first = appendRecords(evalRunRecords([result("a", true)], ctx));
  const before = fs.readFileSync(first, "utf8");
  appendRecords(evalRunRecords([result("b", false)], { ...ctx, writerSession: "test-session-2" }));
  const now = fs.readFileSync(first, "utf8");
  assert.equal(path.basename(first), "eval-runs.jsonl");
  assert.equal(now.split("\n").filter(Boolean).length, 2);
  assert.deepEqual(L.checkAppendOnly(new Map([["f", before]]), new Map([["f", now]])), []);
  assert.throws(() => appendRecords([], "../escape.jsonl"), /kebab-case/);
});

test("runEvalSuite loads the case's skill and records the run against the skill file's git SHA", async () => {
  const skillFile = path.join(process.env.SKILLS_ROOT as string, "engineering", "input-validation.md");
  fs.mkdirSync(path.dirname(skillFile), { recursive: true });
  fs.writeFileSync(skillFile, SKILL_TEXT);
  const gitSha = execFileSync("git", ["hash-object", skillFile], { encoding: "utf8" }).trim();
  const response = ["---", 'status: "ready-for-handoff"', 'confidence: "MEDIUM"', "risks:", '  - "unvalidated input"', "---", "", "Validate the input."].join("\n");
  const evalCase: EvalCase = {
    id: "records-e2e",
    agentSlug: "security-engineer",
    category: "adversarial",
    description: "records test",
    input: "review this",
    taskType: "architecture",
    outputRelativePath: "testing/records-e2e.md",
    expectedOutcome: "flags a risk",
    checker: flagsAtLeastOneRisk(),
    skills: ["input-validation"],
  };
  const project = await seedFixtureProject();
  try {
    const [run] = await runEvalSuite([evalCase], {
      projectId: project.artifactsPath,
      provider: new MockProvider(response),
      record: { commit: COMMIT, writerSession: "test-session-e2e", evidence: "test", file: "e2e.jsonl" },
    });
    assert.deepEqual(run.skills, [`input-validation@${gitSha}`]);
    assert.equal(run.judge, "heuristic");
    const text = fs.readFileSync(path.join(process.env.CAPABILITY_ROOT as string, "records", "e2e.jsonl"), "utf8");
    const [line] = text.trim().split("\n").map((l) => JSON.parse(l) as EvalRunRecord);
    assert.deepEqual([line.skill_sha, line.judge, line.model, line.provider, line.n], [gitSha, "heuristic", "mock-echo", "mock", 1]);
    assert.deepEqual((await levels()).parseRecords("e2e.jsonl", text).problems, []);
  } finally {
    await prisma.evaluation.deleteMany({ where: { testCase: "records-e2e" } });
    await cleanupFixtureProject(project.id);
  }
});
