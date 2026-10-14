import { prisma } from "../db/client";
import { OPEN_LEAD_STATUSES } from "../db/enums";
import { cfoSummary } from "../finance/summary";

/**
 * "NIRMAAN TODAY": the founder's one screen. It shows only numbers the
 * system actually has. Phase 3 metrics (revenue, outstanding, MRR, margin)
 * are returned as `null` with a reason, so the UI shows "not tracked yet"
 * instead of a zero that looks like a fact.
 */
export const STALE_LEAD_DAYS = 3;
export const STALE_PROPOSAL_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

export interface Exception {
  severity: "high" | "medium";
  label: string;
  href: string;
}

export interface Today {
  newLeads7d: number;
  openLeads: number;
  pipelineValue: number; // INR, proposals out with clients
  proposalsOut: number;
  conversionRate: number | null; // WON / decided leads, last 90 days
  activeProjects: number;
  projectsAtRisk: number;
  pendingApprovals: number;
  openChangeRequests: number;
  aiCost30dUsd: number | null;
  aiCalls30d: number;
  aiUnknownCost30d: number;
  money: { collected30d: number; outstanding: number; overdue: number; overdueCount: number; mrr: number; grossMarginActual: number | null } | null;
  exceptions: Exception[];
}

const INACTIVE_STAGES = ["LEAD", "DISCOVERY", "REQUIREMENTS", "ESTIMATION", "PROPOSAL", "MONITORING", "MAINTENANCE"];

/** Money figures are only computed for people who may see them (finance:read). */
export async function getToday(now = new Date(), opts: { includeMoney?: boolean } = {}): Promise<Today> {
  const since7 = new Date(now.getTime() - 7 * DAY);
  const since30 = new Date(now.getTime() - 30 * DAY);
  const since90 = new Date(now.getTime() - 90 * DAY);
  const staleLeadBefore = new Date(now.getTime() - STALE_LEAD_DAYS * DAY);
  const staleProposalBefore = new Date(now.getTime() - STALE_PROPOSAL_DAYS * DAY);

  const [
    newLeads7d,
    openLeads,
    proposalsOut,
    won90,
    lost90,
    activeProjects,
    pendingApprovals,
    openCRs,
    ai,
    aiUnknown,
    staleLeads,
    staleProposals,
    clarifications,
    oldApprovals,
    blockedTasks,
  ] = await Promise.all([
    prisma.lead.count({ where: { createdAt: { gte: since7 }, status: { not: "SPAM" } } }),
    prisma.lead.count({ where: { status: { in: [...OPEN_LEAD_STATUSES] } } }),
    prisma.proposal.findMany({ where: { status: "SENT" }, select: { priceTotal: true } }),
    prisma.lead.count({ where: { status: "WON", updatedAt: { gte: since90 } } }),
    prisma.lead.count({ where: { status: "LOST", updatedAt: { gte: since90 } } }),
    prisma.project.count({ where: { stage: { notIn: INACTIVE_STAGES } } }),
    prisma.approval.count({ where: { status: "PENDING" } }),
    prisma.changeRequest.count({ where: { status: { in: ["OPEN", "ASSESSED"] } } }),
    prisma.aiUsage.aggregate({ where: { createdAt: { gte: since30 } }, _sum: { costUsd: true }, _count: true }),
    prisma.aiUsage.count({ where: { createdAt: { gte: since30 }, costUsd: null } }),
    prisma.lead.findMany({
      where: { status: { in: ["NEW", "DISCOVERY"] }, lastActivityAt: { lt: staleLeadBefore } },
      select: { id: true, code: true, contactName: true },
      take: 10,
    }),
    prisma.proposal.findMany({
      where: { status: "SENT", sentAt: { lt: staleProposalBefore } },
      select: { id: true, code: true, title: true },
      take: 10,
    }),
    prisma.proposal.findMany({ where: { status: "CLARIFICATION_REQUESTED" }, select: { id: true, code: true }, take: 10 }),
    prisma.approval.findMany({
      where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - 2 * DAY) } },
      select: { gate: true, project: { select: { id: true, name: true } } },
      take: 10,
    }),
    prisma.task.findMany({
      where: { status: "BLOCKED" },
      select: { title: true, project: { select: { id: true, name: true } } },
      take: 10,
    }),
  ]);

  const projectsWithBlocked = new Set(blockedTasks.map((t) => t.project.id));
  const exceptions: Exception[] = [
    ...clarifications.map((p) => ({ severity: "high" as const, label: `${p.code}: client asked for clarification`, href: `/os/proposals/${p.id}` })),
    ...oldApprovals.map((a) => ({ severity: "high" as const, label: `${a.gate} gate waiting over 2 days (${a.project.name})`, href: `/os/approvals` })),
    ...blockedTasks.map((t) => ({ severity: "high" as const, label: `Blocked: ${t.title} (${t.project.name})`, href: `/os/projects/${t.project.id}` })),
    ...staleLeads.map((l) => ({ severity: "medium" as const, label: `${l.code} (${l.contactName}): no activity for ${STALE_LEAD_DAYS}+ days`, href: `/os/leads/${l.id}` })),
    ...staleProposals.map((p) => ({ severity: "medium" as const, label: `${p.code}: no answer for ${STALE_PROPOSAL_DAYS}+ days`, href: `/os/proposals/${p.id}` })),
    ...(opts.includeMoney
      ? (await prisma.invoice.findMany({ where: { status: "ISSUED", dueDate: { lt: now } }, select: { code: true, label: true } })).map((i) => ({
          severity: "high" as const,
          label: `${i.code} overdue: ${i.label}`,
          href: "/os/finance",
        }))
      : []),
  ];

  const cfo = opts.includeMoney ? await cfoSummary(now) : null;
  const decided = won90 + lost90;
  return {
    newLeads7d,
    openLeads,
    pipelineValue: proposalsOut.reduce((s, p) => s + p.priceTotal, 0),
    proposalsOut: proposalsOut.length,
    conversionRate: decided ? won90 / decided : null,
    activeProjects,
    projectsAtRisk: projectsWithBlocked.size,
    pendingApprovals,
    openChangeRequests: openCRs,
    aiCost30dUsd: ai._count ? (ai._sum.costUsd ?? 0) : null,
    aiCalls30d: ai._count,
    aiUnknownCost30d: aiUnknown,
    money: cfo
      ? {
          collected30d: cfo.collected30d,
          outstanding: cfo.outstanding,
          overdue: cfo.overdue,
          overdueCount: cfo.overdueCount,
          mrr: cfo.mrr,
          grossMarginActual: cfo.grossMarginActual,
        }
      : null,
    exceptions,
  };
}
