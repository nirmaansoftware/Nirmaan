import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { EvalRunResult, Judge } from "./types";

/**
 * Writes eval runs as `eval_run` lines of capability/records/*.jsonl, in the
 * shape of capability/records/schema.json (capability/README.md). The lines
 * are written by the tool run (`written_by: tool`), never by a skill's
 * writer, and only appended. Live model evals run locally and their lines are
 * committed (decision record D6.9); capability/tools/levels.mjs then decides
 * what counts: heuristic and mock runs never count toward Tested.
 */
export interface EvalRunRecord {
  record_id: string;
  event: "eval_run";
  skill_id: string;
  skill_sha: string;
  commit: string;
  result: "pass" | "fail";
  evidence: string;
  written_by: "tool";
  writer_session: string;
  judge: Judge;
  command: string;
  exit_code: number;
  n: number;
  model: string;
  provider: string;
  note?: string;
}

export interface RecordContext {
  /** The repository commit the run was against (40 hex). See currentCommit(). */
  commit: string;
  /** The session or run that writes the lines; it makes each record id unique. */
  writerSession: string;
  /** A pointer to the evidence, e.g. a local log path or a CI run. Client work is never copied into it. */
  evidence: string;
}

/** capability/ lives at the repo root next to os/; CAPABILITY_ROOT overrides it (tests). */
export function capabilityRoot(): string {
  return process.env.CAPABILITY_ROOT ?? path.join(process.cwd(), "..", "capability");
}

/** The checked-out commit, from git at the repo root. */
export function currentCommit(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: path.join(capabilityRoot(), ".."), encoding: "utf8" }).trim();
}

const HEX40 = /^[0-9a-f]{40}$/;

/**
 * One `eval_run` line per skill, judge, model and provider in the results.
 * `n` is the number of cases, the line passes only when every case passed,
 * and every failing case id is kept in `note`. A result that loaded no skill
 * gives no line: records are about skills.
 */
export function evalRunRecords(results: EvalRunResult[], ctx: RecordContext): EvalRunRecord[] {
  if (!HEX40.test(ctx.commit)) throw new Error(`commit must be a 40-character SHA, got "${ctx.commit}".`);
  if (!ctx.writerSession.trim()) throw new Error("writerSession is required.");
  const groups = new Map<string, { id: string; sha: string; judge: Judge; model: string; provider: string; runs: EvalRunResult[] }>();
  for (const r of results) {
    for (const ref of r.skills) {
      const at = ref.lastIndexOf("@");
      const id = ref.slice(0, at);
      const sha = ref.slice(at + 1);
      if (at < 1 || !HEX40.test(sha)) throw new Error(`Skill reference "${ref}" is not id@sha.`);
      const key = [id, sha, r.judge, r.model, r.provider].join("\u0000");
      if (!groups.has(key)) groups.set(key, { id, sha, judge: r.judge, model: r.model, provider: r.provider, runs: [] });
      groups.get(key)!.runs.push(r);
    }
  }
  return [...groups.values()].map((g, i) => {
    const failed = g.runs.filter((r) => !r.passed);
    const commands = [...new Set(g.runs.map((r) => r.command ?? `${r.judge} checker (os/src/lib/evaluation)`))];
    const firstBad = failed.find((r) => typeof r.exitCode === "number" && r.exitCode !== 0);
    const record: EvalRunRecord = {
      record_id: `eval:${ctx.writerSession}:${g.id}:${g.judge}:${i + 1}`,
      event: "eval_run",
      skill_id: g.id,
      skill_sha: g.sha,
      commit: ctx.commit,
      result: failed.length ? "fail" : "pass",
      evidence: ctx.evidence,
      written_by: "tool",
      writer_session: ctx.writerSession,
      judge: g.judge,
      command: commands.join(" ; "),
      exit_code: failed.length ? (firstBad?.exitCode ?? 1) : 0,
      n: g.runs.length,
      model: g.model,
      provider: g.provider,
    };
    if (failed.length) record.note = `failed cases: ${failed.map((r) => r.case.id).join(", ")}`;
    return record;
  });
}

/** Append lines to capability/records/<file> (default eval-runs.jsonl). Never rewrites a line. */
export function appendRecords(records: EvalRunRecord[], file = "eval-runs.jsonl"): string {
  if (!/^[a-z0-9-]+\.jsonl$/.test(file)) throw new Error(`Records file name must be kebab-case .jsonl: ${file}`);
  const target = path.join(capabilityRoot(), "records", file);
  if (!records.length) return target;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  const lead = existing && !existing.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(target, lead + records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return target;
}
