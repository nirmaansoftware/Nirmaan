/**
 * Provider-agnostic model routing (see /docs/history/agency-os-plan.md Section K:
 * "Model routing abstraction, not a hardcoded provider"). Nothing outside
 * this file should hardcode a model id or provider name — agents ask for a
 * TaskType and get back whatever this file currently maps it to.
 *
 * Default provider is "claude-code-cli" (src/lib/ai/providers/claudeCodeCli.ts):
 * it shells out to the founder's own `claude` CLI, billed against their
 * existing Claude subscription rather than a separate metered API budget
 * they explicitly don't want to fund. "anthropic" (the raw API,
 * src/lib/ai/providers/anthropic.ts) still exists and still works if that
 * tradeoff ever changes, but nothing routes to it by default.
 *
 * Defaults can be overridden per task type via environment variables:
 *   AGENCY_OS_MODEL_<TASKTYPE>_PROVIDER=claude-code-cli|anthropic|mock
 *   AGENCY_OS_MODEL_<TASKTYPE>_ID=<model id>
 */

export type ModelProviderName = "claude-code-cli" | "anthropic" | "mock";

export type TaskType =
  | "requirements" // Product Manager, Business Analyst
  | "classification" // cheap routing/triage decisions
  | "content" // Content Strategist, Technical Writer, Brand
  | "architecture" // Principal Architect, complex reasoning
  | "code" // Frontend/Backend/Database Engineers
  | "research"; // Market Research, search-capable work

export interface ModelConfig {
  provider: ModelProviderName;
  model: string;
  maxTokens: number;
}

// Model ids per Claude's currently available family. Change here, not at
// call sites, when models change — that's the entire point of routing
// through this file.
const DEFAULT_ROUTES: Record<TaskType, ModelConfig> = {
  requirements: { provider: "claude-code-cli", model: "claude-sonnet-5", maxTokens: 4096 },
  classification: { provider: "claude-code-cli", model: "claude-haiku-4-5-20251001", maxTokens: 1024 },
  content: { provider: "claude-code-cli", model: "claude-sonnet-5", maxTokens: 4096 },
  architecture: { provider: "claude-code-cli", model: "claude-opus-5", maxTokens: 8192 },
  code: { provider: "claude-code-cli", model: "claude-sonnet-5", maxTokens: 8192 },
  research: { provider: "claude-code-cli", model: "claude-sonnet-5", maxTokens: 4096 },
};

function envOverride(taskType: TaskType): Partial<ModelConfig> {
  const key = taskType.toUpperCase();
  const provider = process.env[`AGENCY_OS_MODEL_${key}_PROVIDER`] as ModelProviderName | undefined;
  const model = process.env[`AGENCY_OS_MODEL_${key}_ID`];
  const override: Partial<ModelConfig> = {};
  if (provider) override.provider = provider;
  if (model) override.model = model;
  return override;
}

export function resolveModel(taskType: TaskType, overrides?: Partial<ModelConfig>): ModelConfig {
  const base = DEFAULT_ROUTES[taskType];
  if (!base) {
    throw new Error(`No model route configured for task type "${taskType}".`);
  }
  return { ...base, ...envOverride(taskType), ...overrides };
}
