import { prisma } from "../db/client";
import { nextCode } from "../ids";
import { audit } from "../audit";
import type { Actor } from "../auth/actor";
import type { LeadSource } from "../db/enums";

/**
 * Problem-first intake. The only required fields are the problem in the
 * customer's own words and a way to reply; everything else is progressive
 * context the customer may or may not have.
 *
 * Validation is written out by hand (no schema library) because the shape is
 * small and flat. Every text field is trimmed, length-capped and stripped of
 * control characters. Nothing here trusts the browser.
 */
export const INTAKE_LIMITS = {
  problem: { min: 20, max: 4000 },
  short: 200,
  medium: 1000,
  name: 120,
  email: 254,
  phone: 40,
} as const;

const OPTIONAL_FIELDS = {
  business: INTAKE_LIMITS.medium,
  currentSolution: INTAKE_LIMITS.medium,
  affected: INTAKE_LIMITS.medium,
  frequency: INTAKE_LIMITS.short,
  scale: INTAKE_LIMITS.short,
  existingSystems: INTAKE_LIMITS.medium,
  desiredOutcome: INTAKE_LIMITS.medium,
  budgetRange: INTAKE_LIMITS.short,
  timeline: INTAKE_LIMITS.short,
  urgency: INTAKE_LIMITS.short,
  interest: INTAKE_LIMITS.short,
  company: INTAKE_LIMITS.short,
  contactPhone: INTAKE_LIMITS.phone,
} as const;
type OptionalField = keyof typeof OPTIONAL_FIELDS;

export interface IntakeData {
  problem: string;
  contactName: string;
  contactEmail: string;
  business?: string;
  currentSolution?: string;
  affected?: string;
  frequency?: string;
  scale?: string;
  existingSystems?: string;
  desiredOutcome?: string;
  budgetRange?: string;
  timeline?: string;
  urgency?: string;
  /** The package, care plan or service the visitor was looking at on the website. */
  interest?: string;
  company?: string;
  contactPhone?: string;
}

export type IntakeResult =
  | { ok: true; data: IntakeData }
  | { ok: false; errors: Partial<Record<keyof IntakeData | "form", string>> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_CHARS, "").trim();
}

/** Accepts a plain object (JSON body) or FormData-like record. */
export function validateIntake(input: Record<string, unknown>): IntakeResult {
  const errors: Partial<Record<keyof IntakeData | "form", string>> = {};

  // Honeypot: real visitors never see this field; bots fill it.
  if (clean(input._gotcha)) return { ok: false, errors: { form: "spam" } };

  const problem = clean(input.problem);
  if (problem.length < INTAKE_LIMITS.problem.min) {
    errors.problem = `Tell us a little more about the problem (at least ${INTAKE_LIMITS.problem.min} characters).`;
  } else if (problem.length > INTAKE_LIMITS.problem.max) {
    errors.problem = `Please keep this under ${INTAKE_LIMITS.problem.max} characters. You can share more later.`;
  }

  const contactName = clean(input.contactName ?? input.name);
  if (!contactName) errors.contactName = "Please tell us your name.";
  else if (contactName.length > INTAKE_LIMITS.name) errors.contactName = "That name is too long.";

  const contactEmail = clean(input.contactEmail ?? input.email).toLowerCase();
  if (!contactEmail) errors.contactEmail = "We need an email to reply to you.";
  else if (contactEmail.length > INTAKE_LIMITS.email || !EMAIL_RE.test(contactEmail)) {
    errors.contactEmail = "That email address doesn't look right.";
  }

  const data: IntakeData = { problem, contactName, contactEmail };
  for (const [field, max] of Object.entries(OPTIONAL_FIELDS) as [OptionalField, number][]) {
    const value = clean(input[field]);
    if (!value) continue;
    if (value.length > max) {
      errors[field] = `Please keep this under ${max} characters.`;
      continue;
    }
    data[field] = value;
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}

export async function createLead(actor: Actor, data: IntakeData, source: LeadSource) {
  const lead = await prisma.$transaction(async (tx) => {
    const code = await nextCode("LEAD", tx);
    return tx.lead.create({ data: { ...data, code, source } });
  });
  await audit(actor, "lead.created", "Lead", lead.id, `${lead.code} via ${source}`);
  return lead;
}
