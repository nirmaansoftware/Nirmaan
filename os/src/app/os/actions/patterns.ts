"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/web/session";
import { errorState, type ActionState } from "@/lib/web/actionState";
import { str } from "@/lib/web/form";
import { recordDecision, type Decision } from "@/lib/productization/signals";

export async function recordDecisionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const a = await recordDecision(actor, str(form, "serviceType"), str(form, "decision") as Decision, str(form, "note"));
    revalidatePath("/os/patterns");
    revalidatePath("/os/knowledge");
    return { ok: `Recorded in the knowledge base: ${a.title}.` };
  } catch (err) {
    return errorState(err);
  }
}
