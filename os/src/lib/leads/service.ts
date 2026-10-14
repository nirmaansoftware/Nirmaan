import { prisma } from "../db/client";
import { audit } from "../audit";
import { assertCan } from "../auth/permissions";
import type { Actor } from "../auth/actor";
import { isOneOf, LEAD_STATUSES, type LeadStatus } from "../db/enums";

/**
 * Allowed manual status moves. WON is deliberately absent: a lead becomes
 * WON only when the client approves a proposal (proposals/service.ts), so
 * the pipeline can't claim a win nobody signed.
 */
const MANUAL_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  NEW: ["DISCOVERY", "QUALIFIED", "LOST", "SPAM"],
  DISCOVERY: ["QUALIFIED", "LOST", "NEW"],
  QUALIFIED: ["DISCOVERY", "PROPOSAL", "LOST"],
  PROPOSAL: ["QUALIFIED", "LOST"],
  WON: [],
  LOST: ["NEW"],
  SPAM: ["NEW"],
};

export function allowedLeadTransitions(from: string): readonly LeadStatus[] {
  return isOneOf(LEAD_STATUSES, from) ? MANUAL_TRANSITIONS[from] : [];
}

export async function setLeadStatus(actor: Actor, leadId: string, to: string, reason?: string) {
  assertCan(actor.role, "lead:write");
  if (!isOneOf(LEAD_STATUSES, to)) throw new Error(`Unknown lead status "${to}".`);
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (!allowedLeadTransitions(lead.status).includes(to)) {
    throw new Error(`A lead can't move from ${lead.status} to ${to}.`);
  }
  if (to === "LOST" && !reason?.trim()) throw new Error("Say why the lead was lost. It feeds pricing and positioning reviews.");

  const updated = await prisma.lead.update({
    where: { id: leadId },
    data: { status: to, lostReason: to === "LOST" ? reason!.trim() : lead.lostReason, lastActivityAt: new Date() },
  });
  await audit(actor, "lead.status_changed", "Lead", leadId, `${lead.status} → ${to}${reason ? `: ${reason}` : ""}`);
  return updated;
}

export async function addLeadNote(actor: Actor, leadId: string, body: string) {
  assertCan(actor.role, "lead:write");
  const text = body.trim();
  if (!text) throw new Error("A note can't be empty.");
  if (text.length > 4000) throw new Error("Keep notes under 4,000 characters.");
  await prisma.lead.update({ where: { id: leadId }, data: { lastActivityAt: new Date() } });
  return prisma.leadNote.create({ data: { leadId, authorId: actor.id, author: actor.label, body: text } });
}
