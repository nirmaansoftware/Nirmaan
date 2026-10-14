import { prisma } from "../db/client";
import { audit } from "../audit";
import { assertCan } from "../auth/permissions";
import type { Actor } from "../auth/actor";

/** The single company settings row, created with safe defaults on first read. */
export async function getSettings() {
  return prisma.companySettings.upsert({ where: { id: "company" }, create: { id: "company" }, update: {} });
}

export interface SettingsInput {
  legalName: string;
  gstin: string;
  taxRatePercent: number;
  usdToInr: number;
  hourlyCost: number;
  invoiceDueDays: number;
  paymentInstructions: string;
}

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export async function updateSettings(actor: Actor, input: SettingsInput) {
  assertCan(actor.role, "finance:write");
  const legalName = input.legalName.trim();
  const gstin = input.gstin.trim().toUpperCase();
  if (!legalName) throw new Error("Enter the legal name that goes on invoices.");
  if (gstin && !GSTIN.test(gstin)) throw new Error("That GSTIN doesn't look valid (15 characters, e.g. 27ABCDE1234F1Z5).");
  if (!Number.isInteger(input.taxRatePercent) || input.taxRatePercent < 0 || input.taxRatePercent > 28) throw new Error("Tax rate must be a whole percentage between 0 and 28.");
  if (input.taxRatePercent > 0 && !gstin) throw new Error("Charging GST needs a GSTIN on the invoice.");
  if (!(input.usdToInr > 0 && input.usdToInr < 1000)) throw new Error("Enter a sensible USD→INR rate.");
  if (!Number.isInteger(input.hourlyCost) || input.hourlyCost < 0) throw new Error("Hourly cost must be a whole number of rupees.");
  if (!Number.isInteger(input.invoiceDueDays) || input.invoiceDueDays < 0 || input.invoiceDueDays > 90) throw new Error("Payment terms must be 0–90 days.");

  const saved = await prisma.companySettings.upsert({
    where: { id: "company" },
    create: { id: "company", legalName, gstin: gstin || null, taxRatePercent: input.taxRatePercent, usdToInr: input.usdToInr, hourlyCost: input.hourlyCost, invoiceDueDays: input.invoiceDueDays, paymentInstructions: input.paymentInstructions.trim() || null },
    update: { legalName, gstin: gstin || null, taxRatePercent: input.taxRatePercent, usdToInr: input.usdToInr, hourlyCost: input.hourlyCost, invoiceDueDays: input.invoiceDueDays, paymentInstructions: input.paymentInstructions.trim() || null },
  });
  await audit(actor, "finance.settings_updated", "CompanySettings", "company");
  return saved;
}
