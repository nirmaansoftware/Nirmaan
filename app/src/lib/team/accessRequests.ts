import { prisma } from "../db/client";
import { audit } from "../audit";
import { assertCan } from "../auth/permissions";
import { SYSTEM_ACTOR, type Actor } from "../auth/actor";
import { INTERNAL_ROLES, isOneOf } from "../db/enums";
import { mailerFromEnv, type Mailer } from "../prospecting/mailer";
import { createUser } from "./service";

/**
 * When someone signs in with a Google account that isn't on the team, the OS
 * doesn't just say no: it records an access request (their email is already
 * verified by Google), tells the owners by email, and the owners give access
 * or dismiss it on the Team screen. The person is emailed once they're in.
 *
 * Anyone with a Google account can reach the sign-in page, so owner emails are
 * limited: one per person per day, and at most 20 a day in total.
 */
const DAY = 86_400_000;
const MAX_NOTIFICATIONS_PER_DAY = 20;

export type RefusalOutcome = "requested" | "declined" | "inactive";

function osUrl(env: NodeJS.ProcessEnv): string {
  return (env.NIRMAAN_OS_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
}

/** Called when a verified Google email has no active account. */
export async function recordRefusal(email: string, deps: { now?: Date; mailer?: Mailer | null; env?: NodeJS.ProcessEnv } = {}): Promise<RefusalOutcome> {
  const now = deps.now ?? new Date();
  const env = deps.env ?? process.env;
  // An account that exists but was turned off isn't a new request.
  if (await prisma.user.findUnique({ where: { email } })) return "inactive";

  const existing = await prisma.accessRequest.findUnique({ where: { email } });
  const request = existing
    ? await prisma.accessRequest.update({
        where: { email },
        // Asking again after a dismissal doesn't reopen it; approved-then-removed does.
        data: { attempts: { increment: 1 }, lastAt: now, ...(existing.status === "APPROVED" ? { status: "PENDING" } : {}) },
      })
    : await prisma.accessRequest.create({ data: { email, firstAt: now, lastAt: now } });
  if (request.status === "DISMISSED") return "declined";

  const recentlyTold = request.notifiedAt && now.getTime() - request.notifiedAt.getTime() < DAY;
  const toldToday = await prisma.accessRequest.count({ where: { notifiedAt: { gte: new Date(now.getTime() - DAY) } } });
  if (!recentlyTold && toldToday < MAX_NOTIFICATIONS_PER_DAY) {
    const mailer = deps.mailer === undefined ? mailerFromEnv(env) : deps.mailer;
    const owners = await prisma.user.findMany({ where: { role: "FOUNDER", active: true }, select: { email: true } });
    if (mailer && owners.length) {
      for (const o of owners) {
        await mailer.send({
          to: o.email,
          subject: `${email} asked for access to the Nirmaan OS`,
          text: `${email} tried to sign in to the Nirmaan OS with Google, but isn't on the team.\n\nGive them access (and choose their role) or dismiss the request on the Team screen:\n${osUrl(env)}/os/team\n\nIf you don't know who this is, dismiss it. Nothing is shared until you give access.`,
        });
      }
      await prisma.accessRequest.update({ where: { email }, data: { notifiedAt: now } });
    }
  }
  if (!existing) await audit(SYSTEM_ACTOR, "access.requested", "AccessRequest", request.id, email);
  return "requested";
}

/** Gives access: a Google-only account with this role, and an email telling them they're in. */
export async function approveRequest(actor: Actor, id: string, input: { role: string; name: string }, deps: { mailer?: Mailer | null; env?: NodeJS.ProcessEnv } = {}) {
  assertCan(actor.role, "user:manage");
  if (!isOneOf(INTERNAL_ROLES, input.role)) throw new Error("Choose a role.");
  const env = deps.env ?? process.env;
  const request = await prisma.accessRequest.findUniqueOrThrow({ where: { id } });
  if (request.status !== "PENDING") throw new Error("This request has already been handled.");
  const name = input.name.trim() || request.email.split("@")[0];
  const user = await createUser(actor, { email: request.email, name, role: input.role });
  await prisma.accessRequest.update({ where: { id }, data: { status: "APPROVED", decidedBy: actor.label, decidedAt: new Date() } });
  await audit(actor, "access.approved", "AccessRequest", id, `${request.email} as ${input.role}`);

  const mailer = deps.mailer === undefined ? mailerFromEnv(env) : deps.mailer;
  if (mailer) {
    await mailer
      .send({
        to: request.email,
        subject: "You now have access to the Nirmaan OS",
        text: `Hi ${name},\n\nYou've been added to the Nirmaan OS. Sign in with this Google account (${request.email}):\n${osUrl(env)}/login\n\nNirmaan`,
      })
      .catch(() => undefined); // access is granted either way; the owner can tell them
  }
  return user;
}

export async function dismissRequest(actor: Actor, id: string) {
  assertCan(actor.role, "user:manage");
  const request = await prisma.accessRequest.update({ where: { id }, data: { status: "DISMISSED", decidedBy: actor.label, decidedAt: new Date() } });
  await audit(actor, "access.dismissed", "AccessRequest", id, request.email);
}
