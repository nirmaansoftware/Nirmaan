import { prisma } from "../db/client";
import { isOverdue } from "./invoices";
import { projectEconomics, type ProjectEconomics } from "./costs";

const DAY = 24 * 60 * 60 * 1000;

export interface ServiceTypeRow {
  serviceType: string;
  projects: number;
  contract: number;
  estimatedCost: number;
  actualCost: number;
  estimatedMargin: number | null;
  actualMargin: number | null;
}

/** The CFO view: cash, receivables, recurring revenue, and estimate-vs-actual by project and by kind of work. */
export async function cfoSummary(now = new Date()) {
  const since30 = new Date(now.getTime() - 30 * DAY);
  const [payments, payments30, openInvoices, subs, projects] = await Promise.all([
    prisma.payment.aggregate({ _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { receivedAt: { gte: since30 } }, _sum: { amount: true } }),
    prisma.invoice.findMany({ where: { status: "ISSUED" }, include: { payments: true } }),
    prisma.subscription.findMany({ where: { status: "ACTIVE" } }),
    prisma.project.findMany({ where: { proposalId: { not: null } }, select: { id: true, code: true, name: true, stage: true, serviceType: true } }),
  ]);
  const due = (i: (typeof openInvoices)[number]) => i.total - i.payments.reduce((s, p) => s + p.amount, 0);
  const rows: { project: (typeof projects)[number]; e: ProjectEconomics }[] = [];
  for (const project of projects) rows.push({ project, e: await projectEconomics(project.id) });

  const byType = new Map<string, ServiceTypeRow>();
  for (const { project, e } of rows) {
    const key = project.serviceType ?? "UNSET";
    const r = byType.get(key) ?? { serviceType: key, projects: 0, contract: 0, estimatedCost: 0, actualCost: 0, estimatedMargin: null, actualMargin: null };
    r.projects++;
    r.contract += e.contract;
    r.estimatedCost += e.estimated.cost;
    r.actualCost += e.actual.cost;
    byType.set(key, r);
  }
  for (const r of byType.values()) {
    r.estimatedMargin = r.contract && r.estimatedCost ? (r.contract - r.estimatedCost) / r.contract : null;
    r.actualMargin = r.contract && r.actualCost ? (r.contract - r.actualCost) / r.contract : null;
  }
  const withCosts = rows.filter((r) => r.e.actual.cost > 0 && r.e.contract > 0);
  const portfolioContract = withCosts.reduce((s, r) => s + r.e.contract, 0);
  const portfolioCost = withCosts.reduce((s, r) => s + r.e.actual.cost, 0);

  return {
    collectedAllTime: payments._sum.amount ?? 0,
    collected30d: payments30._sum.amount ?? 0,
    outstanding: openInvoices.reduce((s, i) => s + due(i), 0),
    overdue: openInvoices.filter((i) => isOverdue(i, now)).reduce((s, i) => s + due(i), 0),
    overdueCount: openInvoices.filter((i) => isOverdue(i, now)).length,
    mrr: subs.reduce((s, x) => s + x.monthly, 0),
    activePlans: subs.length,
    grossMarginActual: portfolioContract ? (portfolioContract - portfolioCost) / portfolioContract : null,
    projects: rows,
    byServiceType: [...byType.values()].sort((a, b) => b.contract - a.contract),
  };
}

/** Lifetime value per client: cash collected across all their invoices. */
export async function clientLifetimeValue() {
  const rows = await prisma.payment.findMany({ include: { invoice: { select: { clientId: true, client: { select: { name: true } } } } } });
  const map = new Map<string, { name: string; collected: number }>();
  for (const r of rows) {
    const id = r.invoice.clientId ?? "none";
    const cur = map.get(id) ?? { name: r.invoice.client?.name ?? "No client", collected: 0 };
    cur.collected += r.amount;
    map.set(id, cur);
  }
  return [...map.values()].sort((a, b) => b.collected - a.collected);
}
