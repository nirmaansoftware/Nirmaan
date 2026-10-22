import { prisma } from "../db/client";
import { loadAgent } from "../agents/loadAgent";
import { composeSystemPrompt } from "../agents/composePrompt";
import { callModel } from "../ai/callModel";
import { extractJsonObject, text } from "../ai/json";
import { nextCode } from "../ids";
import { audit } from "../audit";
import { logEvent } from "../db/logEvent";
import { assertCan } from "../auth/permissions";
import type { Actor } from "../auth/actor";
import type { ModelProvider } from "@/lib/ai/providers/types";
import { plannableAgents } from "../agents/orgChart";
import { projectBrief } from "./brief";

/**
 * Planner: requirements (+ accepted architecture) → features → tasks, each
 * task owned by a specialist agent. This fills the gap the original
 * orchestrator left open ("nothing decides a task's owner").
 *
 * The plan is PROPOSED until a person accepts it; acceptance creates the
 * FEAT-/TASK- rows and the REQ→FEAT→TASK links in one transaction.
 */
export const MAX_FEATURES = 25;
export const MAX_TASKS_PER_FEATURE = 8;

/**
 * Agents a plan may assign work to come from agents/org-chart.yml: active ic
 * or staff positions without `plannable: false`. Managers never own tasks.
 */
export { plannableAgents };

export interface PlanTask {
  title: string;
  agent: string;
  description: string;
}
export interface PlanFeature {
  title: string;
  description: string;
  satisfies: string[];
  tasks: PlanTask[];
}
export interface Plan {
  features: PlanFeature[];
  /** MUST requirements no feature satisfies. The reviewer should see these. */
  uncovered: string[];
}

const CONTRACT = (agents: string[]) =>
  [
    "## Output contract for this run",
    "",
    "You are planning delivery for one client project. Reply with ONLY a JSON object:",
    "",
    '{ "features": [ { "title": "...", "description": "...", "satisfies": ["REQ-..."], "tasks": [ { "title": "...", "agent": "<agent slug>", "description": "..." } ] } ] }',
    "",
    `- Only use these agent slugs: ${agents.join(", ")}.`,
    "- Every MUST requirement should be satisfied by at least one feature. Only cite requirement codes you were given.",
    "- Include design, implementation, database, QA and security tasks where they apply. Keep tasks small enough for one focused run.",
    `- At most ${MAX_FEATURES} features and ${MAX_TASKS_PER_FEATURE} tasks per feature. Nothing for out-of-scope items.`,
  ].join("\n");

export function parsePlan(raw: string, validReqCodes: string[], mustCodes: string[]): Plan {
  const o = extractJsonObject(raw, "The planner");
  if (!Array.isArray(o.features) || !o.features.length) throw new Error('The planner\'s reply had no "features".');
  const valid = new Set(validReqCodes);
  const unknownCodes = new Set<string>();
  const unknownAgents = new Set<string>();
  const plannable = plannableAgents();

  const features: PlanFeature[] = o.features.slice(0, MAX_FEATURES).map((f: Record<string, unknown>) => {
    const satisfies = (Array.isArray(f?.satisfies) ? f.satisfies : [])
      .map((c: unknown) => text(c, 20).toUpperCase())
      .filter((c: string) => {
        if (!c) return false;
        if (!valid.has(c)) unknownCodes.add(c);
        return valid.has(c);
      });
    const tasks = (Array.isArray(f?.tasks) ? f.tasks : [])
      .slice(0, MAX_TASKS_PER_FEATURE)
      .map((t: Record<string, unknown>) => ({ title: text(t?.title, 160), agent: text(t?.agent, 60), description: text(t?.description, 2000) }))
      .filter((t: PlanTask) => {
        if (!t.title) return false;
        if (!plannable.includes(t.agent)) {
          unknownAgents.add(t.agent || "(none)");
          return false;
        }
        return true;
      });
    return { title: text(f?.title, 160), description: text(f?.description, 2000), satisfies: [...new Set<string>(satisfies)], tasks };
  });

  if (unknownCodes.size) throw new Error(`The plan cites requirements that aren't on this project: ${[...unknownCodes].join(", ")}.`);
  if (unknownAgents.size) throw new Error(`The plan assigns work to unknown agents: ${[...unknownAgents].join(", ")}.`);
  const usable = features.filter((f) => f.title && f.tasks.length);
  if (!usable.length) throw new Error("The plan had no features with tasks.");
  const covered = new Set(usable.flatMap((f) => f.satisfies));
  return { features: usable, uncovered: mustCodes.filter((c) => !covered.has(c)) };
}

export async function runPlanner(actor: Actor, projectId: string, opts: { provider?: ModelProvider } = {}) {
  assertCan(actor.role, "factory:run");
  const brief = await projectBrief(projectId);
  if (!brief.requirements.length) throw new Error("Attach approved requirements before planning.");

  const agent = loadAgent("product-manager");
  const { completion, usageId } = await callModel({
    task: "planning",
    taskType: "requirements",
    agentSlug: "product-manager",
    systemPrompt: composeSystemPrompt({ agent, intro: `You are the ${agent.role} agent at Nirmaan, acting as delivery planner.`, contract: CONTRACT(plannableAgents()) }),
    userPrompt: brief.text,
    projectId,
    provider: opts.provider,
  });
  const plan = parsePlan(
    completion.text,
    brief.requirements.map((r) => r.code),
    brief.requirements.filter((r) => r.priority === "MUST").map((r) => r.code)
  );
  const taskCount = plan.features.reduce((n, f) => n + f.tasks.length, 0);
  const run = await prisma.agentRun.create({
    data: {
      projectId,
      kind: "PLAN",
      agentSlug: "product-manager",
      summary: `${plan.features.length} features, ${taskCount} tasks${plan.uncovered.length ? `; ${plan.uncovered.length} MUST requirement(s) uncovered` : ""}`,
      output: JSON.stringify(plan),
      usageId,
    },
  });
  await logEvent(projectId, "product-manager", null, `Planner proposed ${plan.features.length} features and ${taskCount} tasks. Awaiting human review.`);
  await audit(actor, "factory.plan_proposed", "AgentRun", run.id);
  return run;
}

/**
 * Accepting a plan turns it into real project structure: FEAT-### rows
 * linked to the requirements they satisfy, TASK-### rows owned by agents and
 * linked to their feature. All-or-nothing, and only once.
 */
export async function acceptPlan(actor: Actor, runId: string) {
  assertCan(actor.role, "factory:review");
  const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.kind !== "PLAN") throw new Error("That run isn't a plan.");
  const plan = JSON.parse(run.output) as Plan;

  const created = await prisma.$transaction(async (tx) => {
    const { count } = await tx.agentRun.updateMany({
      where: { id: runId, status: "PROPOSED" },
      data: { status: "ACCEPTED", reviewedBy: actor.label, reviewedAt: new Date() },
    });
    if (count !== 1) throw new Error("This plan was already reviewed.");
    let features = 0;
    let tasks = 0;
    for (const f of plan.features) {
      const featCode = await nextCode("FEAT", tx);
      await tx.feature.create({ data: { code: featCode, projectId: run.projectId, title: f.title, description: f.description || null } });
      features++;
      for (const req of f.satisfies) {
        await tx.traceLink.create({ data: { projectId: run.projectId, fromCode: req, toCode: featCode, relation: "SATISFIED_BY" } });
      }
      for (const t of f.tasks) {
        const taskCode = await nextCode("TASK", tx);
        await tx.task.create({
          data: { code: taskCode, projectId: run.projectId, title: t.title, description: t.description || null, ownerAgent: t.agent, status: "READY" },
        });
        await tx.traceLink.create({ data: { projectId: run.projectId, fromCode: featCode, toCode: taskCode, relation: "IMPLEMENTED_BY" } });
        tasks++;
      }
    }
    return { features, tasks };
  });
  await logEvent(run.projectId, null, null, `${actor.label} accepted the plan: created ${created.features} features and ${created.tasks} tasks.`);
  await audit(actor, "factory.plan_accepted", "AgentRun", runId, `${created.features} features, ${created.tasks} tasks`);
  return created;
}
