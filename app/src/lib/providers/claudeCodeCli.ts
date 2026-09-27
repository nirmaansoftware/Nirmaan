import { runCommand, type RunCommandResult } from "../process/commandRunner";
import type { CompletionRequest, CompletionResult, ModelProvider } from "./types";

/**
 * Runs a completion through the `claude` CLI itself rather than the
 * Anthropic API directly — billed against the founder's existing Claude
 * subscription (Pro/Max/Team), not metered per-token API usage. This is
 * the default live provider; see /docs/architecture-plan.md's Technology
 * Decisions for why (the founder explicitly doesn't want to fund a
 * separate metered API budget for this system).
 *
 * Each call is a fresh, isolated, non-interactive `claude -p` invocation
 * with tool access deliberately disabled (`--allowedTools ""`). Verified
 * empirically before writing this: an attempted tool use in that mode is
 * denied automatically (shows up in the JSON result's permission_denials,
 * the call still completes) — it is not silently granted, and it does
 * not hang waiting for a permission prompt that will never come in
 * non-interactive mode. This matters: tool access for agents is Phase 7's
 * scoped registry (src/lib/tools/), not ambient filesystem/bash access
 * inside the raw model call. Giving the underlying `claude` process real
 * tool access here would let every agent silently bypass that whole
 * permission model — this provider's only job is turning a system prompt
 * + user prompt into text, the same contract AnthropicProvider has.
 *
 * One narrow exception, opted into by name: `webTools: true` allows exactly
 * WebSearch and WebFetch (read-only access to the public web) and nothing
 * else. Only prospecting's web search uses it (src/lib/prospecting/webSearch.ts),
 * through webResearchProvider() in src/lib/ai/providers.ts. No filesystem,
 * shell or edit tool is ever allowed.
 */
export const WEB_TOOLS = ["WebSearch", "WebFetch"] as const;

interface ClaudeCliJsonResult {
  result: string;
  is_error: boolean;
  subtype: string;
  total_cost_usd?: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class ClaudeCodeCliProvider implements ModelProvider {
  constructor(
    private execPath: string = process.env.CLAUDE_CODE_EXECPATH ?? "claude",
    private timeoutMs: number = 180_000,
    /** Injected in tests to avoid actually shelling out. Defaults to the real runner. */
    private runner: (cmd: string, args: string[], opts: { cwd: string; timeoutMs: number }) => Promise<RunCommandResult> = runCommand,
    /** Hard per-call cost cap (the CLI's own --max-budget-usd), independent of any application-level budget logic — a second, cheap line of defense against one runaway call, per Section 35's cost-control principle. */
    private maxBudgetUsd: number = 1.0,
    private options: { webTools?: boolean } = {}
  ) {}

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const args = [
      "-p",
      "--output-format",
      "json",
      "--model",
      req.model,
      "--allowedTools",
      this.options.webTools ? WEB_TOOLS.join(",") : "",
      "--max-budget-usd",
      String(this.maxBudgetUsd),
      "--system-prompt",
      req.systemPrompt,
      req.userPrompt,
    ];

    const result = await this.runner(this.execPath, args, { cwd: process.cwd(), timeoutMs: this.timeoutMs });

    if (result.timedOut) {
      throw new Error(`claude CLI call timed out after ${this.timeoutMs}ms.`);
    }
    if (result.exitCode !== 0) {
      throw new Error(
        `claude CLI exited with code ${result.exitCode}. Is it installed and logged in? stderr: ${result.stderr || "(empty)"}`
      );
    }

    let parsed: ClaudeCliJsonResult;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      throw new Error(`claude CLI returned output that wasn't valid JSON: ${result.stdout.slice(0, 500)}`);
    }

    if (parsed.is_error) {
      throw new Error(`claude CLI reported an error: ${parsed.result}`);
    }
    // A run stopped by a limit (budget, turns) can come back with is_error false and no answer.
    if (parsed.subtype !== "success" || typeof parsed.result !== "string" || !parsed.result.trim()) {
      throw new Error(`claude CLI returned no answer (${parsed.subtype || "no subtype"}): ${result.stdout.slice(0, 500)}`);
    }

    return {
      text: parsed.result,
      provider: "claude-code-cli",
      model: req.model,
      usage: parsed.usage
        ? { inputTokens: parsed.usage.input_tokens, outputTokens: parsed.usage.output_tokens }
        : undefined,
      costUsd: parsed.total_cost_usd,
    };
  }
}
