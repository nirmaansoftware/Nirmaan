import type { Prisma, Proposal } from "@prisma/client";
import { prisma } from "../db/client";
import { nextCode } from "../ids";
import { audit } from "../audit";
import { logEvent } from "../db/logEvent";
import { assertCan } from "../auth/permissions";
import type { Actor } from "../auth/actor";
import { PAYMENT_METHODS, isOneOf, type InvoiceKind } from "../db/enums";
import { scheduleAmounts, viewOf } from "../proposals/model";
import { getSettings } from "./settings";

const DAY = 24 * 60 * 60 * 1000;
type Db = Prisma.TransactionClient | typeof prisma;

export function withTax(subtotal: number, ratePercent: number) {
  const tax = Math.round((subtotal * ratePercent) / 100);
  return { subtotal, taxRatePercent: ratePercent, tax, total: subtotal + tax };
}

export function isOverdue(inv: { status: string; dueDate: Date | null }, now = new Date()): boolean {
  return inv.status === "ISSUED" && !!inv.dueDate && inv.dueDate < now;
}

async function createInvoice(
  db: Db,
  data: { projectId?: string | null; clientId?: string | null; kind: InvoiceKind; label: string; subtotal: number; taxRatePercent: number; changeRequestId?: string; subscriptionId?: string; periodStart?: Date }
) {
  const code = await nextCode("INV", db);
  return db.invoice.create({
    data: {
      code,
      projectId: data.projectId ?? null,
      clientId: data.clientId ?? null,
      kind: data.kind,
      label: data.label,
      ...withTax(data.subtotal, data.taxRatePercent),
      changeRequestId: data.changeRequestId,
      subscriptionId: data.subscriptionId,
      periodStart: data.periodStart,
    },
  });
}

/**
 * When a client approves a proposal: one DRAFT invoice per payment step, with
 * amounts that sum exactly to the price. Runs inside the approval
 * transaction, so a project never exists without its billing schedule.
 */
export async function createScheduleInvoices(tx: Prisma.TransactionClient, projectId: string, clientId: string, proposal: Proposal) {
  const settings = await tx.companySettings.upsert({ where: { id: "company" }, create: { id: "company" }, update: {} });
  const steps = scheduleAmounts(proposal.priceTotal, viewOf(proposal).paymentSchedule);
  const created = [];
  for (const s of steps) {
    created.push(
      await createInvoice(tx, {
        projectId,
        clientId,
        kind: "MILESTONE",
        label: `${proposal.code}: ${s.label} (${s.percent}%)`,
        subtotal: s.amount,
        taxRatePercent: settings.taxRatePercent,
      })
    );
  }
  return created;
}

/** An approved, priced change request gets its own DRAFT invoice. */
export async function createChangeInvoice(tx: Prisma.TransactionClient, cr: { id: string; code: string; projectId: string; costDelta: number; description: string }) {
  if (cr.costDelta <= 0) return null;
  const project = await tx.project.findUniqueOrThrow({ where: { id: cr.projectId } });
  const settings = await tx.companySettings.upsert({ where: { id: "company" }, create: { id: "company" }, update: {} });
  return createInvoice(tx, {
    projectId: cr.projectId,
    clientId: project.clientId,
    kind: "CHANGE",
    label: `${cr.code}: ${cr.description.slice(0, 80)}`,
    subtotal: cr.costDelta,
    taxRatePercent: settings.taxRatePercent,
    changeRequestId: cr.id,
  });
}

export async function createManualInvoice(actor: Actor, input: { projectId?: string; clientId?: string; label: string; subtotal: number }) {
  assertCan(actor.role, "finance:write");
  if (!input.label.trim()) throw new Error("Describe what the invoice is for.");
  if (!Number.isInteger(input.subtotal) || input.subtotal <= 0) throw new Error("Amount must be a whole number of rupees above 0.");
  let clientId = input.clientId ?? null;
  if (input.projectId) clientId = (await prisma.project.findUniqueOrThrow({ where: { id: input.projectId } })).clientId;
  const settings = await getSettings();
  const inv = await createInvoice(prisma, { projectId: input.projectId, clientId, kind: "OTHER", label: input.label.trim(), subtotal: input.subtotal, taxRatePercent: settings.taxRatePercent });
  await audit(actor, "invoice.created", "Invoice", inv.id, inv.code);
  return inv;
}

/** DRAFT → ISSUED: the invoice is sent and the payment clock starts. */
export async function issueInvoice(actor: Actor, invoiceId: string, now = new Date()) {
  assertCan(actor.role, "finance:write");
  const settings = await getSettings();
  const { count } = await prisma.invoice.updateMany({
    where: { id: invoiceId, status: "DRAFT" },
    data: { status: "ISSUED", issuedAt: now, dueDate: new Date(now.getTime() + settings.invoiceDueDays * DAY) },
  });
  if (count !== 1) throw new Error("Only a draft invoice can be issued.");
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (inv.projectId) await logEvent(inv.projectId, null, null, `${actor.label} issued ${inv.code} (${inv.label}).`);
  await audit(actor, "invoice.issued", "Invoice", invoiceId, inv.code);
  return inv;
}

/** Voiding keeps the record (and its number) but removes it from every total. Paid invoices can't be voided. */
export async function voidInvoice(actor: Actor, invoiceId: string, reason: string) {
  assertCan(actor.role, "finance:write");
  if (!reason.trim()) throw new Error("Say why the invoice is being voided.");
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { payments: true } });
  if (inv.status === "PAID" || inv.payments.length) throw new Error("An invoice with payments can't be voided. Issue a credit instead.");
  if (inv.status === "VOID") throw new Error("Already void.");
  await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "VOID" } });
  await audit(actor, "invoice.voided", "Invoice", invoiceId, `${inv.code}: ${reason.trim()}`);
}

export async function recordPayment(
  actor: Actor,
  invoiceId: string,
  input: { amount: number; method: string; reference?: string; receivedAt?: Date }
) {
  assertCan(actor.role, "finance:write");
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("Payment must be a whole number of rupees above 0.");
  if (!isOneOf(PAYMENT_METHODS, input.method)) throw new Error("Choose how it was paid.");
  const receivedAt = input.receivedAt ?? new Date();
  if (receivedAt.getTime() > Date.now() + DAY) throw new Error("A payment can't be dated in the future.");

  const result = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { payments: true } });
    if (inv.status !== "ISSUED") throw new Error(inv.status === "PAID" ? "This invoice is already paid." : "Issue the invoice before recording a payment.");
    const paidSoFar = inv.payments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = inv.total - paidSoFar;
    if (input.amount > remaining) throw new Error(`That's more than the ₹${remaining.toLocaleString("en-IN")} still due.`);
    const payment = await tx.payment.create({
      data: { invoiceId, amount: input.amount, method: input.method, reference: input.reference?.trim() || null, receivedAt, recordedBy: actor.label },
    });
    const fullyPaid = input.amount === remaining;
    if (fullyPaid) await tx.invoice.update({ where: { id: invoiceId }, data: { status: "PAID", paidAt: receivedAt } });
    return { payment, fullyPaid, remaining: remaining - input.amount, code: inv.code };
  });
  // Written after the commit: on SQLite a second connection writing inside the
  // transaction would wait on the transaction's own lock.
  await audit(actor, "payment.recorded", "Invoice", invoiceId, `${result.code}: ₹${input.amount} ${input.method}${result.fullyPaid ? " (paid in full)" : ""}`);
  return result;
}
