import { prisma } from "../db/client";
import { audit } from "../audit";
import { logEvent } from "../db/logEvent";
import { assertCan } from "../auth/permissions";
import type { Actor } from "../auth/actor";
import { encodeStringList } from "../db/json";
import { projectEconomics } from "../finance/costs";

/**
 * Lightweight post-mortem, required before the HANDOVER gate can be
 * approved. It snapshots estimate vs actual economics at the time it's
 * written, and its lessons become a knowledge-base article so the next
 * project (and the next estimate) benefits.
 */
export const POSTMORTEM_QUESTIONS = [
  ["wentWell", "What went well?"],
  ["wentWrong", "What went wrong?"],
  ["rework", "What caused rework?"],
  ["underestimated", "What was underestimated?"],
  ["reusable", "What should become reusable?"],
  ["automate", "What should become automated?"],
  ["pricing", "What should change in pricing?"],
  ["process", "What should change in the delivery process?"],
] as const;
export type PostMortemInput = Record<(typeof POSTMORTEM_QUESTIONS)[number][0], string>;

export async function savePostMortem(actor: Actor, projectId: string, input: PostMortemInput) {
  assertCan(actor.role, "project:write");
  const answers = Object.fromEntries(POSTMORTEM_QUESTIONS.map(([k]) => [k, (input[k] ?? "").trim().slice(0, 4000)])) as PostMortemInput;
  const empty = POSTMORTEM_QUESTIONS.filter(([k]) => !answers[k]).map(([, q]) => q);
  if (empty.length > 2) throw new Error(`Answer at least six of the eight questions ("none" is a valid answer). Missing: ${empty.join(" ")}`);

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const e = await projectEconomics(projectId);
  const economics = JSON.stringify({
    contract: e.contract,
    estimatedCost: e.estimated.cost,
    actualCost: e.actual.cost,
    estimatedHours: e.estimated.hours,
    actualHours: e.actual.hours,
    estimatedMargin: e.estimated.margin,
    actualMargin: e.actual.margin,
  });

  const pm = await prisma.postMortem.upsert({
    where: { projectId },
    create: { projectId, ...answers, economics, createdBy: actor.label },
    update: { ...answers, economics },
  });

  // Lessons → knowledge base (one article per project, kept in sync).
  const title = `Lessons from ${project.code ?? project.name}: ${project.name}`;
  const content = [
    `Service type: ${project.serviceType?.toLowerCase() ?? "not set"}`,
    e.estimated.margin !== null || e.actual.margin !== null
      ? `Estimate vs actual: cost ₹${e.estimated.cost.toLocaleString("en-IN")} → ₹${e.actual.cost.toLocaleString("en-IN")}, hours ${e.estimated.hours} → ${e.actual.hours}`
      : "Estimate vs actual: not enough cost data recorded.",
    "",
    ...POSTMORTEM_QUESTIONS.filter(([k]) => answers[k]).map(([k, q]) => `## ${q}\n${answers[k]}`),
  ].join("\n");
  const tags = encodeStringList(["post-mortem", ...(project.serviceType ? [project.serviceType.toLowerCase()] : [])]);
  const existing = await prisma.knowledge.findFirst({ where: { projectId, source: "POST_MORTEM" } });
  if (existing) await prisma.knowledge.update({ where: { id: existing.id }, data: { title, content, tags } });
  else await prisma.knowledge.create({ data: { scope: "GLOBAL", projectId, source: "POST_MORTEM", author: actor.label, title, content, tags } });

  await logEvent(projectId, null, null, `${actor.label} recorded the post-mortem.`);
  await audit(actor, "project.postmortem_saved", "Project", projectId);
  return pm;
}
