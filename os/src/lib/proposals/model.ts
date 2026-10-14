import type { Proposal } from "@prisma/client";
import { decodeStringList } from "../db/json";

/**
 * Pure shapes and rules for proposals: parsing the JSON columns, validating
 * edits, and computing internal economics. No database access, so all of it
 * is unit-tested directly.
 */
export interface Milestone {
  name: string;
  weeks: number;
}
export interface PaymentStep {
  label: string;
  percent: number;
}
export interface MaintenancePlan {
  name: string;
  monthly: number;
  includes: string[];
}

export const DEFAULT_PAYMENT_SCHEDULE: PaymentStep[] = [
  { label: "On approval", percent: 40 },
  { label: "At staging review", percent: 40 },
  { label: "On final delivery", percent: 20 },
];

export const DEFAULT_CHANGE_POLICY =
  "Anything not listed under Scope is out of scope. New requests during the project are logged as change requests, each with its own cost and timeline impact, and are only started once you approve them in writing.";

export interface ProposalView {
  scope: string[];
  outOfScope: string[];
  deliverables: string[];
  assumptions: string[];
  milestones: Milestone[];
  paymentSchedule: PaymentStep[];
  maintenance: MaintenancePlan | null;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function viewOf(p: Pick<Proposal, "scope" | "outOfScope" | "deliverables" | "assumptions" | "milestones" | "paymentSchedule" | "maintenance">): ProposalView {
  return {
    scope: decodeStringList(p.scope),
    outOfScope: decodeStringList(p.outOfScope),
    deliverables: decodeStringList(p.deliverables),
    assumptions: decodeStringList(p.assumptions),
    milestones: parseJson<Milestone[]>(p.milestones, []),
    paymentSchedule: parseJson<PaymentStep[]>(p.paymentSchedule, []),
    maintenance: parseJson<MaintenancePlan | null>(p.maintenance, null),
  };
}

/** One item per line, blank lines dropped. The editing format for list fields. */
export function linesToList(text: string, max = 40): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, max);
}

/** "Discovery & design | 2" per line. */
export function parseMilestones(text: string): Milestone[] {
  return linesToList(text, 20).map((line) => {
    const [name, weeks] = line.split("|").map((s) => s.trim());
    const n = Number(weeks);
    if (!name || !Number.isFinite(n) || n <= 0 || n > 104) {
      throw new Error(`Milestone "${line}" needs a name and a number of weeks, like "Build | 3".`);
    }
    return { name, weeks: n };
  });
}

/** "On approval | 40" per line; must total exactly 100. */
export function parsePaymentSchedule(text: string): PaymentStep[] {
  const steps = linesToList(text, 10).map((line) => {
    const [label, percent] = line.split("|").map((s) => s.trim());
    const n = Number(percent);
    if (!label || !Number.isInteger(n) || n <= 0 || n > 100) {
      throw new Error(`Payment step "${line}" needs a label and a whole percentage, like "On approval | 40".`);
    }
    return { label, percent: n };
  });
  assertScheduleValid(steps);
  return steps;
}

export function assertScheduleValid(steps: PaymentStep[]) {
  if (!steps.length) throw new Error("Add at least one payment step.");
  const total = steps.reduce((sum, s) => sum + s.percent, 0);
  if (total !== 100) throw new Error(`Payment steps add up to ${total}%. They must total 100%.`);
}

/** Split a total into scheduled amounts; rounding remainder goes on the last step so the sum is exact. */
export function scheduleAmounts(total: number, steps: PaymentStep[]): { label: string; percent: number; amount: number }[] {
  let allocated = 0;
  return steps.map((s, i) => {
    const amount = i === steps.length - 1 ? total - allocated : Math.round((total * s.percent) / 100);
    allocated += amount;
    return { ...s, amount };
  });
}

export function totalWeeks(milestones: Milestone[]): number {
  return milestones.reduce((sum, m) => sum + m.weeks, 0);
}

export interface Economics {
  revenue: number;
  estimatedCost: number;
  grossProfit: number;
  /** Gross margin as a fraction (0.42 = 42%); null when there's no revenue yet. */
  grossMargin: number | null;
}

export function economicsOf(p: Pick<Proposal, "priceTotal" | "estCostHuman" | "estCostAi" | "estCostInfra" | "estCostOther">): Economics {
  const estimatedCost = p.estCostHuman + p.estCostAi + p.estCostInfra + p.estCostOther;
  const grossProfit = p.priceTotal - estimatedCost;
  return {
    revenue: p.priceTotal,
    estimatedCost,
    grossProfit,
    grossMargin: p.priceTotal > 0 ? grossProfit / p.priceTotal : null,
  };
}

/** Everything that must be true before a proposal can go to a client. */
export function sendBlockers(p: Proposal): string[] {
  const v = viewOf(p);
  const problems: string[] = [];
  if (p.problem.trim().length < 20) problems.push("Describe the customer's problem.");
  if (p.solution.trim().length < 20) problems.push("Describe the proposed solution.");
  if (!v.scope.length) problems.push("List what's in scope.");
  if (!v.outOfScope.length) problems.push("List what's out of scope. Saying it up front prevents disputes later.");
  if (!v.deliverables.length) problems.push("List the deliverables.");
  if (!v.milestones.length) problems.push("Add at least one milestone.");
  if (p.priceTotal <= 0) problems.push("Set a price.");
  try {
    assertScheduleValid(v.paymentSchedule);
  } catch (err) {
    problems.push((err as Error).message);
  }
  if (!p.changePolicy.trim()) problems.push("Include the change-request policy.");
  if (p.validUntil && p.validUntil < new Date()) problems.push("The validity date is in the past.");
  return problems;
}

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export function formatInr(amount: number): string {
  return INR.format(amount);
}
