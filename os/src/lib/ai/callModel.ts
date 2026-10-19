import { prisma } from "../db/client";
import { resolveModel, type TaskType, type ModelConfig } from "@/lib/ai/router";
import { estimateCostUsd } from "@/lib/ai/costs/estimateCost";
import { redactSecrets } from "../security/redact";
import type { CompletionResult, ModelProvider } from "@/lib/ai/providers/types";
import { providerFor } from "@/lib/ai/providerFor";

/**
 * The metered way to call a model. Every call through here writes one
 * AiUsage row (success or failure) with model, tokens (cache reads and
 * writes included when the provider reports them), cost, latency and
 * what it was for, so "what does AI cost us, per task and per project?"
 * is a query instead of a guess. See /docs/ai/ai-cost-governance.md.
 *
 * Cost source, in order of trust: REPORTED by the provider, ESTIMATED from
 * real token counts and pricing.ts, or UNKNOWN (never a made-up number).
 */
export interface CallModelInput {
  /** What the call is for, e.g. "discovery". Used for cost reporting. */
  task: string;
  taskType: TaskType;
  agentSlug?: string;
  systemPrompt: string;
  userPrompt: string;
  leadId?: string;
  projectId?: string;
  prospectId?: string;
  /** Tests inject a provider; production uses the model router's choice. */
  provider?: ModelProvider;
  modelOverrides?: Partial<ModelConfig>;
}

export interface CallModelResult {
  completion: CompletionResult;
  usageId: string;
}

export async function callModel(input: CallModelInput): Promise<CallModelResult> {
  const config = resolveModel(input.taskType, input.modelOverrides);
  const provider = input.provider ?? providerFor(config);
  const started = Date.now();

  try {
    const completion = await provider.complete({
      systemPrompt: input.systemPrompt,
      userPrompt: input.userPrompt,
      model: config.model,
      maxTokens: config.maxTokens,
    });
    const cost = costOf(completion);
    const row = await prisma.aiUsage.create({
      data: {
        task: input.task,
        agentSlug: input.agentSlug,
        provider: completion.provider,
        model: completion.model,
        inputTokens: completion.usage?.inputTokens,
        outputTokens: completion.usage?.outputTokens,
        cacheReadInputTokens: completion.usage?.cacheReadInputTokens,
        cacheCreationInputTokens: completion.usage?.cacheCreationInputTokens,
        costUsd: cost.usd,
        costSource: cost.source,
        latencyMs: Date.now() - started,
        success: true,
        leadId: input.leadId,
        projectId: input.projectId,
        prospectId: input.prospectId,
      },
    });
    return { completion, usageId: row.id };
  } catch (err) {
    await prisma.aiUsage.create({
      data: {
        task: input.task,
        agentSlug: input.agentSlug,
        provider: config.provider,
        model: config.model,
        costSource: "UNKNOWN",
        latencyMs: Date.now() - started,
        success: false,
        error: redactSecrets(err instanceof Error ? err.message : String(err)).slice(0, 1000),
        leadId: input.leadId,
        projectId: input.projectId,
        prospectId: input.prospectId,
      },
    });
    throw err;
  }
}

function costOf(c: CompletionResult): { usd: number | null; source: "REPORTED" | "ESTIMATED" | "UNKNOWN" } {
  if (typeof c.costUsd === "number") return { usd: c.costUsd, source: "REPORTED" };
  if (c.usage) {
    const est = estimateCostUsd(c.model, c.usage);
    if (est.priced) return { usd: est.usd, source: "ESTIMATED" };
  }
  return { usd: null, source: "UNKNOWN" };
}
