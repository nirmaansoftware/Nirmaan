import { prisma } from "../db/client";
import { audit } from "../audit";
import { logEvent } from "../db/logEvent";
import { assertCan } from "../auth/permissions";
import type { Actor } from "../auth/actor";
import { generateToken, hashToken, looksLikeToken } from "../auth/tokens";
import { APPROVAL_GATES, SERVICE_TYPES, isOneOf, type ApprovalGate } from "../db/enums";
import { GATE_TRANSITIONS, advanceProjectStage, checkGate, tryAdvanceAfterApproval } from "../orchestrator/qualityGates";
import { nextStage } from "./progress";

/** The gate that governs leaving a stage, if any. */
export function gateLeaving(stage: string): ApprovalGate | null {
  const hit = (Object.entries(GATE_TRANSITIONS) as [ApprovalGate, { from: string }][]).find(([, t]) => t.from === stage);
  return hit ? hit[0] : null;
}

/**
 * Moves a project one stage forward. Gated transitions go through the
 * existing gate engine (which refuses without an APPROVED approval);
 * ungated ones move directly. Either way the move is attributed and logged.
 */
export async function moveToNextStage(actor: Actor, projectId: string) {
  assertCan(actor.role, "project:write");
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const gate = gateLeaving(project.stage);
  if (gate) {
    const check = await checkGate(projectId);
    if (!check.canAdvance) throw new Error(`Can't move on yet: ${check.reason} Request the ${gate} gate, then approve it in Approvals.`);
    const { project: moved } = await advanceProjectStage(projectId);
    await audit(actor, "project.stage_advanced", "Project", projectId, `${project.stage} → ${moved.stage} (${gate} gate)`);
    return moved;
  }
  const to = nextStage(project.stage);
  if (!to) throw new Error(`${project.stage} is the last stage.`);
  const moved = await prisma.project.update({ where: { id: projectId }, data: { stage: to } });
  await logEvent(projectId, null, null, `${actor.label} moved the project from ${project.stage} to ${to}.`);
  await audit(actor, "project.stage_advanced", "Project", projectId, `${project.stage} → ${to}`);
  return moved;
}

/** Asks for a gate decision. One open request per gate at a time. */
export async function requestGate(actor: Actor, projectId: string, gate: string) {
  assertCan(actor.role, "project:write");
  if (!isOneOf(APPROVAL_GATES, gate)) throw new Error(`Unknown gate "${gate}".`);
  const open = await prisma.approval.findFirst({ where: { projectId, gate, status: "PENDING" } });
  if (open) throw new Error(`A ${gate} decision is already waiting in Approvals.`);
  const approval = await prisma.approval.create({
    data: { projectId, gate, status: "PENDING", requestedBy: actor.label },
  });
  await logEvent(projectId, null, null, `${actor.label} requested the ${gate} gate.`);
  await audit(actor, "gate.requested", "Approval", approval.id, gate);
  return approval;
}

/**
 * A human gate decision. Same behaviour as the original Approvals action
 * (approving the gate currently blocking the project advances it), but
 * attributed to a real, permitted user instead of the literal "human".
 */
export async function decideGate(actor: Actor, approvalId: string, status: "APPROVED" | "REJECTED") {
  assertCan(actor.role, "approval:decide");
  const current = await prisma.approval.findUniqueOrThrow({ where: { id: approvalId } });
  if (current.status !== "PENDING") throw new Error(`This ${current.gate} decision was already made.`);
  // Every project teaches the next one: no handover without a post-mortem.
  if (status === "APPROVED" && current.gate === "HANDOVER") {
    const pm = await prisma.postMortem.findUnique({ where: { projectId: current.projectId } });
    if (!pm) throw new Error("Record the project's post-mortem before approving handover.");
  }
  const approval = await prisma.approval.update({
    where: { id: approvalId },
    data: { status, decidedBy: actor.label, decidedAt: new Date() },
  });
  await logEvent(approval.projectId, null, null, `${actor.label} ${status === "APPROVED" ? "approved" : "rejected"} the ${approval.gate} gate.`);
  await audit(actor, `gate.${status.toLowerCase()}`, "Approval", approvalId, approval.gate);
  if (status === "APPROVED") await tryAdvanceAfterApproval(approval.projectId, approval.gate as ApprovalGate);
  return approval;
}

export async function setServiceType(actor: Actor, projectId: string, serviceType: string) {
  assertCan(actor.role, "project:write");
  if (serviceType && !isOneOf(SERVICE_TYPES, serviceType)) throw new Error("Unknown service type.");
  await prisma.project.update({ where: { id: projectId }, data: { serviceType: serviceType || null } });
  await audit(actor, "project.service_type_set", "Project", projectId, serviceType || "cleared");
}

/** Issues a fresh client status link (the old one stops working). Raw token is returned once. */
export async function issueStatusLink(actor: Actor, projectId: string) {
  assertCan(actor.role, "project:write");
  const token = generateToken();
  await prisma.project.update({ where: { id: projectId }, data: { statusTokenHash: hashToken(token) } });
  await audit(actor, "project.status_link_issued", "Project", projectId);
  return { token };
}

export async function projectForStatusToken(token: string) {
  if (!looksLikeToken(token)) return null;
  return prisma.project.findUnique({
    where: { statusTokenHash: hashToken(token) },
    select: {
      code: true,
      name: true,
      stage: true,
      updatedAt: true,
      client: { select: { name: true } },
      // Only invoices the client has actually been sent; drafts and voids stay internal.
      invoices: {
        where: { status: { in: ["ISSUED", "PAID"] } },
        orderBy: { createdAt: "asc" },
        select: { code: true, label: true, total: true, status: true, dueDate: true, paidAt: true, payments: { select: { amount: true } } },
      },
    },
  });
}
