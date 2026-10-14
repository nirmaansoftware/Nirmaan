import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db/client";
import { withTax, issueInvoice, recordPayment, voidInvoice, isOverdue, createManualInvoice } from "./invoices";
import { addCostEntry, projectEconomics } from "./costs";
import { addMonths, createSubscription, generateDueRecurringInvoices, setSubscriptionStatus } from "./recurring";
import { getSettings, updateSettings } from "./settings";
import { cfoSummary } from "./summary";
import { createDraftFromLead, recordClientDecision, sendProposal, updateProposal } from "../proposals/service";
import { DEFAULT_PAYMENT_SCHEDULE } from "../proposals/model";
import { assessChangeRequest, createChangeRequest, decideChangeRequest } from "../changes/service";
import { getToday } from "../dashboard/today";
import { FOUNDER, actorAs, cleanupLead, makeLead } from "../testHelpers/businessFixtures";

const DAY = 86_400_000;

/** A real approved project, created the way production creates one. */
async function approvedProject(price = 150_000) {
  const lead = await makeLead({ company: `Finance Fixture ${Date.now()}` });
  const draft = await createDraftFromLead(FOUNDER, lead.id);
  await updateProposal(FOUNDER, draft.id, {
    title: "Finance fixture system", problem: lead.problem, solution: "A small web app that tracks orders and reminders.",
    scope: ["Order board"], outOfScope: ["Mobile app"], deliverables: ["Web app"], milestones: [{ name: "Build", weeks: 3 }],
    technology: null, priceTotal: price, paymentSchedule: DEFAULT_PAYMENT_SCHEDULE, maintenance: null, assumptions: [],
    changePolicy: "Changes are change requests.", validUntil: null,
    economics: { estHours: 80, estCostHuman: 60_000, estCostAi: 2_000, estCostInfra: 3_000, estCostOther: 0 },
  });
  const { token } = await sendProposal(FOUNDER, draft.id);
  const r = await recordClientDecision(token, "APPROVE", { name: "Fixture Client" });
  const project = await prisma.project.findUniqueOrThrow({ where: { code: r.projectCode! } });
  return { lead, project };
}

test("tax and month arithmetic", () => {
  assert.deepEqual(withTax(60_000, 18), { subtotal: 60_000, taxRatePercent: 18, tax: 10_800, total: 70_800 });
  assert.deepEqual(withTax(99_999, 0), { subtotal: 99_999, taxRatePercent: 0, tax: 0, total: 99_999 });
  assert.equal(addMonths(new Date(Date.UTC(2026, 0, 31))).toISOString().slice(0, 10), "2026-02-28");
  assert.equal(addMonths(new Date(Date.UTC(2028, 0, 31))).toISOString().slice(0, 10), "2028-02-29", "leap year");
  assert.equal(addMonths(new Date(Date.UTC(2026, 11, 15))).toISOString().slice(0, 10), "2027-01-15");
  assert.equal(isOverdue({ status: "ISSUED", dueDate: new Date(Date.now() - DAY) }), true);
  assert.equal(isOverdue({ status: "PAID", dueDate: new Date(Date.now() - DAY) }), false);
});

test("settings validate before saving: GST needs a GSTIN, rates are sane", async () => {
  const base = { legalName: "Nirmaan", gstin: "", taxRatePercent: 0, usdToInr: 84, hourlyCost: 0, invoiceDueDays: 7, paymentInstructions: "" };
  await assert.rejects(() => updateSettings(FOUNDER, { ...base, taxRatePercent: 18 }), /needs a GSTIN/);
  await assert.rejects(() => updateSettings(FOUNDER, { ...base, gstin: "not-a-gstin" }), /doesn't look valid/);
  await assert.rejects(() => updateSettings(FOUNDER, { ...base, usdToInr: 0 }), /USD→INR/);
  await assert.rejects(() => updateSettings(actorAs("PROJECT_MANAGER"), base), /permission/);
});

test("approval creates the billing schedule; issue → part-pay → paid; guards hold", async () => {
  const { lead, project } = await approvedProject(150_000);
  try {
    const invoices = await prisma.invoice.findMany({ where: { projectId: project.id }, orderBy: { code: "asc" } });
    assert.equal(invoices.length, 3, "one draft per payment step");
    assert.ok(invoices.every((i) => i.status === "DRAFT" && i.kind === "MILESTONE" && i.clientId === project.clientId));
    assert.equal(invoices.reduce((s, i) => s + i.subtotal, 0), 150_000, "steps sum exactly to the price");

    const first = invoices[0];
    await assert.rejects(() => recordPayment(FOUNDER, first.id, { amount: 1000, method: "UPI" }), /Issue the invoice/);
    await assert.rejects(() => issueInvoice(actorAs("PROJECT_MANAGER"), first.id), /permission/);
    const issued = await issueInvoice(FOUNDER, first.id);
    assert.equal(issued.status, "ISSUED");
    assert.ok(issued.dueDate! > new Date());
    await assert.rejects(() => issueInvoice(FOUNDER, first.id), /Only a draft/);

    await assert.rejects(() => recordPayment(FOUNDER, first.id, { amount: issued.total + 1, method: "BANK" }), /more than/);
    const part = await recordPayment(FOUNDER, first.id, { amount: 20_000, method: "UPI", reference: "UTR123" });
    assert.equal(part.fullyPaid, false);
    await assert.rejects(() => voidInvoice(FOUNDER, first.id, "mistake"), /with payments/);
    const rest = await recordPayment(FOUNDER, first.id, { amount: issued.total - 20_000, method: "BANK" });
    assert.equal(rest.fullyPaid, true);
    assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: first.id } })).status, "PAID");
    await assert.rejects(() => recordPayment(FOUNDER, first.id, { amount: 1, method: "BANK" }), /already paid/);

    await voidInvoice(FOUNDER, invoices[2].id, "Re-issued with a different split");
    const e = await projectEconomics(project.id);
    assert.equal(e.collected, issued.total);
    assert.equal(e.invoiced, issued.subtotal, "drafts and voids don't count as invoiced");
  } finally {
    await cleanupLead(lead.id);
  }
});

test("approved, priced change requests are billed; economics include AI from the ledger", async () => {
  const { lead, project } = await approvedProject(100_000);
  try {
    const cr = await createChangeRequest(FOUNDER, project.id, { requestedBy: "Client", description: "Add a WhatsApp booking bot for walk-in customers." });
    await assessChangeRequest(FOUNDER, cr.id, { inScope: false, impact: "New integration", costDelta: 25_000, timelineDelta: 10 });
    await decideChangeRequest(FOUNDER, cr.id, "APPROVED");
    const changeInvoice = await prisma.invoice.findUniqueOrThrow({ where: { changeRequestId: cr.id } });
    assert.equal(changeInvoice.kind, "CHANGE");
    assert.equal(changeInvoice.subtotal, 25_000);

    const { usdToInr } = await getSettings();
    await prisma.aiUsage.create({ data: { task: "dispatch:frontend-engineer", provider: "mock", model: "m", costUsd: 2, costSource: "REPORTED", latencyMs: 1, success: true, projectId: project.id } });
    await addCostEntry(FOUNDER, project.id, { category: "HUMAN", amount: 40_000, hours: 50, note: "Build weeks 1–2" });
    await addCostEntry(FOUNDER, project.id, { category: "INFRA", amount: 1_500, note: "Hosting" });
    await assert.rejects(() => addCostEntry(FOUNDER, project.id, { category: "HUMAN", note: "no amount" }), /Enter an amount/);
    await assert.rejects(() => addCostEntry(actorAs("ENGINEER"), project.id, { category: "OTHER", amount: 1, note: "x" }), /permission/);

    const e = await projectEconomics(project.id);
    assert.equal(e.contract, 125_000, "price + approved change request");
    assert.equal(e.actual.byCategory.AI_LEDGER, Math.round(2 * usdToInr));
    assert.equal(e.actual.cost, 40_000 + 1_500 + Math.round(2 * usdToInr));
    assert.equal(e.actual.hours, 50);
    assert.equal(e.estimated.cost, 65_000);
    assert.equal(e.variance.hours, -30);
    assert.ok(e.actual.margin! > 0.5);
  } finally {
    await cleanupLead(lead.id);
  }
});

test("care plans bill each month once, pause stops billing, MRR counts active plans", async () => {
  const { lead, project } = await approvedProject();
  try {
    const now = new Date();
    const start = new Date(now.getTime() - 75 * DAY);
    const sub = await createSubscription(FOUNDER, { clientId: project.clientId!, projectId: project.id, name: "Care plan: Growth", monthly: 6_000, startDate: start });
    const first = await generateDueRecurringInvoices(FOUNDER, now);
    const billed = await prisma.invoice.findMany({ where: { subscriptionId: sub.id } });
    assert.equal(billed.length, 3, "start, +1 month, +2 months are all due");
    assert.ok(first.created >= 3);
    assert.equal((await generateDueRecurringInvoices(FOUNDER, now)).created, 0, "running again bills nothing twice");

    assert.ok((await cfoSummary(now)).mrr >= 6_000);
    await setSubscriptionStatus(FOUNDER, sub.id, "PAUSED");
    const later = new Date(now.getTime() + 40 * DAY);
    await generateDueRecurringInvoices(FOUNDER, later);
    assert.equal(await prisma.invoice.count({ where: { subscriptionId: sub.id } }), 3, "paused plans aren't billed");
    await setSubscriptionStatus(FOUNDER, sub.id, "CANCELLED");
    await assert.rejects(() => setSubscriptionStatus(FOUNDER, sub.id, "ACTIVE"), /can't be restarted/);
  } finally {
    await cleanupLead(lead.id);
  }
});

test("no cost figures means no margin, never a fake 100%", async () => {
  const { lead, project } = await approvedProject(80_000);
  try {
    await prisma.proposal.update({ where: { id: project.proposalId! }, data: { estCostHuman: 0, estCostAi: 0, estCostInfra: 0, estCostOther: 0 } });
    const e = await projectEconomics(project.id);
    assert.equal(e.estimated.margin, null);
    assert.equal(e.actual.margin, null);
  } finally {
    await cleanupLead(lead.id);
  }
});

test("money on the Today screen only for finance roles; manual invoices need finance:write", async () => {
  assert.equal((await getToday(new Date(), { includeMoney: false })).money, null);
  const withMoney = await getToday(new Date(), { includeMoney: true });
  assert.ok(withMoney.money && typeof withMoney.money.mrr === "number");
  await assert.rejects(() => createManualInvoice(actorAs("PROJECT_MANAGER"), { label: "x", subtotal: 10 }), /permission/);
});
