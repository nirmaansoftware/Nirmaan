import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RunAgentResult } from "../agents/runAgent";
import type { Checker, CheckResult } from "./types";

/**
 * A tool judge (decision record D6.9: "Tested needs a tool judge: a test run,
 * a schema check or a scored metric"). The agent's output is written to a
 * scratch folder, then a hidden `node --test` suite or a command runs there.
 * Exit code 0 passes; the command and its exit code are recorded. The suite is
 * hidden in that it is never part of the agent's prompt.
 *
 * The run gets only PATH, HOME (the scratch folder) and CI in its
 * environment, so no token or key reaches it, the same rule as examples CI.
 */
export interface ToolJudgeSpec {
  /** The files to judge, taken from the agent's output: a path relative to the scratch folder, mapped to its content. None fails the case. */
  files: (result: RunAgentResult) => Record<string, string>;
  /** A hidden node:test file (absolute path). It is copied next to the files and run with `node --test`. */
  suite?: string;
  /** Instead of a suite: a command to run in the scratch folder, as argv. */
  command?: string[];
  /** Default 60 seconds. A run that times out fails. */
  timeoutMs?: number;
}

const OUTPUT_TAIL = 600;

/** The first fenced code block in a raw agent response, optionally of one language ("js", "ts", ...). */
export function firstFencedBlock(raw: string, lang?: string): string | undefined {
  const re = /```([\w+-]*)[^\n]*\n([\s\S]*?)```/g;
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    if (!lang || m[1] === lang) return m[2];
  }
  return undefined;
}

/** Resolve a relative path inside `dir`, refusing anything that would land outside it. */
function inside(dir: string, rel: string): string {
  const target = path.resolve(dir, rel);
  if (path.isAbsolute(rel) || !target.startsWith(dir + path.sep)) {
    throw new Error(`The file path "${rel}" would land outside the judge's scratch folder.`);
  }
  return target;
}

export function toolJudge(spec: ToolJudgeSpec): Checker {
  if (Boolean(spec.suite) === Boolean(spec.command?.length)) {
    throw new Error("A tool judge needs exactly one of `suite` (a hidden node:test file) or `command`.");
  }
  if (spec.suite && !path.isAbsolute(spec.suite)) throw new Error(`The hidden suite path must be absolute: ${spec.suite}`);
  const suiteName = spec.suite ? `hidden-${path.basename(spec.suite)}` : undefined;
  const argv = spec.suite ? ["node", "--test", suiteName as string] : (spec.command as string[]);
  const command = argv.join(" ");

  const check = (result: RunAgentResult): CheckResult => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tool-judge-")));
    try {
      let files: Record<string, string>;
      try {
        files = spec.files(result);
        if (!Object.keys(files).length) return { passed: false, reason: "The output holds no file for the tool judge to run.", command, exitCode: 1 };
        for (const [rel, content] of Object.entries(files)) {
          const target = inside(dir, rel);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, content);
        }
      } catch (e) {
        return { passed: false, reason: (e as Error).message, command, exitCode: 1 };
      }
      if (spec.suite) fs.copyFileSync(spec.suite, path.join(dir, suiteName as string));

      const run = spawnSync(argv[0] === "node" ? process.execPath : argv[0], argv.slice(1), {
        cwd: dir,
        // Only these three; the cast is because Next's ProcessEnv type requires NODE_ENV.
        env: { PATH: process.env.PATH ?? "", HOME: dir, CI: "1" } as unknown as NodeJS.ProcessEnv,
        encoding: "utf8",
        timeout: spec.timeoutMs ?? 60_000,
      });
      const timedOut = run.error && (run.error as NodeJS.ErrnoException).code === "ETIMEDOUT";
      const exitCode = typeof run.status === "number" ? run.status : 1;
      const output = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim().slice(-OUTPUT_TAIL);
      const passed = exitCode === 0 && !timedOut;
      const why = timedOut ? "timed out" : run.error ? `did not start (${run.error.message})` : `exited ${exitCode}`;
      return { passed, reason: `"${command}" ${why}.${output ? `\n${output}` : ""}`, command, exitCode: passed ? 0 : exitCode || 1 };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  return Object.assign(check, { judge: "tool" as const });
}
