import { prisma } from "../db/client";

/**
 * Data-layer summary matching what the architecture plan's Section 30
 * (Project Dashboard) asks for: project stage, task status breakdown,
 * pending approvals, and estimated spend. Not wired into any UI yet —
 * that's a natural next step once there's an actual dashboard view for
 * it, deliberately out of scope here (this phase is about the data being
 * correct and available, not about a new screen).
 *
 * Cost is parsed out of Event messages written by
 * src/lib/orchestrator/dispatch.ts's cost-tagged completion log line
 * (the "~$0.0123 (...)" pattern) rather than summed from a dedicated
 * cost table — there isn't one in the committed Data Model (see
 * /docs/history/agency-os-plan.md Section E), and adding one wasn't
 * necessary to get a real number. This is honestly a v1 approach: a
 * dedicated cost-ledger table would be a reasonable next step once
 * spend tracking needs to do more than "what has this project cost so
 * far."
 */

const COST_PATTERN = /~\$(\d+\.\d+)/;

export interface ProjectActivitySummary {
  projectId: string;
  stage: string;
  taskCountsByStatus: Record<string, number>;
  approvalCountsByStatus: Record<string, number>;
  pendingApprovals: number;
  estimatedSpendUsd: number;
  pricedDispatchCount: number;
  unpricedDispatchCount: number;
}

export async function getProjectActivitySummary(projectId: string): Promise<ProjectActivitySummary> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  const [tasks, approvals, events] = await Promise.all([
    prisma.task.findMany({ where: { projectId }, select: { status: true } }),
    prisma.approval.findMany({ where: { projectId }, select: { status: true } }),
    prisma.event.findMany({ where: { projectId }, select: { message: true } }),
  ]);

  const taskCountsByStatus: Record<string, number> = {};
  for (const t of tasks) taskCountsByStatus[t.status] = (taskCountsByStatus[t.status] ?? 0) + 1;

  const approvalCountsByStatus: Record<string, number> = {};
  for (const a of approvals) approvalCountsByStatus[a.status] = (approvalCountsByStatus[a.status] ?? 0) + 1;

  let estimatedSpendUsd = 0;
  let pricedDispatchCount = 0;
  let unpricedDispatchCount = 0;
  for (const e of events) {
    if (!e.message.includes("completed with status=")) continue; // only dispatch-completion lines carry a cost figure
    const match = e.message.match(COST_PATTERN);
    if (match) {
      estimatedSpendUsd += parseFloat(match[1]);
      pricedDispatchCount += 1;
    } else if (e.message.includes("cost unknown")) {
      unpricedDispatchCount += 1;
    }
  }

  return {
    projectId,
    stage: project.stage,
    taskCountsByStatus,
    approvalCountsByStatus,
    pendingApprovals: approvalCountsByStatus["PENDING"] ?? 0,
    estimatedSpendUsd,
    pricedDispatchCount,
    unpricedDispatchCount,
  };
}
