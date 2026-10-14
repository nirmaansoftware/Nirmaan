import { prisma } from "../db/client";
import { nextCode } from "../ids";
import { audit } from "../audit";
import { assertCan } from "../auth/permissions";
import type { Actor } from "../auth/actor";
import { SUBSCRIPTION_STATUSES, isOneOf } from "../db/enums";
import { withTax } from "./invoices";
import { getSettings } from "./settings";

/** Same day next month, clamped to the month's length (31 Jan → 28/29 Feb). */
export function addMonths(d: Date, n = 1): Date {
  const day = d.getUTCDate();
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, d.getUTCHours(), d.getUTCMinutes()));
  const lastDay = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, lastDay));
  return out;
}

export async function createSubscription(
  actor: Actor,
  input: { clientId: string; projectId?: string; name: string; monthly: number; startDate: Date }
) {
  assertCan(actor.role, "finance:write");
  const name = input.name.trim();
  if (!name) throw new Error("Name the plan (e.g. Care plan: Growth).");
  if (!Number.isInteger(input.monthly) || input.monthly <= 0) throw new Error("Monthly price must be a whole number of rupees above 0.");
  const sub = await prisma.$transaction(async (tx) => {
    const code = await nextCode("SUB", tx);
    return tx.subscription.create({
      data: { code, clientId: input.clientId, projectId: input.projectId || null, name, monthly: input.monthly, startDate: input.startDate, nextInvoiceDate: input.startDate },
    });
  });
  await audit(actor, "subscription.created", "Subscription", sub.id, `${sub.code} ${name} ₹${input.monthly}/month`);
  return sub;
}

export async function setSubscriptionStatus(actor: Actor, id: string, status: string) {
  assertCan(actor.role, "finance:write");
  if (!isOneOf(SUBSCRIPTION_STATUSES, status)) throw new Error("Unknown status.");
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id } });
  if (sub.status === "CANCELLED") throw new Error("A cancelled plan can't be restarted; create a new one.");
  const updated = await prisma.subscription.update({ where: { id }, data: { status, cancelledAt: status === "CANCELLED" ? new Date() : null } });
  await audit(actor, `subscription.${status.toLowerCase()}`, "Subscription", id, sub.code);
  return updated;
}

/**
 * Creates DRAFT invoices for every active plan whose billing date has
 * arrived, one per month owed (capped at 12 per run), then moves the plan's
 * next billing date forward. Safe to run any number of times: a month can
 * only be billed once (unique subscription + period).
 */
export async function generateDueRecurringInvoices(actor: Actor, now = new Date()) {
  assertCan(actor.role, "finance:write");
  const settings = await getSettings();
  const due = await prisma.subscription.findMany({ where: { status: "ACTIVE", nextInvoiceDate: { lte: now } } });
  let created = 0;
  for (const sub of due) {
    let createdForSub = 0;
    let period = sub.nextInvoiceDate;
    for (let i = 0; i < 12 && period <= now; i++) {
      const next = addMonths(period);
      const periodStart = period;
      await prisma.$transaction(async (tx) => {
        const exists = await tx.invoice.findUnique({ where: { subscriptionId_periodStart: { subscriptionId: sub.id, periodStart } } });
        if (!exists) {
          const code = await nextCode("INV", tx);
          await tx.invoice.create({
            data: {
              code,
              clientId: sub.clientId,
              projectId: sub.projectId,
              kind: "RECURRING",
              label: `${sub.name}: ${periodStart.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}`,
              ...withTax(sub.monthly, settings.taxRatePercent),
              subscriptionId: sub.id,
              periodStart,
            },
          });
          created++;
          createdForSub++;
        }
        await tx.subscription.update({ where: { id: sub.id }, data: { nextInvoiceDate: next } });
      });
      period = next;
    }
    if (createdForSub) await audit(actor, "subscription.invoiced", "Subscription", sub.id, `${sub.code}: ${createdForSub} draft invoice(s)`);
  }
  return { created, plans: due.length };
}
