import { spawn, type SpawnOptionsWithoutStdio } from "node:child_process";

/**
 * The one place anything in this codebase is allowed to execute an
 * external process. Deliberately narrow: takes a command and an argv
 * array, never a shell string — so there is no shell-interpolation
 * surface for an agent-supplied value to exploit, by construction, not by
 * sanitization. Callers (e.g. testTool.ts) hardcode the command and args;
 * nothing here accepts a raw string to execute.
 */

const MAX_OUTPUT_BYTES = 200_000; // ~200KB cap per stream, enough for a test report, not enough to be a resource-exhaustion vector

export interface RunCommandOptions {
  cwd: string;
  timeoutMs: number;
  env?: Record<string, string>;
}

export interface RunCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
}

export function runCommand(command: string, args: string[], options: RunCommandOptions): Promise<RunCommandResult> {
  return new Promise((resolve) => {
    const spawnOptions: SpawnOptionsWithoutStdio = {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
    };
    const child = spawn(command, args, spawnOptions);

    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);

    function append(current: string, chunk: Buffer): string {
      if (current.length >= MAX_OUTPUT_BYTES) {
        truncated = true;
        return current;
      }
      return current + chunk.toString("utf-8");
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr, timedOut, truncated });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ exitCode: null, stdout, stderr: `${stderr}\n[spawn error: ${err.message}]`, timedOut, truncated });
    });
  });
}
