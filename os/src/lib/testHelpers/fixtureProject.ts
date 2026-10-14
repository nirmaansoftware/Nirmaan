/**
 * Shared test helper: creates an isolated Project (+ optionally a Task)
 * with a unique artifactsPath so tests never touch the seeded
 * demo-project, and a matching cleanup function. Used by
 * orchestrator/dispatch.test.ts and orchestrator/qualityGates.test.ts.
 */
import { prisma } from "../db/client";
import type { ProjectStage } from "../db/enums";

export async function seedFixtureProject(opts: { stage?: ProjectStage } = {}) {
  const artifactsPath = `test-fixture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const project = await prisma.project.create({
    data: { name: "Test fixture project", stage: opts.stage ?? "REQUIREMENTS", artifactsPath },
  });
  return project;
}

export async function seedFixtureTask(projectId: string, ownerAgent: string, title = "Fixture task", description?: string) {
  return prisma.task.create({
    data: { title, description, projectId, ownerAgent, status: "READY" },
  });
}

export async function cleanupFixtureProject(projectId: string) {
  await prisma.aiUsage.deleteMany({ where: { projectId } });
  await prisma.agentRun.deleteMany({ where: { projectId } });
  await prisma.event.deleteMany({ where: { projectId } });
  await prisma.approval.deleteMany({ where: { projectId } });
  await prisma.artifact.deleteMany({ where: { projectId } });
  await prisma.task.deleteMany({ where: { projectId } });
  await prisma.project.delete({ where: { id: projectId } });
}
