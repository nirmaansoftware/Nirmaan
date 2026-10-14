import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db/client";
import {
  economicsOf,
  parseMilestones,
  parsePaymentSchedule,
  scheduleAmounts,
  sendBlockers,
  viewOf,
  DEFAULT_PAYMENT_SCHEDULE,
} from "./model";
import {
  createDraftFromLead,
  proposalForToken,
  recordClientDecision,
  sendProposal,
  updateProposal,
  type ProposalEdit,
} from "./service";
import { createRequirement } from "../discovery/items";
import { FOUNDER, actorAs, cleanupLead, makeLead } from "../testHelpers/businessFixtures";

test("payment schedule: must total 100%, amounts always sum exactly to the price", () => {
  assert.deepEqual(parsePaymentSchedule("On approval | 50\nOn delivery | 50"), [
    { label: "On approval", percent: 50 },
    { label: "On delivery", percent: 50 },
  ]);
  assert.throws(() => parsePaymentSchedule("A | 50\nB | 40"), /add up to 90%/);
  assert.throws(() => parsePaymentSchedule("A | fifty"), /whole percentage/);
  const amounts = scheduleAmounts(100_001, DEFAULT_PAYMENT_SCHEDULE);
  assert.equal(amounts.reduce((s, a) => s + a.amount, 0), 100_001);
});

test("milestones parse from 'name | weeks' lines", () => {
  assert.deepEqual(parseMilestones("- Discovery | 1\n* Build | 3"), [
    { name: "Discovery", weeks: 1 },
    { name: "Build", weeks: 3 },
  ]);
  assert.throws(() => parseMilestones("Build"), /number of weeks/);
});

test("economics: margin from price and estimated costs; no margin without revenue", () => {
  const e = economicsOf({ priceTotal: 200_000, estCostHuman: 90_000, estCostAi: 4_000, estCostInfra: 6_000, estCostOther: 0 });
  assert.deepEqual(e, { revenue: 200_000, estimatedCost: 100_000, grossProfit: 100_000, grossMargin: 0.5 });
  assert.equal(economicsOf({ priceTotal: 0, estCostHuman: 1, estCostAi: 0, estCostInfra: 0, estCostOther: 0 }).grossMargin, null);
});

function completeEdit(overrides: Partial<ProposalEdit> = {}): ProposalEdit {
  return {
    title: "Order tracking system",
    problem: "Orders arrive through WhatsApp and get lost between people and spreadsheets.",
    solution: "A small web app where every order has an owner, a status and a follow-up date.",
    scope: ["Order board with statuses", "Follow-up reminders"],
    outOfScope: ["Native mobile apps", "Accounting integration"],
    deliverables: ["Deployed web app", "Admin guide"],
    milestones: [{ name: "Build", weeks: 3 }],
    technology: null,
    priceTotal: 150_000,
    paymentSchedule: DEFAULT_PAYMENT_SCHEDULE,
    maintenance: { name: "Care plan", monthly: 4_000, includes: ["Hosting", "Backups"] },
    assumptions: [],
    changePolicy: "Out-of-scope work is a change request.",
    validUntil: null,
    economics: { estHours: 80, estCostHuman: 60_000, estCostAi: 2_000, estCostInfra: 3_000, estCostOther: 0 },
    ...overrides,
  };
}

test("proposal lifecycle: draft from discovery → send → client approves → project workspace exists", async () => {
  const lead = await makeLead({ company: "Fixture Traders" });
  try {
    const req = await createRequirement(FOUNDER, lead.id, { kind: "FUNCTIONAL", statement: "Every order has an owner and a status.", priority: "MUST" });
    await createRequirement(FOUNDER, lead.id, { kind: "FUNCTIONAL", statement: "A native iOS app for customers.", priority: "WONT" });

    const draft = await createDraftFromLead(FOUNDER, lead.id);
    const v = viewOf(draft);
    assert.ok(v.scope.some((s) => s.includes(req.code)), "MUST requirement lands in scope with its code");
    assert.ok(v.outOfScope.some((s) => s.includes("iOS")), "WONT requirement lands out of scope");
    assert.equal(draft.problem, lead.problem, "the customer's problem is kept verbatim");
    assert.ok(sendBlockers(draft).length > 0, "a fresh draft is not sendable");
    await assert.rejects(() => sendProposal(FOUNDER, draft.id), /Not ready to send/);
    await assert.rejects(() => createDraftFromLead(FOUNDER, lead.id), /already has an open proposal/);

    await updateProposal(FOUNDER, draft.id, completeEdit());
    await assert.rejects(() => sendProposal(actorAs("ENGINEER"), draft.id), /permission/);
    const { token } = await sendProposal(FOUNDER, draft.id);
    assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status, "PROPOSAL");
    const stored = await prisma.proposal.findUniqueOrThrow({ where: { id: draft.id } });
    assert.notEqual(stored.shareTokenHash, token, "only the hash is stored");
    assert.equal((await proposalForToken(token))?.id, draft.id);
    await assert.rejects(() => updateProposal(FOUNDER, draft.id, completeEdit()), /can't be edited/);

    await assert.rejects(() => recordClientDecision(token, "APPROVE", { name: " " }), /type your name/);
    const result = await recordClientDecision(token, "APPROVE", { name: "Meera (Fixture Traders)" });
    assert.equal(result.status, "APPROVED");
    assert.match(result.projectCode!, /^PRJ-\d{3,}$/);
    assert.ok(result.statusToken);

    const project = await prisma.project.findUniqueOrThrow({
      where: { code: result.projectCode! },
      include: { client: true, approvals: true, requirements: true },
    });
    assert.equal(project.stage, "APPROVED");
    assert.equal(project.client?.company, "Fixture Traders");
    assert.deepEqual(project.approvals.map((a) => [a.gate, a.status]), [["PROPOSAL", "APPROVED"]]);
    assert.equal(project.approvals[0].decidedBy, "client:Meera (Fixture Traders)");
    assert.equal(project.requirements.length, 2);
    assert.ok(project.requirements.every((r) => r.status === "APPROVED"));
    assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status, "WON");

    assert.equal(await proposalForToken(token), null, "the link stops working once answered");
    await assert.rejects(() => recordClientDecision(token, "APPROVE", { name: "Meera" }), /isn't valid/);
  } finally {
    await cleanupLead(lead.id);
  }
});

test("two simultaneous approvals create exactly one project", async () => {
  const lead = await makeLead();
  try {
    const draft = await createDraftFromLead(FOUNDER, lead.id);
    await updateProposal(FOUNDER, draft.id, completeEdit());
    const { token } = await sendProposal(FOUNDER, draft.id);
    const results = await Promise.allSettled([
      recordClientDecision(token, "APPROVE", { name: "A" }),
      recordClientDecision(token, "APPROVE", { name: "B" }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await prisma.project.count({ where: { leadId: lead.id } }), 1);
  } finally {
    await cleanupLead(lead.id);
  }
});

test("clarification and rejection need a note; expired proposals can't be answered", async () => {
  const lead = await makeLead();
  try {
    const draft = await createDraftFromLead(FOUNDER, lead.id);
    await updateProposal(FOUNDER, draft.id, completeEdit());
    const { token } = await sendProposal(FOUNDER, draft.id);
    await assert.rejects(() => recordClientDecision(token, "CLARIFY", { name: "Ravi" }), /clarified/);
    const r = await recordClientDecision(token, "CLARIFY", { name: "Ravi", note: "Does the price include hosting?" });
    assert.equal(r.status, "CLARIFICATION_REQUESTED");
    const after = await prisma.proposal.findUniqueOrThrow({ where: { id: draft.id } });
    assert.equal(after.clientNote, "Does the price include hosting?");

    // Team edits and re-sends with a validity date already in the past for the client's clock.
    await updateProposal(FOUNDER, draft.id, completeEdit({ validUntil: new Date(Date.now() + 60_000) }));
    const resent = await sendProposal(FOUNDER, draft.id);
    assert.equal(await proposalForToken(token), null, "re-sending invalidates the old link");
    await assert.rejects(
      () => recordClientDecision(resent.token, "APPROVE", { name: "Ravi" }, new Date(Date.now() + 120_000)),
      /expired/
    );
    const rejected = await recordClientDecision(resent.token, "REJECT", { name: "Ravi", note: "Going with an off-the-shelf tool." });
    assert.equal(rejected.status, "REJECTED");
    assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status, "QUALIFIED");
  } finally {
    await cleanupLead(lead.id);
  }
});

test("economics are only written by someone allowed to see them, and kept when omitted", async () => {
  const lead = await makeLead();
  try {
    const draft = await createDraftFromLead(FOUNDER, lead.id);
    await updateProposal(FOUNDER, draft.id, completeEdit());
    const { economics, ...withoutEconomics } = completeEdit({ title: "Renamed by someone without economics access" });
    assert.ok(economics);
    await updateProposal(FOUNDER, draft.id, withoutEconomics);
    const kept = await prisma.proposal.findUniqueOrThrow({ where: { id: draft.id } });
    assert.equal(kept.estCostHuman, 60_000, "omitting economics keeps the stored numbers");
    assert.equal(kept.title, "Renamed by someone without economics access");
  } finally {
    await cleanupLead(lead.id);
  }
});
