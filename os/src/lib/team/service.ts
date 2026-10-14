import { prisma } from "../db/client";
import { audit } from "../audit";
import { assertCan } from "../auth/permissions";
import type { Actor } from "../auth/actor";
import { hashPassword, NO_PASSWORD, passwordProblem } from "../auth/password";
import { CLIENT_ROLES, INTERNAL_ROLES, isOneOf } from "../db/enums";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Creates an account. Used by the Team screen and by scripts/create-user.ts
 * (as SYSTEM, for the first founder). With no password it's a Google-only
 * account: it can sign in only with "Sign in with Google" as this email.
 */
export async function createUser(actor: Actor | null, input: { email: string; name: string; role: string; password?: string; clientId?: string }) {
  if (actor) assertCan(actor.role, "user:manage");
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email.");
  if (!name) throw new Error("Enter a name.");
  const clientRole = isOneOf(CLIENT_ROLES, input.role);
  if (!isOneOf(INTERNAL_ROLES, input.role) && !clientRole) throw new Error("Choose a role.");
  if (clientRole && !input.clientId) throw new Error("A client account must belong to a client.");
  if (!clientRole && input.clientId) throw new Error("Team accounts can't belong to a client.");
  if (clientRole && !(await prisma.client.findUnique({ where: { id: input.clientId! } }))) throw new Error("That client doesn't exist.");
  const password = input.password ?? "";
  const problem = password ? passwordProblem(password) : null;
  if (problem) throw new Error(problem);
  if (await prisma.user.findUnique({ where: { email } })) throw new Error("Someone already has an account with that email.");

  const user = await prisma.user.create({
    data: { email, name, role: input.role, clientId: clientRole ? input.clientId : null, passwordHash: password ? await hashPassword(password) : NO_PASSWORD },
  });
  await audit(actor ?? { type: "SYSTEM", id: null, label: "Setup script" }, "user.created", "User", user.id, `${email} as ${input.role}${password ? "" : ", Google sign-in only"}`);
  return user;
}

export async function setUserActive(actor: Actor, userId: string, active: boolean) {
  assertCan(actor.role, "user:manage");
  if (actor.id === userId && !active) throw new Error("You can't deactivate your own account.");
  if (!active) {
    const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (target.role === "FOUNDER") {
      const founders = await prisma.user.count({ where: { role: "FOUNDER", active: true } });
      if (founders <= 1) throw new Error("Keep at least one active founder account.");
    }
  }
  const user = await prisma.user.update({ where: { id: userId }, data: { active } });
  if (!active) await prisma.session.deleteMany({ where: { userId } });
  await audit(actor, active ? "user.activated" : "user.deactivated", "User", userId);
  return user;
}

export async function setUserRole(actor: Actor, userId: string, role: string) {
  assertCan(actor.role, "user:manage");
  const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  // A role change can't turn a client account into a team account or back.
  const allowed: readonly string[] = target.clientId ? CLIENT_ROLES : INTERNAL_ROLES;
  if (!allowed.includes(role)) throw new Error("Choose a role.");
  if (actor.id === userId && role !== "FOUNDER") throw new Error("You can't remove your own founder role.");
  const user = await prisma.user.update({ where: { id: userId }, data: { role } });
  await prisma.session.deleteMany({ where: { userId } }); // new role applies from the next sign-in
  await audit(actor, "user.role_changed", "User", userId, role);
  return user;
}
