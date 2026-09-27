"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/web/session";
import { errorState, type ActionState } from "@/lib/web/actionState";
import { str } from "@/lib/web/form";
import { createUser, setUserActive, setUserRole } from "@/lib/team/service";
import { approveRequest, dismissRequest } from "@/lib/team/accessRequests";

export async function createUserAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const u = await createUser(actor, {
      email: str(form, "email"),
      name: str(form, "name"),
      role: str(form, "role"),
      password: str(form, "password"),
      clientId: str(form, "clientId") || undefined,
    });
    revalidatePath("/os/team");
    return {
      ok: str(form, "password")
        ? `Created an account for ${u.email}. Share the password with them over a separate channel.`
        : `Created an account for ${u.email}. They sign in with “Sign in with Google” using that address.`,
    };
  } catch (err) {
    return errorState(err);
  }
}

export async function setActiveAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await setUserActive(actor, str(form, "userId"), str(form, "active") === "true");
    revalidatePath("/os/team");
    return { ok: "Updated." };
  } catch (err) {
    return errorState(err);
  }
}

export async function setRoleAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await setUserRole(actor, str(form, "userId"), str(form, "role"));
    revalidatePath("/os/team");
    return { ok: "Role changed. It applies from their next sign-in." };
  } catch (err) {
    return errorState(err);
  }
}

export async function approveRequestAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const u = await approveRequest(actor, str(form, "requestId"), { role: str(form, "role"), name: str(form, "name") });
    revalidatePath("/os/team");
    return { ok: `${u.email} can now sign in with Google. They've been emailed.` };
  } catch (err) {
    return errorState(err);
  }
}

export async function dismissRequestAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await dismissRequest(actor, str(form, "requestId"));
    revalidatePath("/os/team");
    return { ok: "Dismissed. They'll be told the request was declined if they try again." };
  } catch (err) {
    return errorState(err);
  }
}
