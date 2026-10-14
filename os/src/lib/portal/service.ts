import type { User } from "@prisma/client";
import { prisma } from "../db/client";
import { nextCode } from "../ids";
import { audit } from "../audit";
import { logEvent } from "../db/logEvent";
import { assertCan, can } from "../auth/permissions";
import type { Actor } from "../auth/actor";
import { SUPPORT_PRIORITIES, SUPPORT_STATUSES, isClientRole, isOneOf } from "../db/enums";

/**
 * The client portal's data layer. Every read and write takes the signed-in
 * client user and filters by their clientId: this is the one place the
 * portal's row-level security lives. A client can never address another
 * client's project, invoice or request by id; the lookup simply finds
 * nothing.
 */
export type ClientUser = Pick<User, "id" | "name" | "role" | "clientId">;

function clientActor(user: ClientUser): Actor {
  return { type: "USER", id: user.id, label: `${user.name} (client)`, role: user.role as Actor["role"] };
}

function requireClient(user: ClientUser): string {
  if (!isClientRole(user.role) || !user.clientId) throw new Error("This page is for client accounts.");
  return user.clientId;
}

export async function portalOverview(user: ClientUser) {
  const clientId = requireClient(user);
  const [client, projects, invoices, requests] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { name: true } }),
    prisma.project.findMany({
      where: { clientId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, code: true, name: true, stage: true, updatedAt: true },
    }),
    can(user.role, "client:invoices:read")
      ? prisma.invoice.findMany({
          where: { clientId, status: { in: ["ISSUED", "PAID"] } },
          orderBy: { createdAt: "desc" },
          select: { code: true, label: true, total: true, status: true, dueDate: true, paidAt: true, payments: { select: { amount: true } } },
        })
      : Promise.resolve(null),
    prisma.supportRequest.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { code: true, subject: true, status: true, priority: true, response: true, createdAt: true, project: { select: { name: true } } },
    }),
  ]);
  return { client, projects, invoices, requests };
}

/** A client project, only if it belongs to this client. Returns null otherwise (never throws a hint). */
export async function portalProject(user: ClientUser, projectId: string) {
  const clientId = requireClient(user);
  return prisma.project.findFirst({ where: { id: projectId, clientId }, select: { id: true, code: true, name: true, stage: true } });
}

export async function openSupportRequest(
  user: ClientUser,
  input: { projectId?: string; subject: string; body: string; priority?: string }
) {
  assertCan(user.role, "client:support:write");
  const clientId = requireClient(user);
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (subject.length < 4) throw new Error("Add a short subject.");
  if (body.length < 10) throw new Error("Describe what's happening.");
  if (body.length > 5000) throw new Error("Keep it under 5,000 characters.");
  const priority = input.priority && isOneOf(SUPPORT_PRIORITIES, input.priority) ? input.priority : "NORMAL";
  let projectId: string | null = null;
  if (input.projectId) {
    const project = await portalProject(user, input.projectId);
    if (!project) throw new Error("That project isn't on your account.");
    projectId = project.id;
  }
  const sr = await prisma.$transaction(async (tx) =>
    tx.supportRequest.create({
      data: { code: await nextCode("SR", tx), clientId, projectId, subject: subject.slice(0, 200), body, priority, openedBy: user.name },
    })
  );
  if (projectId) await logEvent(projectId, null, null, `${user.name} (client) opened ${sr.code}: ${sr.subject}`);
  await audit(clientActor(user), "support.opened", "SupportRequest", sr.id, sr.code);
  return sr;
}

/**
 * "Can you also add X?" from the client side. It becomes a normal change
 * request (CR-) that the team assesses against scope and prices; nothing is
 * committed by the client asking.
 */
export async function clientRequestChange(user: ClientUser, projectId: string, description: string) {
  assertCan(user.role, "client:change:request");
  const project = await portalProject(user, projectId);
  if (!project) throw new Error("That project isn't on your account.");
  const text = description.trim();
  if (text.length < 10) throw new Error("Describe the change in a sentence or two.");
  if (text.length > 4000) throw new Error("Keep it under 4,000 characters.");
  const cr = await prisma.$transaction(async (tx) =>
    tx.changeRequest.create({ data: { code: await nextCode("CR", tx), projectId, requestedBy: `${user.name} (client)`, description: text } })
  );
  await logEvent(projectId, null, null, `${user.name} (client) requested a change: ${cr.code}.`);
  await audit(clientActor(user), "change.client_requested", "ChangeRequest", cr.id, cr.code);
  return cr;
}

/** Internal: respond to / move a support request. */
export async function updateSupportRequest(actor: Actor, id: string, input: { status: string; response?: string }) {
  assertCan(actor.role, "support:write");
  if (!isOneOf(SUPPORT_STATUSES, input.status)) throw new Error("Unknown status.");
  const response = input.response?.trim() || undefined;
  if (input.status === "RESOLVED" && !response) {
    const current = await prisma.supportRequest.findUniqueOrThrow({ where: { id } });
    if (!current.response) throw new Error("Write a response before resolving, so the client knows what was done.");
  }
  const sr = await prisma.supportRequest.update({
    where: { id },
    data: { status: input.status, response, resolvedAt: input.status === "RESOLVED" ? new Date() : null },
  });
  await audit(actor, "support.updated", "SupportRequest", id, `${sr.code} → ${sr.status}`);
  return sr;
}
