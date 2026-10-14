import { prisma } from "../db/client";
import { audit } from "../audit";
import { logEvent } from "../db/logEvent";
import { assertCan } from "../auth/permissions";
import type { Actor } from "../auth/actor";
import type { ModelProvider } from "@/lib/ai/providers/types";
import { decodeStringList } from "../db/json";
import { dispatchTask } from "../orchestrator/dispatch";

/**
 * The orchestrator loop: dispatch READY agent tasks whose dependencies are
 * satisfied, one at a time, until the batch size or the project's AI budget
 * is reached, or a run fails. Every run is metered (dispatch → AiUsage), so
 * the budget check always sees real spend.
 *
 * Deliberately conservative:
 *   - no project budget set → nothing runs (automation is opt-in per project)
 *   - it stops at the first failure instead of pressing on
 *   - critical agents' output still needs a human review task (dispatch.ts)
 *   - nothing here can deploy, approve a gate or contact a client
 */
export const DONE_ENOUGH = ["REVIEW", "APPROVED", "DONE"];
export const DEFAULT_BATCH = 3;
export const MAX_BATCH = 10;

export async function projectAiSpend(projectId: string) {
  const agg = await prisma.aiUsage.aggregate({ where: { projectId }, _sum: { costUsd: true }, _count: true });
  const unknown = await prisma.aiUsage.count({ where: { projectId, costUsd: null } });
  return { spentUsd: agg._sum.costUsd ?? 0, calls: agg._count, unknownCostCalls: unknown };
}

export async function setAiBudget(actor: Actor, projectId: string, budgetUsd: number | null) {
  assertCan(actor.role, "factory:review");
  if (budgetUsd !== null && (!Number.isFinite(budgetUsd) || budgetUsd < 0 || budgetUsd > 10_000)) {
    throw new Error("Budget must be between $0 and $10,000.");
  }
  await prisma.project.update({ where: { id: projectId }, data: { aiBudgetUsd: budgetUsd } });
  await audit(actor, "factory.budget_set", "Project", projectId, budgetUsd === null ? "cleared" : `$${budgetUsd}`);
}

/** READY agent tasks whose dependencies are all at least in review, oldest first. */
export async function runnableTasks(projectId: string) {
  const tasks = await prisma.task.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  const status = new Map(tasks.map((t) => [t.id, t.status]));
  return tasks.filter(
    (t) => t.status === "READY" && t.ownerAgent && decodeStringList(t.dependencies).every((d) => DONE_ENOUGH.includes(status.get(d) ?? ""))
  );
}

export interface OrchestrationResult {
  dispatched: { taskId: string; title: string; agent: string; status: string; costUsd: number | null }[];
  stoppedBecause: string;
}

export async function runReadyTasks(
  actor: Actor,
  projectId: string,
  opts: { maxTasks?: number; provider?: ModelProvider } = {}
): Promise<OrchestrationResult> {
  assertCan(actor.role, "factory:run");
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (project.aiBudgetUsd === null) throw new Error("Set an AI budget for this project before running agents automatically.");
  const maxTasks = Math.max(1, Math.min(MAX_BATCH, Math.floor(opts.maxTasks ?? DEFAULT_BATCH)));

  const dispatched: OrchestrationResult["dispatched"] = [];
  let stoppedBecause = `Ran the batch of ${maxTasks}.`;
  await audit(actor, "factory.dispatch_started", "Project", projectId, `batch ${maxTasks}, budget $${project.aiBudgetUsd}`);

  while (dispatched.length < maxTasks) {
    const { spentUsd } = await projectAiSpend(projectId);
    if (spentUsd >= project.aiBudgetUsd) {
      stoppedBecause = `AI budget reached ($${spentUsd.toFixed(2)} of $${project.aiBudgetUsd.toFixed(2)}).`;
      break;
    }
    const [next] = await runnableTasks(projectId);
    if (!next) {
      stoppedBecause = dispatched.length ? "No more tasks are ready." : "No tasks are ready (all waiting on dependencies, done, or unassigned).";
      break;
    }
    try {
      const r = await dispatchTask(next.id, { provider: opts.provider });
      dispatched.push({ taskId: next.id, title: next.title, agent: next.ownerAgent!, status: r.status, costUsd: r.costUsd });
    } catch (err) {
      stoppedBecause = `Stopped: ${next.title} failed (${err instanceof Error ? err.message.slice(0, 200) : "unknown error"}). The task is marked blocked.`;
      break;
    }
  }

  await logEvent(projectId, "orchestrator", null, `${actor.label} ran ${dispatched.length} agent task(s). ${stoppedBecause}`);
  return { dispatched, stoppedBecause };
}
