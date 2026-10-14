import type { DiscoveryItem, Lead } from "@prisma/client";
import { prisma } from "../db/client";
import { nextCode } from "../ids";
import { audit } from "../audit";
import { assertCan } from "../auth/permissions";
import type { Actor } from "../auth/actor";
import { encodeStringList } from "../db/json";
import {
  DISCOVERY_KINDS,
  isOneOf,
  REQUIREMENT_KINDS,
  REQUIREMENT_PRIORITIES,
  type DiscoveryStatus,
} from "../db/enums";

/**
 * Facts the customer gave us directly through the intake form. These need
 * no AI and no interpretation: each answered field becomes one FACT, worded
 * with the customer's own answer. Idempotent: re-running adds nothing new.
 */
const FACT_FIELDS: [keyof Lead, string][] = [
  ["business", "Business"],
  ["currentSolution", "How it's handled today"],
  ["affected", "Who is affected"],
  ["frequency", "How often it happens"],
  ["scale", "Scale"],
  ["existingSystems", "Existing systems"],
  ["desiredOutcome", "Desired outcome"],
  ["budgetRange", "Budget range"],
  ["timeline", "Timeline"],
  ["urgency", "Urgency"],
];

export function factsFromIntake(lead: Lead): string[] {
  const facts = [`Problem, in the customer's words: "${lead.problem}"`];
  for (const [field, label] of FACT_FIELDS) {
    const value = lead[field];
    if (typeof value === "string" && value.trim()) facts.push(`${label}: ${value.trim()}`);
  }
  return facts;
}

export async function seedIntakeFacts(leadId: string) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  const existing = new Set(
    (await prisma.discoveryItem.findMany({ where: { leadId, source: "CLIENT" }, select: { text: true } })).map((i) => i.text)
  );
  const fresh = factsFromIntake(lead).filter((text) => !existing.has(text));
  if (fresh.length) {
    await prisma.discoveryItem.createMany({
      data: fresh.map((text) => ({ leadId, kind: "FACT", source: "CLIENT", status: "CONFIRMED", text })),
    });
  }
  return fresh.length;
}

/** Team decision on one item: confirm, reject, or record the customer's answer. */
export async function decideItem(
  actor: Actor,
  itemId: string,
  decision: "CONFIRM" | "REJECT" | "ANSWER",
  answer?: string
) {
  assertCan(actor.role, "requirement:write");
  const item = await prisma.discoveryItem.findUniqueOrThrow({ where: { id: itemId } });

  let status: DiscoveryStatus;
  if (decision === "ANSWER") {
    if (item.kind !== "QUESTION") throw new Error("Only questions take an answer.");
    if (!answer?.trim()) throw new Error("Write down the customer's answer.");
    status = "ANSWERED";
  } else {
    if (item.kind === "QUESTION") throw new Error("Answer a question rather than confirming or rejecting it.");
    status = decision === "CONFIRM" ? "CONFIRMED" : "REJECTED";
  }

  const updated = await prisma.discoveryItem.update({
    where: { id: itemId },
    data: { status, answer: decision === "ANSWER" ? answer!.trim() : item.answer },
  });
  await prisma.lead.update({ where: { id: item.leadId }, data: { lastActivityAt: new Date() } });
  await audit(actor, "discovery.item_decided", "DiscoveryItem", itemId, `${item.kind} → ${status}`);
  return updated;
}

/**
 * The rule the whole discovery process exists to enforce: an unconfirmed
 * guess can never become a requirement.
 *
 *   FACT            unless rejected
 *   ASSUMPTION      only once CONFIRMED
 *   RECOMMENDATION  only once CONFIRMED (the customer agreed to it)
 *   QUESTION        only once ANSWERED (the answer is the requirement's basis)
 */
export function promotionBlocker(item: Pick<DiscoveryItem, "kind" | "status">): string | null {
  switch (item.kind) {
    case "FACT":
      return item.status === "REJECTED" ? "This fact was rejected." : null;
    case "ASSUMPTION":
    case "RECOMMENDATION":
      return item.status === "CONFIRMED" ? null : `An ${item.kind.toLowerCase()} must be confirmed before it can become a requirement.`;
    case "QUESTION":
      return item.status === "ANSWERED" ? null : "Get the customer's answer before turning a question into a requirement.";
    default:
      return `Unknown discovery item kind "${item.kind}".`;
  }
}

export interface RequirementInput {
  kind: string;
  statement: string;
  priority?: string;
  acceptanceCriteria?: string[];
}

function validateRequirement(input: RequirementInput) {
  if (!isOneOf(REQUIREMENT_KINDS, input.kind)) throw new Error("Choose a requirement kind.");
  const statement = input.statement.trim();
  if (statement.length < 10) throw new Error("Write the requirement as a full sentence.");
  if (statement.length > 1000) throw new Error("Keep a requirement under 1,000 characters; split it if needed.");
  const priority = input.priority ?? "MUST";
  if (!isOneOf(REQUIREMENT_PRIORITIES, priority)) throw new Error("Choose a priority.");
  const acceptanceCriteria = (input.acceptanceCriteria ?? []).map((c) => c.trim()).filter(Boolean).slice(0, 20);
  return { kind: input.kind, statement, priority, acceptanceCriteria };
}

export async function promoteToRequirement(actor: Actor, itemId: string, input: RequirementInput) {
  assertCan(actor.role, "requirement:write");
  const item = await prisma.discoveryItem.findUniqueOrThrow({ where: { id: itemId }, include: { requirement: true } });
  if (item.requirement) throw new Error(`Already promoted to ${item.requirement.code}.`);
  const blocker = promotionBlocker(item);
  if (blocker) throw new Error(blocker);
  const req = validateRequirement(input);

  const requirement = await prisma.$transaction(async (tx) => {
    const code = await nextCode("REQ", tx);
    return tx.requirement.create({
      data: {
        code,
        leadId: item.leadId,
        kind: req.kind,
        statement: req.statement,
        priority: req.priority,
        acceptanceCriteria: encodeStringList(req.acceptanceCriteria),
        sourceItemId: item.id,
      },
    });
  });
  await audit(actor, "requirement.created", "Requirement", requirement.id, `${requirement.code} from ${item.kind}`);
  return requirement;
}

/** A requirement written directly by the team: an explicit human decision, so no source item is needed. */
export async function createRequirement(actor: Actor, leadId: string, input: RequirementInput) {
  assertCan(actor.role, "requirement:write");
  const req = validateRequirement(input);
  const requirement = await prisma.$transaction(async (tx) => {
    const code = await nextCode("REQ", tx);
    return tx.requirement.create({
      data: {
        code,
        leadId,
        kind: req.kind,
        statement: req.statement,
        priority: req.priority,
        acceptanceCriteria: encodeStringList(req.acceptanceCriteria),
      },
    });
  });
  await audit(actor, "requirement.created", "Requirement", requirement.id, `${requirement.code} written by team`);
  return requirement;
}

/**
 * Something the team learned directly (a call, an email). A FACT recorded by
 * the team is the customer's own statement, so it starts CONFIRMED; anything
 * else still needs the same decision as agent output.
 */
export async function addTeamItem(actor: Actor, leadId: string, kind: string, text: string) {
  assertCan(actor.role, "requirement:write");
  if (!isOneOf(DISCOVERY_KINDS, kind)) throw new Error("Choose what kind of item this is.");
  const clean = text.trim();
  if (clean.length < 5) throw new Error("Write the item out in a sentence.");
  if (clean.length > 1000) throw new Error("Keep it under 1,000 characters.");
  const item = await prisma.discoveryItem.create({
    data: { leadId, kind, text: clean, source: "TEAM", status: kind === "FACT" ? "CONFIRMED" : "OPEN" },
  });
  await prisma.lead.update({ where: { id: leadId }, data: { lastActivityAt: new Date() } });
  await audit(actor, "discovery.item_added", "DiscoveryItem", item.id, kind);
  return item;
}
