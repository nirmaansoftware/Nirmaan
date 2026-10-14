"use server";

import { revalidatePath } from "next/cache";
import { requireClientUser } from "@/lib/web/session";
import { errorState, type ActionState } from "@/lib/web/actionState";
import { str } from "@/lib/web/form";
import { clientRequestChange, openSupportRequest } from "@/lib/portal/service";

export async function openSupportAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireClientUser();
  try {
    const sr = await openSupportRequest(user, {
      projectId: str(form, "projectId") || undefined,
      subject: str(form, "subject"),
      body: str(form, "body"),
      priority: str(form, "priority"),
    });
    revalidatePath("/portal");
    return { ok: `Thanks, we've logged ${sr.code} and will reply here.` };
  } catch (err) {
    return errorState(err);
  }
}

export async function requestChangeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireClientUser();
  try {
    const cr = await clientRequestChange(user, str(form, "projectId"), str(form, "description"));
    revalidatePath("/portal");
    return { ok: `Logged as ${cr.code}. We'll tell you whether it's in scope and, if not, what it costs before any work starts.` };
  } catch (err) {
    return errorState(err);
  }
}
