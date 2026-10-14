import path from "node:path";
import { prisma } from "../db/client";
import { runAgent, projectsRoot } from "../agents/runAgent";
import { loadAgent } from "../agents/loadAgent";
import { encodeStringList } from "../db/json";
import { resolveModel } from "@/lib/ai/router";
import type { ModelProvider } from "@/lib/ai/providers/types";
import type { HandoffStatus } from "../agents/types";
import { requireTaskType, requireOutputPath, artifactTypeFor, CRITICAL_AGENTS } from "./agentConfig";
import { estimateCostUsd } from "@/lib/ai/costs/estimateCost";
import { logEvent } from "../db/logEvent";
import { estimateComplexity, adjustModelForComplexity } from "./complexityHeuristic";
import { redactSecrets } from "../security/redact";

/**
 * The one piece of real "orchestration" logic in this phase: given a Task
 * that already has an ownerAgent, run that agent, record the result, and —
 * if the agent says its output is ready for handoff — create follow-up
 * review Tasks for everyone in that agent's reviewed_by list. This wires
 * together Phase 2 (runAgent), Phase 3 (the DB), and Phase 4 (the real
 * agent roster + their reviewed_by fields) into an actual pipeline.
 *
 * What this does NOT do (yet, deliberately, per the roadmap):
 *   - decide WHICH agent a task should go to in the first place (Task.ownerAgent
 *     must already be set — planning workstreams from a bare project objective
 *     is a separate, harder problem, out of scope for this phase)
 *   - enforce the Quality Gates (Phase 6)
 *   - actually run the follow-up review tasks it creates (they're created
 *     as READY, someone/something still has to dispatch them)
 */

const STATUS_TO_TASK_STATUS: Record<HandoffStatus, string> = {
  "ready-for-handoff": "REVIEW",
  "blocked-on-input": "BLOCKED",
  "in-progress": "IN_PROGRESS",
};

export interface DispatchOptions {
  /** Inject a provider (used by tests to avoid a live network call). Defaults to whatever the model router resolves. */
  provider?: ModelProvider;
}

export interface DispatchResult {
  taskId: string;
  artifactId: string;
  filePath: string;
  status: HandoffStatus;
  confidence: string;
  reviewTaskIds: string[];
  /** USD cost estimate for this dispatch's model call. null when the provider reported no usage (e.g. MockProvider) — never a guessed number standing in for a real one. */
  costUsd: number | null;
  /** The model actually used for this dispatch — may differ from the task type's baseline if the complexity heuristic adjusted it. */
  model: string;
}

function buildUserInput(task: { title: string; description: string | null }): string {
  return [`Task: ${task.title}`, task.description ? `\n${task.description}` : ""].join("");
}

/**
 * Run one already-assigned Task through its ownerAgent and update project
 * state accordingly. Throws if the task has no ownerAgent, or if that
 * agent has no model-router/output-path configuration — dispatch never
 * silently no-ops on a misconfigured agent.
 */
export async function dispatchTask(taskId: string, options: DispatchOptions = {}): Promise<DispatchResult> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { project: true } });
  if (!task) throw new Error(`No task found for id "${taskId}".`);
  if (!task.ownerAgent) throw new Error(`Task "${task.id}" ("${task.title}") has no ownerAgent — cannot dispatch.`);

  const agentSlug = task.ownerAgent;
  const agentDef = loadAgent(agentSlug); // throws with a clear error if the slug doesn't exist
  const taskType = requireTaskType(agentSlug);
  const outputRelativePath = requireOutputPath(agentSlug);
  const userInput = buildUserInput(task);

  await prisma.task.update({ where: { id: task.id }, data: { status: "IN_PROGRESS" } });
  await logEvent(task.projectId, agentSlug, task.id, `Dispatched task "${task.title}" to ${agentSlug}.`);

  // Per-instance complexity adjustment (src/lib/orchestrator/complexityHeuristic.ts):
  // the router's baseline model reflects what this AGENT ROLE generally
  // needs; this nudges it up or down one tier for how hard THIS task
  // instance specifically looks, at zero extra cost (no model call).
  // AGENCY_OS_DISABLE_COMPLEXITY_ROUTING=1 turns it off entirely if it
  // ever needs to be ruled out as a variable.
  // Criticality routing: critical agents never run below their role's
  // baseline model, however simple the task text looks.
  const critical = CRITICAL_AGENTS.has(agentSlug);
  let modelOverrides: { model: string } | undefined;
  if (process.env.AGENCY_OS_DISABLE_COMPLEXITY_ROUTING !== "1") {
    const baseModel = resolveModel(taskType).model;
    const { adjustment, reasons } = estimateComplexity(userInput);
    if (adjustment < 0 && critical) {
      await logEvent(task.projectId, agentSlug, task.id, `Complexity heuristic suggested a cheaper model, ignored: ${agentSlug} is a critical agent.`);
    } else if (adjustment !== 0) {
      const adjustedModel = adjustModelForComplexity(baseModel, adjustment);
      if (adjustedModel !== baseModel) {
        modelOverrides = { model: adjustedModel };
        await logEvent(
          task.projectId,
          agentSlug,
          task.id,
          `Complexity heuristic: ${adjustment > 0 ? "up" : "down"}-tiered ${baseModel} -> ${adjustedModel} (${reasons.join(", ")}).`
        );
      }
    }
  }

  // Every dispatch is metered in the AiUsage ledger, success or failure
  // (see /docs/ai/ai-cost-governance.md). A failed run leaves the task
  // BLOCKED with the reason, instead of stuck IN_PROGRESS.
  const routed = { ...resolveModel(taskType), ...modelOverrides };
  const started = Date.now();
  let result: Awaited<ReturnType<typeof runAgent>>;
  try {
    result = await runAgent({
      agentSlug,
      taskType,
      projectId: task.project.artifactsPath,
      userInput,
      outputRelativePath,
      provider: options.provider,
      modelOverrides,
    });
  } catch (err) {
    const message = redactSecrets(err instanceof Error ? err.message : String(err)).slice(0, 1000);
    await prisma.aiUsage.create({
      data: {
        task: `dispatch:${agentSlug}`,
        agentSlug,
        provider: routed.provider,
        model: routed.model,
        costSource: "UNKNOWN",
        latencyMs: Date.now() - started,
        success: false,
        error: message,
        projectId: task.projectId,
      },
    });
    await prisma.task.update({
      where: { id: task.id },
      data: { status: "BLOCKED", blockers: encodeStringList([`Agent run failed: ${message.slice(0, 300)}`]) },
    });
    await logEvent(task.projectId, agentSlug, task.id, `${agentSlug} failed: ${message.slice(0, 300)}`);
    throw err;
  }
  const latencyMs = Date.now() - started;

  const agentRow = await prisma.agent.upsert({
    where: { slug: agentSlug },
    update: {},
    create: { slug: agentSlug, role: agentDef.role, status: "ACTIVE" },
  });

  // runAgent may have written a versioned path (prd.md -> prd-v2.md) if the
  // default target already existed — record the actual path, not the
  // requested one.
  const actualRelativePath = path.relative(path.join(projectsRoot(), task.project.artifactsPath), result.filePath);

  const artifact = await prisma.artifact.create({
    data: {
      projectId: task.projectId,
      taskId: task.id,
      type: artifactTypeFor(agentSlug),
      filePath: actualRelativePath,
      createdByAgentId: agentRow.id,
    },
  });

  const newTaskStatus = STATUS_TO_TASK_STATUS[result.metadata.status];
  await prisma.task.update({ where: { id: task.id }, data: { status: newTaskStatus } });

  // Cost is reported honestly, not guessed: null (not 0) when the
  // provider gave no real figures. A MockProvider run must never look
  // like a free real run in the log. Real provider-reported cost
  // (claude-code-cli's total_cost_usd) is preferred over our own
  // pricing-table estimate when available — it's simply more accurate.
  let costUsd: number | null = null;
  let costNote = "cost unknown (provider reported no usage)";
  if (result.costUsd !== undefined) {
    costUsd = result.costUsd;
    costNote = `~$${result.costUsd.toFixed(4)} (real, reported by ${result.provider})`;
  } else if (result.usage) {
    const estimate = estimateCostUsd(result.model, result.usage);
    costUsd = estimate.priced ? estimate.usd : null;
    costNote = estimate.priced
      ? `~$${estimate.usd.toFixed(4)} (estimated, ${result.usage.inputTokens} in / ${result.usage.outputTokens} out tokens, ${result.model})`
      : `cost unknown (no pricing entry for model "${result.model}")`;
  }

  await logEvent(
    task.projectId,
    agentSlug,
    task.id,
    `${agentSlug} completed with status=${result.metadata.status}, confidence=${result.metadata.confidence}, ${costNote}.`
  );
  await prisma.aiUsage.create({
    data: {
      task: `dispatch:${agentSlug}`,
      agentSlug,
      provider: result.provider,
      model: result.model,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
      costUsd,
      costSource: result.costUsd !== undefined ? "REPORTED" : costUsd !== null ? "ESTIMATED" : "UNKNOWN",
      latencyMs,
      success: true,
      projectId: task.projectId,
    },
  });

  // Critical agents always get a human reviewer on top of any agent reviewers.
  if (critical) {
    const humanReview = await prisma.task.create({
      data: {
        title: `Human review (critical): ${task.title}`,
        description: `${agentSlug} is a critical agent. A person must review artifact ${artifact.id} before anything depends on it.`,
        projectId: task.projectId,
        status: "REVIEW",
        dependencies: encodeStringList([task.id]),
      },
    });
    await logEvent(task.projectId, agentSlug, task.id, `Created mandatory human review task ${humanReview.id} (critical agent).`);
  }

  const reviewTaskIds: string[] = [];
  if (result.metadata.status === "ready-for-handoff") {
    const reviewers = agentDef.reviewedBy.filter((slug) => slug !== "human");
    for (const reviewerSlug of reviewers) {
      const reviewTask = await prisma.task.create({
        data: {
          title: `Review: ${task.title}`,
          description: `Review the ${artifactTypeFor(agentSlug)} artifact produced by ${agentSlug} for task "${task.title}" (artifact ${artifact.id}).`,
          projectId: task.projectId,
          ownerAgent: reviewerSlug,
          status: "READY",
          dependencies: encodeStringList([task.id]),
        },
      });
      reviewTaskIds.push(reviewTask.id);
    }
    await logEvent(
      task.projectId,
      agentSlug,
      task.id,
      reviewers.length > 0
        ? `Requested review from: ${reviewers.join(", ")}.`
        : `No agent review required (reviewed_by is human-only or empty).`
    );
  }

  return {
    taskId: task.id,
    artifactId: artifact.id,
    filePath: result.filePath,
    status: result.metadata.status,
    confidence: result.metadata.confidence,
    reviewTaskIds,
    costUsd,
    model: result.model,
  };
}
