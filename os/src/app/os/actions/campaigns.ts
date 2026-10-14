"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/web/session";
import { errorState, type ActionState } from "@/lib/web/actionState";
import { str } from "@/lib/web/form";
import { assertCan } from "@/lib/auth/permissions";
import { linesToList } from "@/lib/proposals/model";
import { planCampaign, setCampaignStatus, updateCampaign } from "@/lib/prospecting/campaigns";
import { runTick } from "@/lib/prospecting/worker";

export async function planCampaignAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let id: string;
  try {
    id = (await planCampaign(actor, str(form, "goal"))).campaign.id;
  } catch (err) {
    return errorState(err);
  }
  redirect(`/os/campaigns/${id}`);
}

export async function updateCampaignAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const id = str(form, "campaignId");
  try {
    await updateCampaign(actor, id, {
      name: str(form, "name"),
      angle: str(form, "angle"),
      segment: str(form, "segment"),
      queries: linesToList(str(form, "queries"), 20),
      locations: linesToList(str(form, "locations"), 30),
      placesSearchesPerDay: str(form, "placesSearchesPerDay"),
      webSearchesPerDay: str(form, "webSearchesPerDay"),
      checksPerDay: str(form, "checksPerDay"),
      newContactsPerDay: str(form, "newContactsPerDay"),
      emailShare: str(form, "emailShare"),
      minFit: str(form, "minFit"),
      followUpDays: str(form, "followUpDays"),
    });
    revalidatePath(`/os/campaigns/${id}`);
    return { ok: "Saved." };
  } catch (err) {
    return errorState(err);
  }
}

export async function setCampaignStatusAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const id = str(form, "campaignId");
  try {
    const c = await setCampaignStatus(actor, id, str(form, "status"));
    revalidatePath(`/os/campaigns/${id}`);
    revalidatePath("/os/campaigns");
    return { ok: c.status === "ACTIVE" ? "Running. The worker picks it up on its next tick." : `Campaign ${c.status.toLowerCase()}.` };
  } catch (err) {
    return errorState(err);
  }
}

/** One tick of the worker, from the browser (the same work `npm run campaigns:worker` does each minute). */
export async function runTickAction(): Promise<ActionState> {
  const actor = await requireActor();
  try {
    assertCan(actor.role, "prospect:run");
    const r = await runTick();
    revalidatePath("/os/campaigns");
    if (!r.ran) return { ok: "The worker is already in the middle of a tick; try again in a minute." };
    const did = r.campaigns.map((c) => `${c.code}: ${c.searched} search, ${c.checked} checked, ${c.firstDrafts + c.followUps} drafted`).join(" · ");
    return r.errors.length ? { error: `${did} · Problems: ${r.errors.join(" · ")}` } : { ok: `${r.sent ? "Sent 1 email. " : r.sendNote ? `${r.sendNote} ` : ""}${did || "No active campaigns."}` };
  } catch (err) {
    return errorState(err);
  }
}
