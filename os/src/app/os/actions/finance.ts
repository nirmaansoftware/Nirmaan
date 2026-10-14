"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/web/session";
import { errorState, type ActionState } from "@/lib/web/actionState";
import { int, str } from "@/lib/web/form";
import { createManualInvoice, issueInvoice, recordPayment, voidInvoice } from "@/lib/finance/invoices";
import { addCostEntry } from "@/lib/finance/costs";
import { createSubscription, generateDueRecurringInvoices, setSubscriptionStatus } from "@/lib/finance/recurring";
import { updateSettings } from "@/lib/finance/settings";
import { setServiceType } from "@/lib/projects/service";

function refresh(form: FormData) {
  revalidatePath("/os/finance");
  const projectId = str(form, "projectId");
  if (projectId) revalidatePath(`/os/projects/${projectId}`);
}

function wrap(fn: (actor: Awaited<ReturnType<typeof requireActor>>, form: FormData) => Promise<string>) {
  return async (_: ActionState, form: FormData): Promise<ActionState> => {
    const actor = await requireActor();
    try {
      const ok = await fn(actor, form);
      refresh(form);
      return { ok };
    } catch (err) {
      return errorState(err);
    }
  };
}

function dateOr(form: FormData, key: string): Date | undefined {
  const v = str(form, key);
  if (!v) return undefined;
  const d = new Date(`${v}T12:00:00`);
  if (Number.isNaN(d.getTime())) throw new Error("That date isn't valid.");
  return d;
}

export const issueInvoiceAction = wrap(async (a, f) => `Issued ${(await issueInvoice(a, str(f, "invoiceId"))).code}.`);

export const voidInvoiceAction = wrap(async (a, f) => {
  await voidInvoice(a, str(f, "invoiceId"), str(f, "reason"));
  return "Voided.";
});

export const paymentAction = wrap(async (a, f) => {
  const r = await recordPayment(a, str(f, "invoiceId"), {
    amount: int(f, "amount", "Amount"),
    method: str(f, "method"),
    reference: str(f, "reference"),
    receivedAt: dateOr(f, "receivedAt"),
  });
  return r.fullyPaid ? `Recorded. ${r.code} is paid in full.` : `Recorded. ₹${r.remaining.toLocaleString("en-IN")} still due on ${r.code}.`;
});

export const manualInvoiceAction = wrap(async (a, f) => {
  const inv = await createManualInvoice(a, { projectId: str(f, "projectId") || undefined, label: str(f, "label"), subtotal: int(f, "subtotal", "Amount") });
  return `Created draft ${inv.code}.`;
});

export const costAction = wrap(async (a, f) => {
  const hoursRaw = str(f, "hours").trim();
  const hours = hoursRaw ? Number(hoursRaw) : undefined;
  if (hoursRaw && !Number.isFinite(hours)) throw new Error("Hours must be a number.");
  const e = await addCostEntry(a, str(f, "projectId"), {
    category: str(f, "category"),
    amount: int(f, "amount", "Amount"),
    hours,
    note: str(f, "note"),
    incurredOn: dateOr(f, "incurredOn"),
  });
  return `Recorded ₹${e.amount.toLocaleString("en-IN")}.`;
});

export const subscriptionAction = wrap(async (a, f) => {
  const s = await createSubscription(a, {
    clientId: str(f, "clientId"),
    projectId: str(f, "projectId") || undefined,
    name: str(f, "name"),
    monthly: int(f, "monthly", "Monthly price"),
    startDate: dateOr(f, "startDate") ?? new Date(),
  });
  return `Created ${s.code}.`;
});

export const subscriptionStatusAction = wrap(async (a, f) => {
  const s = await setSubscriptionStatus(a, str(f, "subscriptionId"), str(f, "status"));
  return `${s.code} is now ${s.status.toLowerCase()}.`;
});

export const generateRecurringAction = wrap(async (a) => {
  const r = await generateDueRecurringInvoices(a);
  return r.created ? `Created ${r.created} draft invoice(s) for ${r.plans} plan(s). Review and issue them below.` : "Nothing is due yet.";
});

export const settingsAction = wrap(async (a, f) => {
  const rate = Number(str(f, "usdToInr"));
  await updateSettings(a, {
    legalName: str(f, "legalName"),
    gstin: str(f, "gstin"),
    taxRatePercent: int(f, "taxRatePercent", "Tax rate"),
    usdToInr: rate,
    hourlyCost: int(f, "hourlyCost", "Hourly cost"),
    invoiceDueDays: int(f, "invoiceDueDays", "Payment terms"),
    paymentInstructions: str(f, "paymentInstructions"),
  });
  return "Settings saved. They apply to new invoices.";
});

export const serviceTypeAction = wrap(async (a, f) => {
  await setServiceType(a, str(f, "projectId"), str(f, "serviceType"));
  return "Saved.";
});
