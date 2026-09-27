import { test } from "node:test";
import assert from "node:assert/strict";
import { ClaudeCodeCliProvider } from "./claudeCodeCli";
import type { RunCommandResult } from "../process/commandRunner";

function fakeRunner(result: Partial<RunCommandResult> & { stdout: string }) {
  return async (): Promise<RunCommandResult> => ({
    exitCode: 0,
    stderr: "",
    timedOut: false,
    truncated: false,
    ...result,
  });
}

const SUCCESS_JSON = JSON.stringify({
  result: "hello from claude cli",
  is_error: false,
  subtype: "success",
  total_cost_usd: 0.0197,
  usage: { input_tokens: 10, output_tokens: 45 },
});

test("complete() parses a successful CLI response into a CompletionResult", async () => {
  const provider = new ClaudeCodeCliProvider("claude", 60_000, fakeRunner({ stdout: SUCCESS_JSON }));
  const result = await provider.complete({ systemPrompt: "sys", userPrompt: "user", model: "claude-haiku-4-5-20251001", maxTokens: 100 });

  assert.equal(result.text, "hello from claude cli");
  assert.equal(result.provider, "claude-code-cli");
  assert.equal(result.model, "claude-haiku-4-5-20251001");
  assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 45 });
  assert.equal(result.costUsd, 0.0197);
});

test("complete() passes --allowedTools '' so the underlying call never has ambient tool access", async () => {
  let capturedArgs: string[] = [];
  const runner = async (cmd: string, args: string[]): Promise<RunCommandResult> => {
    capturedArgs = args;
    return { exitCode: 0, stdout: SUCCESS_JSON, stderr: "", timedOut: false, truncated: false };
  };
  const provider = new ClaudeCodeCliProvider("claude", 60_000, runner);
  await provider.complete({ systemPrompt: "sys", userPrompt: "user", model: "claude-sonnet-5", maxTokens: 100 });

  const allowedToolsIndex = capturedArgs.indexOf("--allowedTools");
  assert.ok(allowedToolsIndex !== -1, "--allowedTools must be passed");
  assert.equal(capturedArgs[allowedToolsIndex + 1], "", "--allowedTools must be an empty string (no tools)");
});

test("complete() passes --max-budget-usd as a per-call safety cap", async () => {
  let capturedArgs: string[] = [];
  const runner = async (cmd: string, args: string[]): Promise<RunCommandResult> => {
    capturedArgs = args;
    return { exitCode: 0, stdout: SUCCESS_JSON, stderr: "", timedOut: false, truncated: false };
  };
  const provider = new ClaudeCodeCliProvider("claude", 60_000, runner, 2.5);
  await provider.complete({ systemPrompt: "sys", userPrompt: "user", model: "claude-sonnet-5", maxTokens: 100 });

  const budgetIndex = capturedArgs.indexOf("--max-budget-usd");
  assert.ok(budgetIndex !== -1);
  assert.equal(capturedArgs[budgetIndex + 1], "2.5");
});

test("complete() throws a clear error on a non-zero exit code", async () => {
  const provider = new ClaudeCodeCliProvider(
    "claude",
    60_000,
    fakeRunner({ stdout: "", exitCode: 1, stderr: "not logged in" })
  );
  await assert.rejects(
    () => provider.complete({ systemPrompt: "s", userPrompt: "u", model: "claude-sonnet-5", maxTokens: 100 }),
    /exited with code 1/
  );
});

test("complete() throws a clear error on timeout", async () => {
  const provider = new ClaudeCodeCliProvider("claude", 60_000, fakeRunner({ stdout: "", timedOut: true }));
  await assert.rejects(
    () => provider.complete({ systemPrompt: "s", userPrompt: "u", model: "claude-sonnet-5", maxTokens: 100 }),
    /timed out/
  );
});

test("complete() throws a clear error when stdout isn't valid JSON", async () => {
  const provider = new ClaudeCodeCliProvider("claude", 60_000, fakeRunner({ stdout: "not json at all" }));
  await assert.rejects(
    () => provider.complete({ systemPrompt: "s", userPrompt: "u", model: "claude-sonnet-5", maxTokens: 100 }),
    /wasn't valid JSON/
  );
});

test("complete() throws when the CLI itself reports is_error:true, even with exit code 0", async () => {
  const errorJson = JSON.stringify({ result: "something went wrong internally", is_error: true, subtype: "error" });
  const provider = new ClaudeCodeCliProvider("claude", 60_000, fakeRunner({ stdout: errorJson }));
  await assert.rejects(
    () => provider.complete({ systemPrompt: "s", userPrompt: "u", model: "claude-sonnet-5", maxTokens: 100 }),
    /claude CLI reported an error/
  );
});

test("complete() throws when a run stops on a limit without an answer, even with is_error:false", async () => {
  const budgetJson = JSON.stringify({ is_error: false, subtype: "error_max_budget_usd" });
  const provider = new ClaudeCodeCliProvider("claude", 60_000, fakeRunner({ stdout: budgetJson }));
  await assert.rejects(
    () => provider.complete({ systemPrompt: "s", userPrompt: "u", model: "claude-sonnet-5", maxTokens: 100 }),
    /returned no answer \(error_max_budget_usd\)/
  );
});

test("complete() leaves usage/costUsd undefined (not a fabricated number) when the CLI response omits them", async () => {
  const minimalJson = JSON.stringify({ result: "ok", is_error: false, subtype: "success" });
  const provider = new ClaudeCodeCliProvider("claude", 60_000, fakeRunner({ stdout: minimalJson }));
  const result = await provider.complete({ systemPrompt: "s", userPrompt: "u", model: "claude-sonnet-5", maxTokens: 100 });
  assert.equal(result.usage, undefined);
  assert.equal(result.costUsd, undefined);
});

test("webTools: true allows exactly WebSearch and WebFetch, nothing that touches files or runs commands", async () => {
  let capturedArgs: string[] = [];
  const runner = async (cmd: string, args: string[]): Promise<RunCommandResult> => {
    capturedArgs = args;
    return { exitCode: 0, stdout: SUCCESS_JSON, stderr: "", timedOut: false, truncated: false };
  };
  const provider = new ClaudeCodeCliProvider("claude", 60_000, runner, 1.0, { webTools: true });
  await provider.complete({ systemPrompt: "sys", userPrompt: "user", model: "claude-sonnet-5", maxTokens: 100 });
  const allowed = capturedArgs[capturedArgs.indexOf("--allowedTools") + 1];
  assert.deepEqual(allowed.split(","), ["WebSearch", "WebFetch"]);
});
