import { prisma } from "../db/client";
import { audit } from "../audit";
import { assertCan } from "../auth/permissions";
import type { Actor } from "../auth/actor";
import { encodeStringList } from "../db/json";
import { projectEconomics } from "../finance/costs";
import { PROVEN_AFTER_PROJECTS } from "../db/enums";

/**
 * Productization signals: the four criteria in docs/strategy/productization.md,
 * computed from won projects grouped by kind of work. The screen only reports
 * evidence; deciding to build a product is a recorded human decision.
 *
 * A criterion is PASS, FAIL or UNKNOWN. UNKNOWN means the data isn't recorded
 * yet (no costs, no asset uses) and is never counted as a pass.
 */
export const MIN_PROJECTS = PROVEN_AFTER_PROJECTS;
export const MIN_SHARED_ASSETS = 2;
export const MIN_RECURRING_ATTACH = 0.5;
export const MIN_COST_OVERRUN = 0.1;

export type Check = "PASS" | "FAIL" | "UNKNOWN";
export type Verdict = "CANDIDATE" | "WATCH" | "NOT_YET";

export interface GroupProject {
  id: string;
  clientId: string | null;
  contract: number;
  estimatedCost: number;
  actualCost: number;
  assetIds: string[];
}

export interface GroupSignals {
  serviceType: string;
  projects: number;
  clients: number;
  contract: number;
  demand: { check: Check; detail: string };
  shared: { check: Check; detail: string; assetIds: string[] };
  recurring: { check: Check; detail: string; attach: number | null };
  underpriced: { check: Check; detail: string; medianOverrun: number | null };
  verdict: Verdict;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Pure evaluation of one group; the loader below feeds it from the database. */
export function evaluateGroup(serviceType: string, projects: GroupProject[], clientsWithPlan: Set<string>): GroupSignals {
  const n = projects.length;
  const clients = [...new Set(projects.map((p) => p.clientId).filter((c): c is string => !!c))];

  const demand: GroupSignals["demand"] = {
    check: n >= MIN_PROJECTS ? "PASS" : "FAIL",
    detail: `${n} won project${n === 1 ? "" : "s"} (needs ${MIN_PROJECTS})`,
  };

  // An asset counts as shared when at least half of the group (and at least two projects) use it.
  const uses = new Map<string, number>();
  for (const p of projects) for (const a of new Set(p.assetIds)) uses.set(a, (uses.get(a) ?? 0) + 1);
  const sharedIds = [...uses].filter(([, c]) => c >= 2 && c >= n / 2).map(([a]) => a);
  const shared: GroupSignals["shared"] = {
    check: uses.size === 0 ? "UNKNOWN" : sharedIds.length >= MIN_SHARED_ASSETS ? "PASS" : "FAIL",
    detail:
      uses.size === 0
        ? "No library assets recorded on these projects"
        : `${sharedIds.length} asset${sharedIds.length === 1 ? "" : "s"} used across most of them (needs ${MIN_SHARED_ASSETS})`,
    assetIds: sharedIds,
  };

  const attach = clients.length ? clients.filter((c) => clientsWithPlan.has(c)).length / clients.length : null;
  const recurring: GroupSignals["recurring"] = {
    check: attach === null ? "UNKNOWN" : attach >= MIN_RECURRING_ATTACH ? "PASS" : "FAIL",
    detail: attach === null ? "No clients linked" : `${pct(attach)} of clients took a care plan (needs ${pct(MIN_RECURRING_ATTACH)})`,
    attach,
  };

  // Underpriced or rebuilt: actual cost repeatedly above the estimate.
  const overruns = projects.filter((p) => p.estimatedCost > 0 && p.actualCost > 0).map((p) => (p.actualCost - p.estimatedCost) / p.estimatedCost);
  const medianOverrun = overruns.length ? median(overruns) : null;
  const underpriced: GroupSignals["underpriced"] = {
    check: overruns.length < 2 ? "UNKNOWN" : medianOverrun! >= MIN_COST_OVERRUN ? "PASS" : "FAIL",
    detail:
      overruns.length < 2
        ? `Costs recorded on ${overruns.length} project${overruns.length === 1 ? "" : "s"} (needs 2)`
        : `Median cost ${medianOverrun! >= 0 ? "over" : "under"} estimate by ${pct(Math.abs(medianOverrun!))} (signal at ${pct(MIN_COST_OVERRUN)} over)`,
    medianOverrun,
  };

  const others = [shared, recurring, underpriced].filter((c) => c.check === "PASS").length;
  const verdict: Verdict = demand.check !== "PASS" ? "NOT_YET" : others === 3 ? "CANDIDATE" : others >= 1 ? "WATCH" : "NOT_YET";

  return {
    serviceType,
    projects: n,
    clients: clients.length,
    contract: projects.reduce((s, p) => s + p.contract, 0),
    demand,
    shared,
    recurring,
    underpriced,
    verdict,
  };
}

const RANK: Record<Verdict, number> = { CANDIDATE: 0, WATCH: 1, NOT_YET: 2 };

/**
 * Signals for every kind of work with at least one won project (a project
 * created from an approved proposal). `projectIds` narrows the set, for tests.
 */
export async function productizationSignals(actor: Actor, opts: { projectIds?: string[] } = {}) {
  assertCan(actor.role, "finance:read");
  const projects = await prisma.project.findMany({
    where: opts.projectIds ? { id: { in: opts.projectIds } } : { proposalId: { not: null } },
    select: { id: true, clientId: true, serviceType: true, assetUses: { select: { assetId: true } } },
  });
  const plans = await prisma.subscription.findMany({ select: { clientId: true } });
  const clientsWithPlan = new Set(plans.map((s) => s.clientId));

  const groups = new Map<string, GroupProject[]>();
  for (const p of projects) {
    const e = await projectEconomics(p.id);
    const key = p.serviceType ?? "UNSET";
    const list = groups.get(key) ?? [];
    list.push({ id: p.id, clientId: p.clientId, contract: e.contract, estimatedCost: e.estimated.cost, actualCost: e.actual.cost, assetIds: p.assetUses.map((u) => u.assetId) });
    groups.set(key, list);
  }

  const assetNames = new Map((await prisma.asset.findMany({ select: { id: true, code: true, name: true } })).map((a) => [a.id, `${a.code} ${a.name}`]));
  return [...groups]
    .map(([type, list]) => ({ ...evaluateGroup(type, list, clientsWithPlan), sharedAssets: [] as string[] }))
    .map((g) => ({ ...g, sharedAssets: g.shared.assetIds.map((id) => assetNames.get(id) ?? id) }))
    .sort((a, b) => RANK[a.verdict] - RANK[b.verdict] || b.projects - a.projects);
}

export const DECISIONS = ["PURSUE", "NOT_NOW"] as const;
export type Decision = (typeof DECISIONS)[number];

/**
 * Records a productization decision as a knowledge article with the signal
 * snapshot, so the reasoning survives and the next review starts from it.
 */
export async function recordDecision(actor: Actor, serviceType: string, decision: Decision, note: string, opts: { projectIds?: string[] } = {}) {
  assertCan(actor.role, "finance:read");
  assertCan(actor.role, "knowledge:write");
  if (!DECISIONS.includes(decision)) throw new Error("Choose pursue or not now.");
  const why = note.trim();
  if (why.length < 10) throw new Error("Write down why, in a sentence or two.");
  const g = (await productizationSignals(actor, opts)).find((s) => s.serviceType === serviceType);
  if (!g) throw new Error("No won projects of that kind yet.");

  const label = serviceType.replace("_", " ").toLowerCase();
  const line = (name: string, c: { check: Check; detail: string }) => `- ${name}: ${c.check.toLowerCase()} (${c.detail})`;
  const content = [
    `Decision: ${decision === "PURSUE" ? "pursue a configurable starter" : "not now"}, by ${actor.label} on ${new Date().toISOString().slice(0, 10)}.`,
    "",
    why,
    "",
    `Signals at the time (${g.projects} projects, ${g.clients} clients, verdict ${g.verdict.toLowerCase().replace("_", " ")}):`,
    line("Repeat demand", g.demand),
    line("Shared components", g.shared),
    line("Recurring willingness", g.recurring),
    line("Underpriced or rebuilt", g.underpriced),
    ...(g.sharedAssets.length ? ["", `Shared assets: ${g.sharedAssets.join(", ")}.`] : []),
    ...(decision === "PURSUE" ? ["", "Next: extract the shared parts into the IP library, then use them as the starter on the next similar client."] : []),
  ].join("\n");

  const a = await prisma.knowledge.create({
    data: {
      scope: "GLOBAL",
      source: "MANUAL",
      author: actor.label,
      title: `Productization: ${label} (${decision === "PURSUE" ? "pursue" : "not now"})`,
      content,
      tags: encodeStringList(["productization", label, decision === "PURSUE" ? "pursue" : "not-now"]),
    },
  });
  await audit(actor, "productization.decided", "Knowledge", a.id, `${serviceType}: ${decision}`);
  return a;
}
