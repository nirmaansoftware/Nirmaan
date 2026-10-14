import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, deleteSession, userForToken } from "../auth/sessionStore";
import { userActor, type Actor } from "../auth/actor";
import { isClientRole } from "../db/enums";

/**
 * Next.js side of sessions: the cookie. The cookie holds a random token;
 * the database holds only its hash (auth/sessionStore.ts).
 *
 * httpOnly (no JavaScript access), SameSite=Lax (not sent on cross-site
 * POSTs), Secure in production. Server Actions additionally get Next's own
 * Origin check against CSRF.
 */
export const SESSION_COOKIE = "nirmaan_session";

/** The signed-in user, or null. Memoised per request. */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return userForToken(token);
});

/**
 * For pages and actions under /os: a signed-in TEAM user, or a redirect.
 * Client accounts are sent to their portal; they never see /os.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (isClientRole(user.role)) redirect("/portal");
  return user;
}

/** For /portal: a signed-in CLIENT user attached to a client, or a redirect. */
export async function requireClientUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isClientRole(user.role) || !user.clientId) redirect("/os");
  return user;
}

export async function requireActor(): Promise<Actor> {
  return userActor(await requireUser());
}

export async function startSession(userId: string) {
  const { token, expiresAt } = await createSession(userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const store = await cookies();
  await deleteSession(store.get(SESSION_COOKIE)?.value);
  store.delete(SESSION_COOKIE);
}
