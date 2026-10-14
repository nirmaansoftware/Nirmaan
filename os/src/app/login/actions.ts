"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate } from "@/lib/auth/sessionStore";
import { startSession, endSession, getCurrentUser } from "@/lib/web/session";
import { createRateLimiter } from "@/lib/http/rateLimit";
import { audit } from "@/lib/audit";
import { userActor } from "@/lib/auth/actor";
import type { ActionState } from "@/lib/web/actionState";
import { str } from "@/lib/web/form";
import { isClientRole } from "@/lib/db/enums";
import { passwordLoginEnabled } from "@/lib/auth/password";

// 10 attempts per 15 minutes per IP+email: plenty for a person, useless for guessing.
const allow = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });

/** Only same-app paths under the user's own area, never an absolute or protocol-relative URL. */
function safeNext(value: string, home: "/os" | "/portal"): string {
  const pattern = home === "/os" ? /^\/os(\/[\w\-/]*)?$/ : /^\/portal(\/[\w\-/]*)?$/;
  return pattern.test(value) ? value : home;
}

export async function login(_: ActionState, form: FormData): Promise<ActionState> {
  if (!passwordLoginEnabled()) return { error: "Password sign-in is turned off. Use “Sign in with Google”." };
  const email = str(form, "email").trim().toLowerCase();
  const password = str(form, "password");
  if (!email || !password) return { error: "Enter your email and password." };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const gate = allow(`${ip}|${email}`);
  if (!gate.ok) return { error: `Too many attempts. Try again in ${Math.ceil(gate.retryAfterSec / 60)} minutes.` };

  const user = await authenticate(email, password);
  if (!user) return { error: "That email and password don't match an active account." };

  await startSession(user.id);
  await audit(userActor(user), "auth.login", "User", user.id);
  redirect(safeNext(str(form, "next"), isClientRole(user.role) ? "/portal" : "/os"));
}

export async function logout() {
  const user = await getCurrentUser();
  await endSession();
  if (user) await audit(userActor(user), "auth.logout", "User", user.id);
  redirect("/login");
}
