import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db/client";
import { ForbiddenError } from "../auth/permissions";
import { actorAs } from "../testHelpers/businessFixtures";
import { approveRequest, dismissRequest, recordRefusal } from "./accessRequests";
import type { Mailer, OutgoingEmail } from "../prospecting/mailer";

const run = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const FOUNDER = { ...actorAs("FOUNDER"), label: "Test founder" };
const env = { NIRMAAN_OS_URL: "https://os.example.test" } as unknown as NodeJS.ProcessEnv;
const owner = `owner-${run}@example.test`;

function fakeMailer() {
  const sent: OutgoingEmail[] = [];
  const mailer: Mailer = { name: "Fake", send: async (m) => (sent.push(m), { id: "x" }) };
  return { sent, mailer };
}

after(async () => {
  const reqs = await prisma.accessRequest.findMany({ where: { email: { contains: run } } });
  const users = await prisma.user.findMany({ where: { email: { contains: run } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...reqs.map((r) => r.id), ...users.map((u) => u.id)] } } });
  await prisma.accessRequest.deleteMany({ where: { email: { contains: run } } });
  await prisma.user.deleteMany({ where: { email: { contains: run } } });
});

test("a stranger signing in becomes a request; owners are emailed once a day, not every try", async () => {
  await prisma.user.create({ data: { email: owner, name: "Owner", role: "FOUNDER", passwordHash: "!google-only" } });
  const email = `stranger-${run}@gmail.com`;
  const { sent, mailer } = fakeMailer();
  const now = new Date();
  assert.equal(await recordRefusal(email, { now, mailer, env }), "requested");
  const toOwner = sent.filter((m) => m.to === owner);
  assert.equal(toOwner.length, 1);
  assert.match(toOwner[0].subject, new RegExp(`${email} asked for access`));
  assert.match(toOwner[0].text, /https:\/\/os\.example\.test\/os\/team/);

  await recordRefusal(email, { now: new Date(now.getTime() + 60_000), mailer, env });
  assert.equal(sent.filter((m) => m.to === owner).length, 1, "a second try the same day doesn't email again");
  const r = await prisma.accessRequest.findUniqueOrThrow({ where: { email } });
  assert.equal(r.attempts, 2);
  assert.equal(r.status, "PENDING");
});

test("giving access creates a Google-only account with the role, and tells them", async () => {
  const email = `newbie-${run}@gmail.com`;
  await recordRefusal(email, { mailer: null, env });
  const r = await prisma.accessRequest.findUniqueOrThrow({ where: { email } });
  const { sent, mailer } = fakeMailer();
  await assert.rejects(() => approveRequest(actorAs("CTO"), r.id, { role: "ENGINEER", name: "N" }, { mailer, env }), ForbiddenError);
  const user = await approveRequest(FOUNDER, r.id, { role: "ENGINEER", name: "Newbie" }, { mailer, env });
  assert.equal(user.role, "ENGINEER");
  assert.equal(user.passwordHash, "!google-only");
  assert.equal(sent[0].to, email);
  assert.match(sent[0].text, /https:\/\/os\.example\.test\/login/);
  assert.equal((await prisma.accessRequest.findUniqueOrThrow({ where: { email } })).status, "APPROVED");
  await assert.rejects(() => approveRequest(FOUNDER, r.id, { role: "QA", name: "x" }, { mailer, env }), /already been handled/);
});

test("dismissed requests stay dismissed; a turned-off account isn't a new request", async () => {
  const email = `unknown-${run}@gmail.com`;
  await recordRefusal(email, { mailer: null, env });
  const r = await prisma.accessRequest.findUniqueOrThrow({ where: { email } });
  await dismissRequest(FOUNDER, r.id);
  assert.equal(await recordRefusal(email, { mailer: null, env }), "declined");

  const off = `off-${run}@example.test`;
  await prisma.user.create({ data: { email: off, name: "Off", role: "QA", passwordHash: "!google-only", active: false } });
  assert.equal(await recordRefusal(off, { mailer: null, env }), "inactive");
  assert.equal(await prisma.accessRequest.findUnique({ where: { email: off } }), null);
});
