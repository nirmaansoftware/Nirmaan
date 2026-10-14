import { prisma } from "../db/client";
import { audit } from "../audit";
import { assertCan } from "../auth/permissions";
import type { Actor } from "../auth/actor";
import { COST_CATEGORIES, isOneOf } from "../db/enums";
import { getSettings } from "./settings";

/**
 * Actual cost of delivering a project. Human effort can be entered as hours
 * (priced at the company's loaded hourly cost) or as an amount; AI spend is
 * NOT entered here, it's read live from the AiUsage ledger in
 * projectEconomics(), so it can't drift or be counted twice.
 */
export async function addCostEntry(
  actor: Actor,
  projectId: string,
  input: { category: string; amount?: number; hours?: number; note: string; incurredOn?: Date }
) {
  assertCan(actor.role, "finance:write");
  if (!isOneOf(COST_CATEGORIES, input.category)) throw new Error("Choose a cost category.");
  const note = input.note.trim();
  if (!note) throw new Error("Say what the cost was for.");
  const hours = input.hours ?? null;
  if (hours !== null && !(hours > 0 && hours <= 1000)) throw new Error("Hours must be between 0 and 1,000.");
  let amount = input.amount ?? 0;
  if (!Number.isInteger(amount) || amount < 0) throw new Error("Amount must be a whole number of rupees.");
  if (input.category === "HUMAN" && hours && !amount) {
    const { hourlyCost } = await getSettings();
    if (!hourlyCost) throw new Error("Set the loaded hourly cost in finance settings, or enter an amount.");
    amount = Math.round(hours * hourlyCost);
  }
  if (!amount) throw new Error("Enter an amount (or hours, for human effort).");
  const incurredOn = input.incurredOn ?? new Date();
  const entry = await prisma.costEntry.create({ data: { projectId, category: input.category, amount, hours, note, incurredOn, recordedBy: actor.label } });
  await audit(actor, "cost.recorded", "CostEntry", entry.id, `${input.category} ₹${amount}`);
  return entry;
}

export interface ProjectEconomics {
  contract: number; // proposal price + approved change requests
  invoiced: number; // issued + paid invoice subtotals (excl. tax)
  collected: number; // cash received (incl. tax)
  outstanding: number; // issued, unpaid totals
  estimated: { cost: number; hours: number; margin: number | null };
  actual: { cost: number; hours: number; margin: number | null; byCategory: Record<string, number>; aiUsd: number };
  variance: { cost: number; hours: number };
}

export async function projectEconomics(projectId: string): Promise<ProjectEconomics> {
  const [project, invoices, costs, ai, settings, approvedCrs] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { proposal: true } }),
    prisma.invoice.findMany({ where: { projectId, status: { in: ["ISSUED", "PAID"] } }, include: { payments: true } }),
    prisma.costEntry.findMany({ where: { projectId } }),
    prisma.aiUsage.aggregate({ where: { projectId }, _sum: { costUsd: true } }),
    getSettings(),
    prisma.changeRequest.findMany({ where: { projectId, status: "APPROVED" }, select: { costDelta: true } }),
  ]);
  const p = project.proposal;
  const contract = (p?.priceTotal ?? 0) + approvedCrs.reduce((s, c) => s + c.costDelta, 0);
  const estCost = p ? p.estCostHuman + p.estCostAi + p.estCostInfra + p.estCostOther : 0;
  const aiUsd = ai._sum.costUsd ?? 0;
  const byCategory: Record<string, number> = { HUMAN: 0, INFRA: 0, EXTERNAL_AI: 0, OTHER: 0, AI_LEDGER: Math.round(aiUsd * settings.usdToInr) };
  for (const c of costs) byCategory[c.category] = (byCategory[c.category] ?? 0) + c.amount;
  const actualCost = Object.values(byCategory).reduce((s, v) => s + v, 0);
  const actualHours = costs.filter((c) => c.category === "HUMAN").reduce((s, c) => s + (c.hours ?? 0), 0);
  const collected = invoices.flatMap((i) => i.payments).reduce((s, pay) => s + pay.amount, 0);
  // A margin is only shown when there's a cost figure behind it. With no
  // estimate (or no costs recorded yet) it's unknown, not 100%.
  const margin = (cost: number) => (contract > 0 && cost > 0 ? (contract - cost) / contract : null);

  return {
    contract,
    invoiced: invoices.reduce((s, i) => s + i.subtotal, 0),
    collected,
    outstanding: invoices.filter((i) => i.status === "ISSUED").reduce((s, i) => s + i.total - i.payments.reduce((a, pay) => a + pay.amount, 0), 0),
    estimated: { cost: estCost, hours: p?.estHours ?? 0, margin: margin(estCost) },
    actual: { cost: actualCost, hours: actualHours, margin: margin(actualCost), byCategory, aiUsd },
    variance: { cost: actualCost - estCost, hours: actualHours - (p?.estHours ?? 0) },
  };
}
