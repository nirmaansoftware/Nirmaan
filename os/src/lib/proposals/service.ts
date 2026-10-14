import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { nextCode } from "../ids";
import { audit } from "../audit";
import { logEvent } from "../db/logEvent";
import { assertCan } from "../auth/permissions";
import type { Actor } from "../auth/actor";
import { decodeStringList, encodeStringList } from "../db/json";
import { generateToken, hashToken, looksLikeToken } from "../auth/tokens";
import { createScheduleInvoices } from "../finance/invoices";
import {
  DEFAULT_CHANGE_POLICY,
  DEFAULT_PAYMENT_SCHEDULE,
  assertScheduleValid,
  sendBlockers,
  type MaintenancePlan,
  type Milestone,
  type PaymentStep,
} from "./model";

/** Statuses in which the team can still edit a proposal. */
const EDITABLE = ["DRAFT", "CLARIFICATION_REQUESTED"];

/**
 * Starts a draft from everything discovery established: the customer's
 * problem verbatim, the lead's MUST/SHOULD requirements as scope, confirmed
 * assumptions as assumptions. Nothing is invented; empty sections stay empty
 * and sendBlockers() says what's missing.
 */
export async function createDraftFromLead(actor: Actor, leadId: string) {
  assertCan(actor.role, "proposal:write");
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: {
      requirements: { where: { status: { not: "DROPPED" } }, orderBy: { code: "asc" } },
      discovery: { where: { kind: "ASSUMPTION", status: "CONFIRMED" } },
      proposals: { where: { status: { in: ["DRAFT", "SENT", "CLARIFICATION_REQUESTED"] } } },
    },
  });
  if (lead.proposals.length) {
    throw new Error(`${lead.code} already has an open proposal (${lead.proposals[0].code}). Edit that one instead.`);
  }

  const scope = lead.requirements.filter((r) => r.priority === "MUST" || r.priority === "SHOULD").map((r) => `${r.statement} (${r.code})`);
  const outOfScope = lead.requirements.filter((r) => r.priority === "WONT").map((r) => `${r.statement} (${r.code})`);

  const proposal = await prisma.$transaction(async (tx) => {
    const code = await nextCode("PROP", tx);
    const previous = await tx.proposal.count({ where: { leadId } });
    return tx.proposal.create({
      data: {
        code,
        leadId,
        version: previous + 1,
        title: lead.company ? `${lead.company}: proposed system` : `Proposed system for ${lead.contactName}`,
        problem: lead.problem,
        solution: "",
        scope: encodeStringList(scope),
        outOfScope: encodeStringList(outOfScope),
        assumptions: encodeStringList(lead.discovery.map((d) => d.text)),
        paymentSchedule: JSON.stringify(DEFAULT_PAYMENT_SCHEDULE),
        changePolicy: DEFAULT_CHANGE_POLICY,
        createdById: actor.id,
      },
    });
  });
  await audit(actor, "proposal.created", "Proposal", proposal.id, `${proposal.code} for ${lead.code}`);
  return proposal;
}

export interface ProposalEdit {
  title: string;
  problem: string;
  solution: string;
  scope: string[];
  outOfScope: string[];
  deliverables: string[];
  milestones: Milestone[];
  technology: string | null;
  priceTotal: number;
  paymentSchedule: PaymentStep[];
  maintenance: MaintenancePlan | null;
  assumptions: string[];
  changePolicy: string;
  validUntil: Date | null;
  /**
   * Internal economics. Omitted (undefined) when the editor can't see
   * economics; the stored values are then kept, so the numbers never have
   * to round-trip through a page that person can read.
   */
  economics?: {
    estHours: number;
    estCostHuman: number;
    estCostAi: number;
    estCostInfra: number;
    estCostOther: number;
  };
}

function nonNegativeInt(n: number, label: string): number {
  if (!Number.isInteger(n) || n < 0 || n > 1_000_000_000) throw new Error(`${label} must be a whole number of rupees, 0 or more.`);
  return n;
}

export async function updateProposal(actor: Actor, proposalId: string, edit: ProposalEdit) {
  assertCan(actor.role, "proposal:write");
  if (edit.economics) assertCan(actor.role, "economics:read");
  const current = await prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } });
  if (!EDITABLE.includes(current.status)) {
    throw new Error(`${current.code} is ${current.status.toLowerCase()} and can't be edited. Start a new version instead.`);
  }
  if (!edit.title.trim()) throw new Error("Give the proposal a title.");
  assertScheduleValid(edit.paymentSchedule);
  if (edit.maintenance && (!edit.maintenance.name.trim() || edit.maintenance.monthly <= 0)) {
    throw new Error("A maintenance plan needs a name and a monthly price. Or leave it out.");
  }

  const updated = await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      title: edit.title.trim(),
      problem: edit.problem.trim(),
      solution: edit.solution.trim(),
      scope: encodeStringList(edit.scope),
      outOfScope: encodeStringList(edit.outOfScope),
      deliverables: encodeStringList(edit.deliverables),
      milestones: JSON.stringify(edit.milestones),
      technology: edit.technology?.trim() || null,
      priceTotal: nonNegativeInt(edit.priceTotal, "Price"),
      paymentSchedule: JSON.stringify(edit.paymentSchedule),
      maintenance: edit.maintenance ? JSON.stringify(edit.maintenance) : null,
      assumptions: encodeStringList(edit.assumptions),
      changePolicy: edit.changePolicy.trim(),
      validUntil: edit.validUntil,
      ...(edit.economics
        ? {
            estHours: nonNegativeInt(edit.economics.estHours, "Estimated hours"),
            estCostHuman: nonNegativeInt(edit.economics.estCostHuman, "Human cost"),
            estCostAi: nonNegativeInt(edit.economics.estCostAi, "AI cost"),
            estCostInfra: nonNegativeInt(edit.economics.estCostInfra, "Infrastructure cost"),
            estCostOther: nonNegativeInt(edit.economics.estCostOther, "Other cost"),
          }
        : {}),
    },
  });
  await audit(actor, "proposal.updated", "Proposal", proposalId, updated.code);
  return updated;
}

/**
 * Sends (or re-sends) a proposal. Every send issues a fresh link and
 * invalidates the previous one; the raw token is returned exactly once for
 * the team to share and is never stored.
 */
export async function sendProposal(actor: Actor, proposalId: string) {
  assertCan(actor.role, "proposal:send");
  const proposal = await prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } });
  if (!EDITABLE.includes(proposal.status) && proposal.status !== "SENT") {
    throw new Error(`${proposal.code} is ${proposal.status.toLowerCase()} and can't be sent.`);
  }
  const blockers = sendBlockers(proposal);
  if (blockers.length) throw new Error(`Not ready to send: ${blockers.join(" ")}`);

  const token = generateToken();
  await prisma.$transaction([
    prisma.proposal.update({
      where: { id: proposalId },
      data: { status: "SENT", sentAt: new Date(), shareTokenHash: hashToken(token), clientNote: null },
    }),
    prisma.lead.update({ where: { id: proposal.leadId }, data: { status: "PROPOSAL", lastActivityAt: new Date() } }),
  ]);
  await audit(actor, "proposal.sent", "Proposal", proposalId, `${proposal.code} link issued`);
  return { token };
}

/** Invalidates the client link without changing anything else. */
export async function revokeProposalLink(actor: Actor, proposalId: string) {
  assertCan(actor.role, "proposal:send");
  await prisma.proposal.update({ where: { id: proposalId }, data: { shareTokenHash: null } });
  await audit(actor, "proposal.link_revoked", "Proposal", proposalId);
}

export async function proposalForToken(token: string) {
  if (!looksLikeToken(token)) return null;
  return prisma.proposal.findUnique({
    where: { shareTokenHash: hashToken(token) },
    include: { lead: { select: { contactName: true, company: true } }, project: { select: { code: true } } },
  });
}

export type ClientDecision = "APPROVE" | "REJECT" | "CLARIFY";

export interface ClientDecisionResult {
  status: string;
  projectCode?: string;
  /** Raw status-page token, returned once on approval so the client can bookmark progress. */
  statusToken?: string;
}

/**
 * The client's decision, made through the proposal link. Approval is the
 * PROPOSAL gate: it creates the client record and the project workspace,
 * moves the lead's requirements onto the project, and records the gate as
 * approved by the client, all in one transaction.
 */
export async function recordClientDecision(
  token: string,
  decision: ClientDecision,
  input: { name: string; note?: string },
  now = new Date()
): Promise<ClientDecisionResult> {
  const proposal = await proposalForToken(token);
  if (!proposal) throw new Error("This proposal link isn't valid any more. Ask Nirmaan for a fresh one.");
  if (proposal.status !== "SENT") throw new Error("This proposal has already been answered.");
  if (proposal.validUntil && proposal.validUntil < now) {
    throw new Error("This proposal has expired. Ask Nirmaan for an updated one.");
  }

  const name = input.name.trim().slice(0, 120);
  const note = input.note?.trim().slice(0, 4000) || null;
  if (!name) throw new Error("Please type your name to confirm.");
  if ((decision === "CLARIFY" || decision === "REJECT") && !note) {
    throw new Error(decision === "CLARIFY" ? "Tell us what you'd like clarified." : "Tell us briefly why, so we can improve.");
  }
  const actor = { type: "CLIENT_LINK" as const, id: null, label: `${name} (client, via proposal link)` };

  if (decision !== "APPROVE") {
    const status = decision === "CLARIFY" ? "CLARIFICATION_REQUESTED" : "REJECTED";
    await prisma.$transaction(async (tx) => {
      await claim(tx, proposal.id, { status, decidedAt: now, decidedByName: name, clientNote: note, shareTokenHash: null });
      await tx.lead.update({
        where: { id: proposal.leadId },
        data: { status: decision === "REJECT" ? "QUALIFIED" : "PROPOSAL", lastActivityAt: now },
      });
    });
    await audit(actor, `proposal.client_${decision === "CLARIFY" ? "clarification" : "rejected"}`, "Proposal", proposal.id, note ?? undefined);
    return { status };
  }

  const statusToken = generateToken();
  const project = await prisma.$transaction(async (tx) => {
    await claim(tx, proposal.id, { status: "APPROVED", decidedAt: now, decidedByName: name, clientNote: note, shareTokenHash: null });
    const lead = await tx.lead.findUniqueOrThrow({ where: { id: proposal.leadId } });
    const client =
      lead.clientId
        ? await tx.client.findUniqueOrThrow({ where: { id: lead.clientId } })
        : await tx.client.create({
            data: { name: lead.company ?? lead.contactName, company: lead.company, email: lead.contactEmail, contact: lead.contactName },
          });
    const code = await nextCode("PRJ", tx);
    const created = await tx.project.create({
      data: {
        code,
        name: proposal.title,
        clientId: client.id,
        leadId: lead.id,
        proposalId: proposal.id,
        stage: "APPROVED",
        artifactsPath: code.toLowerCase(),
        statusTokenHash: hashToken(statusToken),
      },
    });
    // The billing schedule exists from the moment the project does (Phase 3).
    await createScheduleInvoices(tx, created.id, client.id, proposal);
    await tx.requirement.updateMany({
      where: { leadId: lead.id, status: { not: "DROPPED" } },
      data: { projectId: created.id, status: "APPROVED" },
    });
    await tx.approval.create({
      data: {
        projectId: created.id,
        gate: "PROPOSAL",
        status: "APPROVED",
        requestedBy: "nirmaan",
        decidedBy: `client:${name}`,
        decidedAt: now,
      },
    });
    await tx.proposal.updateMany({
      where: { leadId: lead.id, id: { not: proposal.id }, status: { in: ["DRAFT", "CLARIFICATION_REQUESTED"] } },
      data: { status: "SUPERSEDED" },
    });
    await tx.lead.update({ where: { id: lead.id }, data: { status: "WON", clientId: client.id, lastActivityAt: now } });
    return created;
  });

  await logEvent(project.id, null, null, `${name} approved ${proposal.code}. Project ${project.code} created at stage APPROVED.`);
  await audit(actor, "proposal.client_approved", "Proposal", proposal.id, `${proposal.code} → ${project.code}`);
  return { status: "APPROVED", projectCode: project.code!, statusToken };
}

/**
 * Moves a proposal out of SENT only if it is still SENT. With two
 * simultaneous decisions, exactly one wins; the other gets a clear error
 * and its transaction rolls back.
 */
async function claim(tx: Prisma.TransactionClient, proposalId: string, data: Prisma.ProposalUpdateManyMutationInput) {
  const { count } = await tx.proposal.updateMany({ where: { id: proposalId, status: "SENT" }, data });
  if (count !== 1) throw new Error("This proposal has already been answered.");
}

/** Scope snapshot used by the change-request check: the approved proposal's scope list. */
export async function approvedScopeFor(projectId: string): Promise<string[]> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { proposal: true } });
  return project.proposal ? decodeStringList(project.proposal.scope) : [];
}
