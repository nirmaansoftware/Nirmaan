import { prisma } from "../db/client";
import { nextCode } from "../ids";
import { audit } from "../audit";
import { logEvent } from "../db/logEvent";
import { assertCan } from "../auth/permissions";
import { createChangeInvoice } from "../finance/invoices";
import type { Actor } from "../auth/actor";

/**
 * "Can you also add X?"
 *
 *   inside approved scope  → becomes a normal task (CONVERTED)
 *   outside approved scope → a change request with cost and timeline
 *                            impact, which someone with change:decide must
 *                            approve before any work starts
 *
 * The scope decision is a human judgment against the approved proposal's
 * scope list (shown next to the request); the system's job is to make
 * sure that judgment is recorded and that out-of-scope work can't start
 * silently.
 */
export async function createChangeRequest(actor: Actor, projectId: string, input: { requestedBy: string; description: string }) {
  assertCan(actor.role, "change:write");
  const description = input.description.trim();
  const requestedBy = input.requestedBy.trim();
  if (description.length < 10) throw new Error("Describe the requested change in a sentence or two.");
  if (description.length > 4000) throw new Error("Keep the description under 4,000 characters.");
  if (!requestedBy) throw new Error("Who asked for it?");

  const cr = await prisma.$transaction(async (tx) => {
    const code = await nextCode("CR", tx);
    return tx.changeRequest.create({ data: { code, projectId, requestedBy, description } });
  });
  await logEvent(projectId, null, null, `${cr.code} logged: "${description.slice(0, 120)}" (requested by ${requestedBy}).`);
  await audit(actor, "change.created", "ChangeRequest", cr.id, cr.code);
  return cr;
}

export interface Assessment {
  inScope: boolean;
  impact: string;
  costDelta: number;
  timelineDelta: number;
}

export async function assessChangeRequest(actor: Actor, id: string, a: Assessment) {
  assertCan(actor.role, "change:write");
  const cr = await prisma.changeRequest.findUniqueOrThrow({ where: { id } });
  if (!["OPEN", "ASSESSED"].includes(cr.status)) throw new Error(`${cr.code} is already ${cr.status.toLowerCase()}.`);
  if (!a.impact.trim()) throw new Error("Describe the impact, even if it's small.");
  if (!Number.isInteger(a.costDelta) || a.costDelta < 0) throw new Error("Additional cost must be a whole number of rupees, 0 or more.");
  if (!Number.isInteger(a.timelineDelta) || a.timelineDelta < 0) throw new Error("Additional time must be whole days, 0 or more.");
  if (!a.inScope && a.costDelta === 0 && a.timelineDelta === 0) {
    throw new Error("Out-of-scope work with no cost and no time impact is free work. Mark it in scope, or price it.");
  }

  const updated = await prisma.changeRequest.update({
    where: { id },
    data: {
      inScope: a.inScope,
      impact: a.impact.trim(),
      costDelta: a.inScope ? 0 : a.costDelta,
      timelineDelta: a.inScope ? 0 : a.timelineDelta,
      status: "ASSESSED",
    },
  });
  await audit(actor, "change.assessed", "ChangeRequest", id, `${cr.code}: ${a.inScope ? "in scope" : `out of scope, +${a.costDelta} INR, +${a.timelineDelta} days`}`);
  return updated;
}

/** In-scope requests become normal work immediately: a TASK- in the backlog. */
export async function convertInScope(actor: Actor, id: string) {
  assertCan(actor.role, "change:write");
  const cr = await prisma.changeRequest.findUniqueOrThrow({ where: { id } });
  if (cr.status !== "ASSESSED" || cr.inScope !== true) throw new Error("Only an assessed, in-scope request can become a task directly.");
  return toTask(actor, cr.id, cr.projectId, cr.code, cr.description, "CONVERTED");
}

/** Out-of-scope requests need an explicit decision from someone who can accept the cost. */
export async function decideChangeRequest(actor: Actor, id: string, decision: "APPROVED" | "REJECTED") {
  assertCan(actor.role, "change:decide");
  const cr = await prisma.changeRequest.findUniqueOrThrow({ where: { id } });
  if (cr.status !== "ASSESSED" || cr.inScope !== false) throw new Error("Only an assessed, out-of-scope request needs this decision.");
  if (decision === "REJECTED") {
    const updated = await prisma.changeRequest.update({
      where: { id },
      data: { status: "REJECTED", decidedBy: actor.label, decidedAt: new Date() },
    });
    await logEvent(cr.projectId, null, null, `${cr.code} rejected by ${actor.label}.`);
    await audit(actor, "change.rejected", "ChangeRequest", id, cr.code);
    return updated;
  }
  return toTask(actor, cr.id, cr.projectId, cr.code, cr.description, "APPROVED");
}

async function toTask(actor: Actor, id: string, projectId: string, crCode: string, description: string, status: "CONVERTED" | "APPROVED") {
  const result = await prisma.$transaction(async (tx) => {
    const code = await nextCode("TASK", tx);
    const task = await tx.task.create({
      data: {
        code,
        projectId,
        title: `${crCode}: ${description.slice(0, 90)}${description.length > 90 ? "…" : ""}`,
        description,
        status: "BACKLOG",
      },
    });
    const cr = await tx.changeRequest.update({
      where: { id },
      data: { status, taskId: task.id, decidedBy: actor.label, decidedAt: new Date() },
    });
    // Approved, priced out-of-scope work is billed on its own invoice (Phase 3).
    const invoice = status === "APPROVED" ? await createChangeInvoice(tx, cr) : null;
    return { task, cr, invoice };
  });
  await logEvent(
    projectId,
    null,
    null,
    `${crCode} ${status === "APPROVED" ? "approved" : "accepted as in scope"} by ${actor.label}; created ${result.task.code}${result.invoice ? ` and draft invoice ${result.invoice.code}` : ""}.`
  );
  await audit(actor, `change.${status.toLowerCase()}`, "ChangeRequest", id, `${crCode} → ${result.task.code}`);
  return result.cr;
}
