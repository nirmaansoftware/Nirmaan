import { prisma } from "../db/client";
import { loadAgent } from "../agents/loadAgent";
import { callModel } from "../ai/callModel";
import { extractJsonObject, text, textList } from "../ai/json";
import { audit } from "../audit";
import { logEvent } from "../db/logEvent";
import { assertCan } from "../auth/permissions";
import type { Actor } from "../auth/actor";
import type { ModelProvider } from "@/lib/ai/providers/types";
import { projectBrief } from "./brief";

/**
 * Solution Architect: approved requirements → a recommended architecture,
 * with build-vs-buy calls, component choices, tradeoffs, risks and security
 * notes. Guided by one principle: the simplest architecture that safely
 * solves the customer's actual problem.
 *
 * The output is a PROPOSED AgentRun. It shapes nothing until a person with
 * factory:review accepts it, and the ARCHITECTURE gate is still separate.
 */
export const VERDICTS = ["BUILD", "BUY", "REUSE", "SKIP"] as const;
export const COMPLEXITY = ["LOW", "MEDIUM", "HIGH"] as const;

export interface ArchitectureDoc {
  summary: string;
  recommendation: string;
  complexity: (typeof COMPLEXITY)[number];
  complexityJustification: string;
  buildVsBuy: { option: string; verdict: (typeof VERDICTS)[number]; why: string }[];
  components: { name: string; choice: string; why: string }[];
  tradeoffs: string[];
  risks: string[];
  security: string[];
  openQuestions: string[];
}

const CONTRACT = [
  "## Output contract for this run",
  "",
  "You are acting as the Solution Architect for one client project. Reply with ONLY a JSON object:",
  "",
  "{",
  '  "summary": "one or two sentences",',
  '  "recommendation": "the architecture you recommend, in plain language",',
  '  "complexity": "LOW" | "MEDIUM" | "HIGH",',
  '  "complexityJustification": "why this much complexity is necessary, and no more",',
  '  "buildVsBuy": [{ "option": "...", "verdict": "BUILD" | "BUY" | "REUSE" | "SKIP", "why": "..." }],',
  '  "components": [{ "name": "frontend | backend | database | auth | hosting | integrations | ai | observability | backups | ...", "choice": "...", "why": "..." }],',
  '  "tradeoffs": ["..."], "risks": ["..."], "security": ["..."], "openQuestions": ["..."]',
  "}",
  "",
  "Rules:",
  "- Use the simplest architecture that safely solves the actual problem. Prefer boring, proven technology. Do not add microservices, queues, Kubernetes or extra databases unless a requirement forces it; if you do, say which one.",
  "- Consider off-the-shelf tools honestly; BUY or SKIP is a valid verdict.",
  "- Cover authentication and authorization, data model, integrations, backups, observability and deployment in `components` when relevant.",
  "- Every requirement code you rely on must be one given to you.",
].join("\n");

export function parseArchitecture(raw: string): ArchitectureDoc {
  const o = extractJsonObject(raw, "The architect");
  const doc: ArchitectureDoc = {
    summary: text(o.summary, 600),
    recommendation: text(o.recommendation, 4000),
    complexity: COMPLEXITY.includes(o.complexity as never) ? (o.complexity as ArchitectureDoc["complexity"]) : "MEDIUM",
    complexityJustification: text(o.complexityJustification, 1000),
    buildVsBuy: (Array.isArray(o.buildVsBuy) ? o.buildVsBuy : [])
      .map((b: Record<string, unknown>) => ({
        option: text(b?.option, 200),
        verdict: (VERDICTS.includes(b?.verdict as never) ? b.verdict : "BUILD") as ArchitectureDoc["buildVsBuy"][number]["verdict"],
        why: text(b?.why, 600),
      }))
      .filter((b) => b.option)
      .slice(0, 10),
    components: (Array.isArray(o.components) ? o.components : [])
      .map((c: Record<string, unknown>) => ({ name: text(c?.name, 80), choice: text(c?.choice, 300), why: text(c?.why, 600) }))
      .filter((c) => c.name && c.choice)
      .slice(0, 20),
    tradeoffs: textList(o.tradeoffs, 12, 600),
    risks: textList(o.risks, 12, 600),
    security: textList(o.security, 12, 600),
    openQuestions: textList(o.openQuestions, 12, 600),
  };
  const missing = [
    !doc.summary && "summary",
    !doc.recommendation && "recommendation",
    !doc.components.length && "components",
    !doc.complexityJustification && "complexityJustification",
  ].filter(Boolean);
  if (missing.length) throw new Error(`The architect's reply was missing: ${missing.join(", ")}.`);
  return doc;
}

export async function runArchitecture(actor: Actor, projectId: string, opts: { provider?: ModelProvider } = {}) {
  assertCan(actor.role, "factory:run");
  const brief = await projectBrief(projectId);
  if (!brief.requirements.length) throw new Error("Attach approved requirements before asking for an architecture.");

  const agent = loadAgent("principal-architect");
  const { completion, usageId } = await callModel({
    task: "architecture",
    taskType: "architecture",
    agentSlug: "principal-architect",
    systemPrompt: [`You are the ${agent.role} agent at Nirmaan.`, "", agent.body, "", CONTRACT].join("\n"),
    userPrompt: brief.text,
    projectId,
    provider: opts.provider,
  });
  const doc = parseArchitecture(completion.text);

  const run = await prisma.agentRun.create({
    data: { projectId, kind: "ARCHITECTURE", agentSlug: "principal-architect", summary: doc.summary, output: JSON.stringify(doc), usageId },
  });
  await logEvent(projectId, "principal-architect", null, `Solution Architect proposed an architecture (${doc.complexity} complexity). Awaiting human review.`);
  await audit(actor, "factory.architecture_proposed", "AgentRun", run.id);
  return run;
}

/** Accept or reject a proposed run (architecture or plan) without side effects beyond its status. */
export async function reviewRun(actor: Actor, runId: string, decision: "ACCEPTED" | "REJECTED", note?: string) {
  assertCan(actor.role, "factory:review");
  const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== "PROPOSED") throw new Error(`This ${run.kind.toLowerCase()} was already ${run.status.toLowerCase()}.`);
  if (run.kind === "PLAN" && decision === "ACCEPTED") throw new Error("Accept a plan with acceptPlan(), which also creates its features and tasks.");
  if (decision === "REJECTED" && !note?.trim()) throw new Error("Say why it's rejected, so the next run can do better.");
  const { count } = await prisma.agentRun.updateMany({
    where: { id: runId, status: "PROPOSED" },
    data: { status: decision, reviewedBy: actor.label, reviewedAt: new Date(), reviewNote: note?.trim() || null },
  });
  if (count !== 1) throw new Error("Someone else just reviewed this.");
  await logEvent(run.projectId, null, null, `${actor.label} ${decision.toLowerCase()} the ${run.kind.toLowerCase()} proposal.${note ? ` Note: ${note}` : ""}`);
  await audit(actor, `factory.${run.kind.toLowerCase()}_${decision.toLowerCase()}`, "AgentRun", runId, note);
  return prisma.agentRun.findUniqueOrThrow({ where: { id: runId } });
}

export function architectureOf(run: { output: string }): ArchitectureDoc {
  return JSON.parse(run.output) as ArchitectureDoc;
}

