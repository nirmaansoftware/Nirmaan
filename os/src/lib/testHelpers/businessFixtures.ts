/**
 * Fixtures for Phase 1 business tests. Like fixtureProject.ts, everything
 * is created with unique values and removed afterwards, so tests can share
 * the developer's dev.db without leaving rows behind.
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../db/client";
import { projectsRoot } from "../agents/artifactWriter";
import type { Actor } from "../auth/actor";
import type { InternalRole } from "../db/enums";
import { createLead, type IntakeData } from "../leads/intake";

export function actorAs(role: InternalRole, label = `Test ${role.toLowerCase()}`): Actor {
  return { type: "USER", id: null, label, role };
}

export const FOUNDER = actorAs("FOUNDER", "Test founder");

export function uniqueEmail(): string {
  return `fixture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

export async function makeLead(overrides: Partial<IntakeData> = {}) {
  return createLead(
    FOUNDER,
    {
      problem: "We manage all customer orders through WhatsApp and Excel, and we keep losing track of follow-ups.",
      contactName: "Fixture Customer",
      contactEmail: uniqueEmail(),
      business: "Wholesale bakery supplies",
      currentSolution: "WhatsApp groups and one shared spreadsheet",
      ...overrides,
    },
    "MANUAL"
  );
}

/** Removes a lead and everything that grew from it: proposals, projects, their graph, and audit rows. */
export async function cleanupLead(leadId: string) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { projects: true, proposals: true } });
  if (!lead) return;
  for (const project of lead.projects) await cleanupProjectGraph(project.id);
  const requirements = await prisma.requirement.findMany({ where: { leadId }, select: { id: true } });
  const items = await prisma.discoveryItem.findMany({ where: { leadId }, select: { id: true } });
  const entityIds = [leadId, ...lead.proposals.map((p) => p.id), ...requirements.map((r) => r.id), ...items.map((i) => i.id)];
  await prisma.requirement.deleteMany({ where: { leadId } });
  await prisma.proposal.deleteMany({ where: { leadId } });
  await prisma.aiUsage.deleteMany({ where: { leadId } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: entityIds } } });
  await prisma.lead.delete({ where: { id: leadId } });
  if (lead.clientId) await cleanupClient(lead.clientId);
}

/** Removes a fixture client and its client-level finance rows once no project uses it. */
export async function cleanupClient(clientId: string) {
  if (await prisma.project.count({ where: { clientId } })) return;
  const subs = await prisma.subscription.findMany({ where: { clientId }, select: { id: true } });
  const invoices = await prisma.invoice.findMany({ where: { clientId }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...subs, ...invoices].map((r) => r.id) } } });
  await prisma.payment.deleteMany({ where: { invoice: { clientId } } });
  await prisma.invoice.deleteMany({ where: { clientId } });
  await prisma.subscription.deleteMany({ where: { clientId } });
  const supports = await prisma.supportRequest.findMany({ where: { clientId }, select: { id: true } });
  const users = await prisma.user.findMany({ where: { clientId }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...supports, ...users].map((r) => r.id) } } });
  await prisma.supportRequest.deleteMany({ where: { clientId } });
  await prisma.user.deleteMany({ where: { clientId } });
  await prisma.client.delete({ where: { id: clientId } }).catch(() => undefined);
}

/** Removes a project's Phase 1 graph plus the base rows fixtureProject.ts handles. */
export async function cleanupProjectGraph(projectId: string) {
  const ids = async (rows: Promise<{ id: string }[]>) => (await rows).map((r) => r.id);
  const tests = await ids(prisma.testCase.findMany({ where: { projectId }, select: { id: true } }));
  const related = [
    projectId,
    ...tests,
    ...(await ids(prisma.changeRequest.findMany({ where: { projectId }, select: { id: true } }))),
    ...(await ids(prisma.feature.findMany({ where: { projectId }, select: { id: true } }))),
    ...(await ids(prisma.task.findMany({ where: { projectId }, select: { id: true } }))),
    ...(await ids(prisma.deployment.findMany({ where: { projectId }, select: { id: true } }))),
    ...(await ids(prisma.approval.findMany({ where: { projectId }, select: { id: true } }))),
    ...(await ids(prisma.traceLink.findMany({ where: { projectId }, select: { id: true } }))),
    ...(await ids(prisma.evidence.findMany({ where: { testCaseId: { in: tests } }, select: { id: true } }))),
    ...(await ids(prisma.requirement.findMany({ where: { projectId, leadId: null }, select: { id: true } }))),
    ...(await ids(prisma.agentRun.findMany({ where: { projectId }, select: { id: true } }))),
    ...(await ids(prisma.invoice.findMany({ where: { projectId }, select: { id: true } }))),
    ...(await ids(prisma.costEntry.findMany({ where: { projectId }, select: { id: true } }))),
    ...(await ids(prisma.subscription.findMany({ where: { projectId }, select: { id: true } }))),
    ...(await ids(prisma.supportRequest.findMany({ where: { projectId }, select: { id: true } }))),
  ];
  await prisma.auditLog.deleteMany({ where: { entityId: { in: related } } });
  await prisma.payment.deleteMany({ where: { invoice: { projectId } } });
  await prisma.invoice.deleteMany({ where: { projectId } });
  await prisma.costEntry.deleteMany({ where: { projectId } });
  await prisma.subscription.deleteMany({ where: { projectId } });
  await prisma.postMortem.deleteMany({ where: { projectId } });
  await prisma.knowledge.deleteMany({ where: { projectId } });
  await prisma.assetUse.deleteMany({ where: { projectId } });
  await prisma.supportRequest.deleteMany({ where: { projectId } });
  await prisma.aiUsage.deleteMany({ where: { projectId } });
  await prisma.agentRun.deleteMany({ where: { projectId } });
  await prisma.traceLink.deleteMany({ where: { projectId } });
  await prisma.evidence.deleteMany({ where: { testCaseId: { in: tests } } });
  await prisma.testCase.deleteMany({ where: { projectId } });
  await prisma.feature.deleteMany({ where: { projectId } });
  await prisma.changeRequest.deleteMany({ where: { projectId } });
  await prisma.deployment.deleteMany({ where: { projectId } });
  // Requirements that came from a lead go back to it (cleanupLead removes them);
  // requirements created directly on the project are removed here.
  await prisma.requirement.deleteMany({ where: { projectId, leadId: null } });
  await prisma.requirement.updateMany({ where: { projectId }, data: { projectId: null } });
  await prisma.event.deleteMany({ where: { projectId } });
  await prisma.approval.deleteMany({ where: { projectId } });
  await prisma.artifact.deleteMany({ where: { projectId } });
  await prisma.task.deleteMany({ where: { projectId } });
  const project = await prisma.project.delete({ where: { id: projectId } });
  removeFixtureArtifacts(project.artifactsPath);
}

/** Agent runs in tests write real files under /projects/test-fixture-*; remove them too. */
export function removeFixtureArtifacts(artifactsPath: string) {
  if (!artifactsPath.startsWith("test-fixture-")) return; // never touch a real project's folder
  fs.rmSync(path.join(projectsRoot(), artifactsPath), { recursive: true, force: true });
}
