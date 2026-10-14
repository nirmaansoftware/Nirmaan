import { prisma } from "../db/client";
import { logEvent } from "../db/logEvent";
import type { ApprovalGate, ProjectStage } from "../db/enums";

/**
 * The gated stage transitions. The original six come verbatim from the
 * architecture plan's Section G ("the six quality gates map onto the stage transitions
 * that actually matter (Requirements→Planning, Design→Architecture,
 * Architecture→Implementation, Implementation→QA, QA→Security Review,
 * Security Review→Deployment).")
 *
 * Every OTHER stage transition (LEAD→DISCOVERY, DISCOVERY→REQUIREMENTS,
 * ESTIMATION→PROPOSAL, etc.) has no formal quality gate in this system —
 * that's a deliberate reading of Section H, not an oversight. This module
 * only knows how to advance a project through these transitions (six from
 * the original plan plus three Phase 1 business gates).
 *
 * What "enforced" means here, deliberately: a gate is satisfied when a
 * human (or reviewing agent) has recorded an explicit APPROVED Approval
 * for it — this module does not attempt to algorithmically judge whether
 * a PRD is "good enough" (that judgment call is exactly what the Approval
 * decision represents). It only refuses to advance the project's stage
 * without that recorded decision.
 */
export const GATE_TRANSITIONS: Record<ApprovalGate, { from: ProjectStage; to: ProjectStage }> = {
  // Phase 1 business gates (operating model: proposal approved, implementation
  // plan approved, handover approved). PROPOSAL is normally recorded by the
  // client's own decision on the proposal link (src/lib/proposals/service.ts).
  PROPOSAL: { from: "PROPOSAL", to: "APPROVED" },
  PLAN: { from: "PLANNING", to: "DESIGN" },
  HANDOVER: { from: "DEPLOYMENT", to: "MONITORING" },
  REQUIREMENTS: { from: "REQUIREMENTS", to: "PLANNING" },
  DESIGN: { from: "DESIGN", to: "ARCHITECTURE" },
  ARCHITECTURE: { from: "ARCHITECTURE", to: "IMPLEMENTATION" },
  IMPLEMENTATION: { from: "IMPLEMENTATION", to: "QA" },
  QA: { from: "QA", to: "SECURITY_REVIEW" },
  PRODUCTION: { from: "SECURITY_REVIEW", to: "DEPLOYMENT" },
};

/** The gate (if any) that governs leaving a given stage. */
function gateForStage(stage: string): ApprovalGate | null {
  const entry = (Object.entries(GATE_TRANSITIONS) as [ApprovalGate, { from: ProjectStage; to: ProjectStage }][]).find(
    ([, transition]) => transition.from === stage
  );
  return entry ? entry[0] : null;
}

export interface GateCheckResult {
  canAdvance: boolean;
  currentStage: string;
  nextStage: string | null;
  gate: ApprovalGate | null;
  reason: string;
}

/**
 * Checks whether a project's current stage can advance to the next
 * gated stage. Never mutates anything — read-only, safe to call from a
 * UI to show gate status without side effects.
 */
export async function checkGate(projectId: string): Promise<GateCheckResult> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const gate = gateForStage(project.stage);

  if (!gate) {
    return {
      canAdvance: false,
      currentStage: project.stage,
      nextStage: null,
      gate: null,
      reason: `Stage "${project.stage}" has no defined quality gate in this system — it isn't one of the gated transitions.`,
    };
  }

  const approval = await prisma.approval.findFirst({
    where: { projectId, gate },
    orderBy: { createdAt: "desc" },
  });

  if (!approval) {
    return {
      canAdvance: false,
      currentStage: project.stage,
      nextStage: GATE_TRANSITIONS[gate].to,
      gate,
      reason: `No ${gate} approval has been requested yet for this project.`,
    };
  }

  if (approval.status !== "APPROVED") {
    return {
      canAdvance: false,
      currentStage: project.stage,
      nextStage: GATE_TRANSITIONS[gate].to,
      gate,
      reason: `${gate} gate is ${approval.status.toLowerCase()}, not approved.`,
    };
  }

  return {
    canAdvance: true,
    currentStage: project.stage,
    nextStage: GATE_TRANSITIONS[gate].to,
    gate,
    reason: `${gate} gate approved.`,
  };
}

/**
 * Advances a project's stage if — and only if — its current gate has an
 * APPROVED Approval on file. Throws with the gate's own reason string if
 * not; never silently no-ops and never silently advances.
 */
export async function advanceProjectStage(projectId: string) {
  const check = await checkGate(projectId);
  if (!check.canAdvance) {
    throw new Error(`Cannot advance project ${projectId}: ${check.reason}`);
  }

  const project = await prisma.project.update({
    where: { id: projectId },
    data: { stage: check.nextStage! },
  });

  const event = await logEvent(
    projectId,
    null,
    null,
    `Advanced from ${check.currentStage} to ${check.nextStage} — ${check.gate} gate approved.`
  );

  return { project, event };
}

/**
 * Convenience used by the Approvals UI: after an APPROVED decision, try
 * to advance the project's stage if that approval is the one currently
 * blocking it. Returns null (does not throw) if the project isn't
 * actually blocked on this gate right now — e.g. the approval was for a
 * gate the project has already moved past, or is a re-approval — so
 * callers don't need special-case error handling for the common case.
 */
export async function tryAdvanceAfterApproval(projectId: string, gate: ApprovalGate) {
  const check = await checkGate(projectId);
  if (check.canAdvance && check.gate === gate) {
    return advanceProjectStage(projectId);
  }
  return null;
}
