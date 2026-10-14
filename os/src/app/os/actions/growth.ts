"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/web/session";
import { errorState, type ActionState } from "@/lib/web/actionState";
import { bool, str } from "@/lib/web/form";
import { assertCan } from "@/lib/auth/permissions";
import { linesToList } from "@/lib/proposals/model";
import { reviewAutopilot, updateAutopilot } from "@/lib/prospecting/autopilot";

export async function updateAutopilotAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const a = await updateAutopilot(actor, {
      on: bool(form, "on"),
      newContactsPerDay: Number(str(form, "newContactsPerDay")),
      emailShare: Number(str(form, "emailShare")),
      cities: linesToList(str(form, "cities"), 30),
    });
    revalidatePath("/os/growth");
    return { ok: a.on ? `Autopilot is on: about ${a.newContactsPerDay} new businesses a day across ${JSON.parse(a.cities).length} cities.` : "Autopilot is off. Nothing new is searched or drafted." };
  } catch (err) {
    return errorState(err);
  }
}

export async function reviewNowAction(): Promise<ActionState> {
  const actor = await requireActor();
  try {
    assertCan(actor.role, "growth:read");
    const r = await reviewAutopilot(new Date(), true);
    revalidatePath("/os/growth");
    return r ? { ok: r.summary } : { error: "Autopilot is off." };
  } catch (err) {
    return errorState(err);
  }
}
