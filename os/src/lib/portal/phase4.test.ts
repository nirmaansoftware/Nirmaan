import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db/client";
import { createAsset, maturityFor, recordAssetUse } from "@/lib/library/assets";
import { createArticle, searchArticles } from "../knowledge/service";
import { savePostMortem, type PostMortemInput } from "../projects/postmortem";
import { decideGate, requestGate } from "../projects/service";
import { clientRequestChange, openSupportRequest, portalOverview, portalProject, updateSupportRequest } from "./service";
import { createUser, setUserRole } from "../team/service";
import { can } from "../auth/permissions";
import { FOUNDER, actorAs, cleanupClient, cleanupProjectGraph, uniqueEmail } from "../testHelpers/businessFixtures";
import { seedFixtureProject } from "../testHelpers/fixtureProject";

const PASSWORD = "a long enough password";

async function clientWithProject(name: string) {
  const client = await prisma.client.create({ data: { name } });
  const project = await seedFixtureProject({ stage: "IMPLEMENTATION" });
  await prisma.project.update({ where: { id: project.id }, data: { clientId: client.id } });
  const admin = await createUser(FOUNDER, { email: uniqueEmail(), name: `${name} Admin`, role: "CLIENT_ADMIN", password: PASSWORD, clientId: client.id });
  return { client, project, admin };
}

const fullPostMortem: PostMortemInput = {
  wentWell: "Discovery caught the deposit workflow early.",
  wentWrong: "Staging deploy slipped two days.",
  rework: "Reminder templates were rewritten once.",
  underestimated: "WhatsApp template approval time.",
  reusable: "The reminder scheduler.",
  automate: "Staging deploys.",
  pricing: "Add a line for messaging-provider setup.",
  process: "Book template approval in week one.",
};

test("asset maturity is earned: experimental → used once → proven after three projects", async () => {
  assert.equal(maturityFor(0), "EXPERIMENTAL");
  assert.equal(maturityFor(1), "USED_ONCE");
  assert.equal(maturityFor(3), "PROVEN");
  const projects = await Promise.all([seedFixtureProject(), seedFixtureProject(), seedFixtureProject()]);
  const asset = await createAsset(actorAs("ENGINEER"), {
    name: "Reminder scheduler", category: "NOTIFICATIONS", version: "1.0.0", description: "Schedules and sends reminders with retries.",
    dependencies: ["node-cron"], usage: "Import and register jobs.", owner: "Test engineer",
  });
  try {
    await assert.rejects(() => createAsset(actorAs("FINANCE"), { name: "x", category: "FORMS", version: "1.0.0", description: "xxxxxxxxxxx", dependencies: [], usage: "x", owner: "x" }), /permission/);
    await assert.rejects(() => createAsset(actorAs("ENGINEER"), { name: "Thing", category: "FORMS", version: "v1", description: "xxxxxxxxxxx", dependencies: [], usage: "x", owner: "x" }), /Version/);
    assert.equal((await recordAssetUse(FOUNDER, asset.code, projects[0].id)).maturity, "USED_ONCE");
    assert.equal((await recordAssetUse(FOUNDER, asset.code, projects[0].id)).uses, 1, "one use per project");
    await recordAssetUse(FOUNDER, asset.code, projects[1].id);
    assert.equal((await recordAssetUse(FOUNDER, asset.code.toLowerCase(), projects[2].id)).maturity, "PROVEN");
  } finally {
    await prisma.auditLog.deleteMany({ where: { entityId: asset.id } });
    await prisma.asset.delete({ where: { id: asset.id } });
    for (const p of projects) await cleanupProjectGraph(p.id);
  }
});

test("post-mortem: needs real answers, writes one knowledge article, and handover can't be approved without it", async () => {
  const project = await seedFixtureProject({ stage: "DEPLOYMENT" });
  try {
    const approval = await requestGate(FOUNDER, project.id, "HANDOVER");
    await assert.rejects(() => decideGate(FOUNDER, approval.id, "APPROVED"), /post-mortem before approving handover/);
    await assert.rejects(() => savePostMortem(FOUNDER, project.id, { ...fullPostMortem, wentWell: "", wentWrong: "", rework: "" }), /at least six/);

    await savePostMortem(FOUNDER, project.id, fullPostMortem);
    await savePostMortem(FOUNDER, project.id, { ...fullPostMortem, pricing: "Price messaging setup separately." });
    const articles = await prisma.knowledge.findMany({ where: { projectId: project.id, source: "POST_MORTEM" } });
    assert.equal(articles.length, 1, "re-saving updates the same article");
    assert.match(articles[0].content, /Price messaging setup separately/);
    assert.ok((await searchArticles("messaging setup")).some((a) => a.id === articles[0].id), "searchable");

    await decideGate(FOUNDER, approval.id, "APPROVED");
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).stage, "MONITORING");
  } finally {
    await cleanupProjectGraph(project.id);
  }
});

test("knowledge articles need knowledge:write; client roles can't touch internal knowledge", async () => {
  await assert.rejects(() => createArticle(actorAs("FINANCE"), { title: "Hi", content: "Some content here", tags: [] }), /permission/);
  assert.equal(can("CLIENT_ADMIN", "knowledge:read"), false);
  const a = await createArticle(actorAs("ENGINEER"), { title: "Deploy checklist", content: "1. Backups verified 2. Rollback written", tags: ["Deploy", "deploy", "ops"] });
  try {
    assert.deepEqual(JSON.parse(a.tags), ["deploy", "ops"], "tags normalised and de-duplicated");
  } finally {
    await prisma.auditLog.deleteMany({ where: { entityId: a.id } });
    await prisma.knowledge.delete({ where: { id: a.id } });
  }
});

test("portal row-level security: a client only ever reaches its own data", async () => {
  const a = await clientWithProject(`Portal A ${Date.now()}`);
  const b = await clientWithProject(`Portal B ${Date.now()}`);
  try {
    const overview = await portalOverview(a.admin);
    assert.deepEqual(overview.projects.map((p) => p.id), [a.project.id]);
    assert.equal(await portalProject(a.admin, b.project.id), null, "another client's project is simply not found");
    await assert.rejects(() => openSupportRequest(a.admin, { projectId: b.project.id, subject: "Help", body: "Something broke on the site." }), /isn't on your account/);
    await assert.rejects(() => clientRequestChange(a.admin, b.project.id, "Add a feature to their project"), /isn't on your account/);

    const sr = await openSupportRequest(a.admin, { projectId: a.project.id, subject: "Login issue", body: "Staff can't log in since this morning.", priority: "URGENT" });
    assert.equal(sr.clientId, a.client.id);
    assert.equal((await portalOverview(b.admin)).requests.length, 0, "B never sees A's requests");

    const cr = await clientRequestChange(a.admin, a.project.id, "Add a weekly summary email for the owner.");
    assert.equal(cr.status, "OPEN", "a client request is only a request; the team assesses and prices it");

    const viewer = await createUser(FOUNDER, { email: uniqueEmail(), name: "A Viewer", role: "CLIENT_USER", password: PASSWORD, clientId: a.client.id });
    await assert.rejects(() => clientRequestChange(viewer, a.project.id, "Something new please"), /permission/);
    assert.equal((await portalOverview(viewer)).invoices, null, "client users don't see invoices");

    await assert.rejects(() => updateSupportRequest(a.admin as never, sr.id, { status: "RESOLVED" }), /permission/);
    await assert.rejects(() => updateSupportRequest(actorAs("SUPPORT"), sr.id, { status: "RESOLVED" }), /Write a response/);
    const done = await updateSupportRequest(actorAs("SUPPORT"), sr.id, { status: "RESOLVED", response: "Reset the session store; fixed." });
    assert.ok(done.resolvedAt);
  } finally {
    await cleanupProjectGraph(a.project.id);
    await cleanupProjectGraph(b.project.id);
    await cleanupClient(a.client.id);
    await cleanupClient(b.client.id);
  }
});

test("client and team accounts can't be mixed up", async () => {
  const client = await prisma.client.create({ data: { name: `Mix ${Date.now()}` } });
  try {
    await assert.rejects(() => createUser(FOUNDER, { email: uniqueEmail(), name: "X", role: "CLIENT_ADMIN", password: PASSWORD }), /must belong to a client/);
    await assert.rejects(() => createUser(FOUNDER, { email: uniqueEmail(), name: "X", role: "ENGINEER", password: PASSWORD, clientId: client.id }), /can't belong to a client/);
    const u = await createUser(FOUNDER, { email: uniqueEmail(), name: "Client Person", role: "CLIENT_USER", password: PASSWORD, clientId: client.id });
    await assert.rejects(() => setUserRole({ ...FOUNDER, id: "someone" }, u.id, "FOUNDER"), /Choose a role/, "a client account can't become a founder");
  } finally {
    await cleanupClient(client.id);
  }
});
