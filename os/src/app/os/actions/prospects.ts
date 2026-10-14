"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/web/session";
import { errorState, type ActionState } from "@/lib/web/actionState";
import { str } from "@/lib/web/form";
import { addSuppression, convertToLead, doNotContact, removeSuppression, runProspectSearch, setProspectStatus, updateProspectContact, type SearchSource } from "@/lib/prospecting/service";
import { auditNext, auditProspect } from "@/lib/prospecting/audit";
import { approveEmail, cancelDraft, draftFollowUp, draftOutreach, markSentManually, sendEmail, updateDraft } from "@/lib/prospecting/outreach";
import { prisma } from "@/lib/db/client";

const LIST = "/os/prospects";
const one = (id: string) => `/os/prospects/${id}`;

export async function runSearchAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let id: string;
  try {
    const sources = form.getAll("sources").filter((v): v is SearchSource => v === "PLACES" || v === "WEB");
    const search = await runProspectSearch(actor, { query: str(form, "query"), location: str(form, "location"), segment: str(form, "segment"), sources });
    id = search.id;
  } catch (err) {
    return errorState(err);
  }
  redirect(`${LIST}?search=${id}`);
}

export async function auditNextAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const r = await auditNext(actor, { searchId: str(form, "searchId") || undefined, limit: 3 });
    revalidatePath(LIST);
    if (!r.done && !r.failed.length) return { ok: "Nothing left to check here." };
    const summary = `Checked ${r.done}.${r.remaining ? ` ${r.remaining} still to check.` : ""}`;
    return r.failed.length ? { error: `${summary} Couldn't check: ${r.failed.join(" · ")}` } : { ok: summary };
  } catch (err) {
    return errorState(err);
  }
}

export async function auditProspectAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const id = str(form, "prospectId");
  try {
    const p = await auditProspect(actor, id);
    revalidatePath(one(id));
    return { ok: `Fit ${p.fitScore}/100.` };
  } catch (err) {
    return errorState(err);
  }
}

export async function updateContactAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const id = str(form, "prospectId");
  try {
    await updateProspectContact(actor, id, { email: str(form, "email"), phone: str(form, "phone"), website: str(form, "website") });
    revalidatePath(one(id));
    return { ok: "Saved." };
  } catch (err) {
    return errorState(err);
  }
}

export async function draftAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const id = str(form, "prospectId");
  try {
    await draftOutreach(actor, id, str(form, "channel"));
    revalidatePath(one(id));
    return { ok: "Draft ready below. Read it, edit anything, then approve." };
  } catch (err) {
    return errorState(err);
  }
}

export async function updateDraftAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await updateDraft(actor, str(form, "messageId"), { subject: str(form, "subject"), body: str(form, "body"), toAddress: str(form, "toAddress") });
    revalidatePath(one(str(form, "prospectId")));
    revalidatePath(QUEUE);
    return { ok: "Draft saved." };
  } catch (err) {
    return errorState(err);
  }
}

export async function sendEmailAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await sendEmail(actor, str(form, "messageId"));
    revalidatePath(one(str(form, "prospectId")));
    revalidatePath(QUEUE);
    return { ok: "Sent." };
  } catch (err) {
    return errorState(err);
  }
}

const QUEUE = "/os/outreach";

export async function approveEmailAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await approveEmail(actor, str(form, "messageId"));
    revalidatePath(one(str(form, "prospectId")));
    revalidatePath(QUEUE);
    return { ok: "Approved. It goes out at the next paced slot in sending hours." };
  } catch (err) {
    return errorState(err);
  }
}

/** Approves every email draft listed on the queue page (ids posted with the form), skipping any that no longer qualify. */
export async function approveAllAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const ids = form.getAll("messageId").filter((v): v is string => typeof v === "string").slice(0, 500);
  let ok = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    try {
      await approveEmail(actor, id);
      ok++;
    } catch (err) {
      const code = (await prisma.outreachMessage.findUnique({ where: { id }, include: { prospect: { select: { code: true } } } }))?.prospect.code ?? id;
      skipped.push(`${code}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  revalidatePath(QUEUE);
  return skipped.length ? { error: `Approved ${ok}. Skipped ${skipped.length}: ${skipped.slice(0, 5).join(" · ")}` } : { ok: `Approved ${ok}. They go out one at a time, spaced through sending hours.` };
}

export async function draftFollowUpAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const id = str(form, "prospectId");
  try {
    await draftFollowUp(actor, id, str(form, "channel"));
    revalidatePath(one(id));
    return { ok: "Follow-up drafted below." };
  } catch (err) {
    return errorState(err);
  }
}

export async function markSentAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await markSentManually(actor, str(form, "messageId"));
    revalidatePath(one(str(form, "prospectId")));
    revalidatePath(QUEUE);
    return { ok: "Marked as sent." };
  } catch (err) {
    return errorState(err);
  }
}

export async function cancelDraftAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await cancelDraft(actor, str(form, "messageId"));
    revalidatePath(one(str(form, "prospectId")));
    revalidatePath(QUEUE);
    return { ok: "Draft discarded." };
  } catch (err) {
    return errorState(err);
  }
}

export async function setProspectStatusAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const id = str(form, "prospectId");
  try {
    await setProspectStatus(actor, id, str(form, "status"), str(form, "reason"));
    revalidatePath(one(id));
    return { ok: "Updated." };
  } catch (err) {
    return errorState(err);
  }
}

export async function doNotContactAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const id = str(form, "prospectId");
  try {
    await doNotContact(actor, id, str(form, "reason"));
    revalidatePath(one(id));
    return { ok: "On the do-not-contact list. Nothing more will go to them." };
  } catch (err) {
    return errorState(err);
  }
}

export async function convertAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let leadId: string;
  try {
    const lead = await convertToLead(actor, str(form, "prospectId"), {
      problem: str(form, "problem"),
      contactName: str(form, "contactName"),
      contactEmail: str(form, "contactEmail"),
      contactPhone: str(form, "contactPhone"),
    });
    leadId = lead.id;
  } catch (err) {
    return errorState(err);
  }
  redirect(`/os/leads/${leadId}`);
}

export async function addSuppressionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const value = await addSuppression(actor, str(form, "value"), str(form, "reason"));
    revalidatePath(`${LIST}/do-not-contact`);
    return { ok: `${value} will never be contacted.` };
  } catch (err) {
    return errorState(err);
  }
}

export async function removeSuppressionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await removeSuppression(actor, str(form, "value"));
    revalidatePath(`${LIST}/do-not-contact`);
    return { ok: "Removed." };
  } catch (err) {
    return errorState(err);
  }
}
