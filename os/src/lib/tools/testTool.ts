import path from "node:path";
import { runCommand, type RunCommandResult } from "../process/commandRunner";
import type { ToolDefinition } from "./types";

/**
 * The only "execute" tool in this system. Deliberately fixed: always runs
 * `npm test` in os/, no agent-supplied command or arguments — the tool's
 * input has nothing that reaches the command line. An agent can trigger
 * this tool; it cannot make it run anything other than the repo's own
 * test suite.
 */

const OS_DIR = path.join(process.cwd()); // cwd is os/ when the Next.js process or the test runner is running

interface RunTestsInput {
  /** Present only so the tool has a documented input shape; unused by the handler — kept for future per-project test scoping if this repo ever has more than one testable package. */
  note?: string;
}

export function createRunProjectTestsTool(
  runner: (cwd: string) => Promise<RunCommandResult> = (cwd) => runCommand("npm", ["test"], { cwd, timeoutMs: 60_000 })
): ToolDefinition<RunTestsInput> {
  return {
    name: "run_project_tests",
    description: "Run this repo's test suite (npm test in os/). Fixed command — no arguments are accepted or passed through.",
    requiresPermission: "execute",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const result = await runner(OS_DIR);
      const summary = result.timedOut
        ? "Test run timed out."
        : `Test run exited with code ${result.exitCode}.`;
      const output = [summary, "--- stdout ---", result.stdout, "--- stderr ---", result.stderr]
        .join("\n")
        .slice(0, 200_000);
      return { ok: !result.timedOut && result.exitCode === 0, output };
    },
  };
}

export const runProjectTestsTool = createRunProjectTestsTool();
