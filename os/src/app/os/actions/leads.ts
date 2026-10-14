"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/web/session";
import { errorState, type ActionState } from "@/lib/web/actionState";
import { str } from "@/lib/web/form";
import { assertCan } from "@/lib/auth/permissions";
import { createLead, validateIntake } from "@/lib/leads/intake";
import { addLeadNote, setLeadStatus } from "@/lib/leads/service";
import { runDiscovery } from "@/lib/discovery/runDiscovery";
import { addTeamItem, createRequirement, decideItem, promoteToRequirement } from "@/lib/discovery/items";
import { linesToList } from "@/lib/proposals/model";
import { createDraftFromLead } from "@/lib/proposals/service";

export async function createLeadAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let id: string;
  try {
    assertCan(actor.role, "lead:write");
    const input = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
    const result = validateIntake(input);
    if (!result.ok) return { error: Object.values(result.errors).join(" ") };
    const source = str(form, "source") === "REFERRAL" ? "REFERRAL" : "MANUAL";
    id = (await createLead(actor, result.data, source)).id;
  } catch (err) {
    return errorState(err);
  }
  redirect(`/os/leads/${id}`);
}

export async function setLeadStatusAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const leadId = str(form, "leadId");
  try {
    const lead = await setLeadStatus(actor, leadId, str(form, "status"), str(form, "reason"));
    revalidatePath(`/os/leads/${leadId}`);
    return { ok: `Moved to ${lead.status.toLowerCase()}.` };
  } catch (err) {
    return errorState(err);
  }
}

export async function addNoteAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const leadId = str(form, "leadId");
  try {
    await addLeadNote(actor, leadId, str(form, "body"));
    revalidatePath(`/os/leads/${leadId}`);
    return { ok: "Note added." };
  } catch (err) {
    return errorState(err);
  }
}

export async function runDiscoveryAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const leadId = str(form, "leadId");
  try {
    const r = await runDiscovery(actor, leadId);
    revalidatePath(`/os/leads/${leadId}`);
    return { ok: `Business Analyst added ${r.created} items for review${r.intakeFacts ? `, plus ${r.intakeFacts} facts from the intake form` : ""}.` };
  } catch (err) {
    return errorState(err);
  }
}

export async function addItemAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const leadId = str(form, "leadId");
  try {
    await addTeamItem(actor, leadId, str(form, "kind"), str(form, "text"));
    revalidatePath(`/os/leads/${leadId}`);
    return { ok: "Added." };
  } catch (err) {
    return errorState(err);
  }
}

export async function decideItemAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const decision = str(form, "decision");
  try {
    if (decision !== "CONFIRM" && decision !== "REJECT" && decision !== "ANSWER") throw new Error("Unknown decision.");
    await decideItem(actor, str(form, "itemId"), decision, str(form, "answer"));
    revalidatePath(`/os/leads/${str(form, "leadId")}`);
    return { ok: "Saved." };
  } catch (err) {
    return errorState(err);
  }
}

function requirementInput(form: FormData) {
  return {
    kind: str(form, "kind"),
    statement: str(form, "statement"),
    priority: str(form, "priority"),
    acceptanceCriteria: linesToList(str(form, "criteria"), 20),
  };
}

export async function promoteAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const req = await promoteToRequirement(actor, str(form, "itemId"), requirementInput(form));
    revalidatePath(`/os/leads/${str(form, "leadId")}`);
    return { ok: `Created ${req.code}.` };
  } catch (err) {
    return errorState(err);
  }
}

export async function createRequirementAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const leadId = str(form, "leadId");
  try {
    const req = await createRequirement(actor, leadId, requirementInput(form));
    revalidatePath(`/os/leads/${leadId}`);
    return { ok: `Created ${req.code}.` };
  } catch (err) {
    return errorState(err);
  }
}

export async function createProposalAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let id: string;
  try {
    id = (await createDraftFromLead(actor, str(form, "leadId"))).id;
  } catch (err) {
    return errorState(err);
  }
  redirect(`/os/proposals/${id}`);
}
