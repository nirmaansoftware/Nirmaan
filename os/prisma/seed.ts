/**
 * Seeds one demo project so the dashboard has something to render
 * (Phase 3 verification: "dashboard shows a seeded project/task/artifact").
 *
 * This is fixture data, not a real client engagement — consistent with
 * /projects/README.md, which explicitly says no real project exists yet.
 * Run with: npx prisma db seed
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { encodeStringList } from "../src/lib/db/json";
import { nextCode } from "../src/lib/ids";

const prisma = new PrismaClient();

const PROJECT_ID_SLUG = "demo-project";

async function main() {
  // Phase 1 tables first (children before parents). Users, sessions and the
  // id Counter are deliberately kept: re-seeding must not lock anyone out or
  // hand out an id (REQ-012, PRJ-003...) a second time.
  await prisma.auditLog.deleteMany({});
  await prisma.aiUsage.deleteMany({});
  await prisma.evidence.deleteMany({});
  await prisma.testCase.deleteMany({});
  await prisma.traceLink.deleteMany({});
  await prisma.feature.deleteMany({});
  await prisma.changeRequest.deleteMany({});
  await prisma.deployment.deleteMany({});
  await prisma.requirement.deleteMany({});
  await prisma.leadNote.deleteMany({});
  await prisma.discoveryItem.deleteMany({});

  await prisma.event.deleteMany({});
  await prisma.approval.deleteMany({});
  await prisma.artifact.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.proposal.deleteMany({});
  await prisma.lead.deleteMany({});
  await prisma.client.deleteMany({});
  await prisma.agent.deleteMany({});

  const client = await prisma.client.create({
    data: {
      name: "Riverside Bread Co.",
      contact: "hello@riversidebread.example (fixture — not a real client)",
    },
  });

  const productManager = await prisma.agent.create({
    data: {
      slug: "product-manager",
      role: "Product discovery and requirements",
      status: "ACTIVE",
    },
  });
  await prisma.agent.create({
    data: {
      slug: "orchestrator",
      role: "AI Technical Director + Project Orchestrator",
      status: "ACTIVE",
    },
  });

  const project = await prisma.project.create({
    data: {
      name: "Riverside Bread Co. — marketing site",
      clientId: client.id,
      stage: "REQUIREMENTS",
      artifactsPath: PROJECT_ID_SLUG,
    },
  });

  const task = await prisma.task.create({
    data: {
      title: "Draft PRD from client brief",
      description: "Turn the intake brief into a Product Requirements Document.",
      projectId: project.id,
      ownerAgent: "product-manager",
      status: "REVIEW",
      priority: "HIGH",
      dependencies: encodeStringList([]),
      blockers: encodeStringList([]),
    },
  });

  const artifactRelativePath = "requirements/prd.md";
  await prisma.artifact.create({
    data: {
      projectId: project.id,
      taskId: task.id,
      type: "PRD",
      filePath: artifactRelativePath,
      version: 1,
      createdByAgentId: productManager.id,
    },
  });

  await prisma.approval.create({
    data: {
      projectId: project.id,
      gate: "REQUIREMENTS",
      status: "PENDING",
      requestedBy: "product-manager",
    },
  });

  await prisma.event.create({
    data: {
      projectId: project.id,
      agentSlug: "product-manager",
      taskId: task.id,
      message: "Drafted PRD from client intake brief; requesting Requirements gate approval.",
    },
  });

  // Write the matching artifact file on disk so the DB pointer resolves to
  // something real, consistent with the file-based artifact convention.
  const projectsRoot = path.join(process.cwd(), "..", "projects");
  const artifactDir = path.join(projectsRoot, PROJECT_ID_SLUG, "requirements");
  fs.mkdirSync(artifactDir, { recursive: true });
  const artifactFile = path.join(artifactDir, "prd.md");
  if (!fs.existsSync(artifactFile)) {
    fs.writeFileSync(
      artifactFile,
      [
        "---",
        'project: "demo-project"',
        'agent: "product-manager"',
        'status: "ready-for-handoff"',
        'confidence: "MEDIUM"',
        "assumptions:",
        '  - "This is seed/fixture data for Phase 3, not a real client PRD."',
        "risks: []",
        "open_questions:",
        '  - "What budget range is the client actually working with?"',
        "review_required: true",
        "---",
        "",
        "# PRD: Riverside Bread Co. Marketing Site",
        "",
        "## Problem",
        "",
        "The bakery has no web presence beyond Instagram. Customers can't see the weekly menu, hours, or place advance orders for custom cakes.",
        "",
        "## MVP scope",
        "",
        "- Menu page (weekly, editable without a developer)",
        "- Hours / location",
        "- Custom cake order request form",
        "",
        "*(Fixture content for Phase 3 dashboard verification.)*",
        "",
      ].join("\n")
    );
  }

  const projectMdPath = path.join(projectsRoot, PROJECT_ID_SLUG, "project.md");
  if (!fs.existsSync(projectMdPath)) {
    fs.writeFileSync(
      projectMdPath,
      [
        "# Riverside Bread Co. — marketing site",
        "",
        "Fixture/demo project for exercising the Agency OS dashboard (Phase 3). Not a real client engagement.",
        "",
        `Client: ${client.name}`,
        "Stage: REQUIREMENTS",
      ].join("\n")
    );
  }

  // A demo inbound lead (fixture, not a real enquiry) so the discovery flow
  // has something to work on right after seeding.
  const leadCode = await nextCode("LEAD");
  await prisma.lead.create({
    data: {
      code: leadCode,
      source: "WEBSITE",
      problem:
        "We take catering orders over WhatsApp and phone calls, then copy them into an Excel sheet. Orders get missed, we forget deposit follow-ups, and on busy weekends nobody knows which orders are confirmed.",
      business: "Home catering business, 6 staff",
      currentSolution: "WhatsApp, phone calls and one shared Excel sheet",
      frequency: "About 15 orders a week, 40+ in wedding season",
      desiredOutcome: "Every order confirmed, paid and delivered on time without chasing people",
      budgetRange: "Not sure yet",
      contactName: "Demo Customer (fixture)",
      contactEmail: "demo-customer@example.test",
      company: "Demo Caterers (fixture)",
    },
  });

  console.log(`Seeded project "${project.name}" (${project.id}) and demo lead ${leadCode}.`);
  const users = await prisma.user.count();
  if (!users) {
    console.log('No team accounts yet. Create the founder account with:\n  NIRMAAN_PASSWORD=\'a long passphrase\' npm run user:create -- you@example.com "Your Name" FOUNDER');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
