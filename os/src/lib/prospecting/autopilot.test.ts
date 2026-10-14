import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db/client";
import { ForbiddenError } from "../auth/permissions";
import { FOUNDER, actorAs } from "../testHelpers/businessFixtures";
import { nextCode } from "../ids";
import { budgetFor, floorAndNormalise, getAutopilot, reviewAutopilot, updateAutopilot } from "./autopilot";
import { funnel, messageLog, messagesCsv } from "./growth";
import type { ProspectSegment } from "../db/enums";

const run = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const CTO = actorAs("CTO");
let saved: Awaited<ReturnType<typeof getAutopilot>>;
const reviewIds: string[] = [];
let preexistingAutopilotCampaigns: string[] = [];

before(async () => {
  saved = await getAutopilot();
  preexistingAutopilotCampaigns = (await prisma.campaign.findMany({ where: { autopilot: true }, select: { id: true } })).map((c) => c.id);
});

after(async () => {
  const prospects = await prisma.prospect.findMany({ where: { name: { contains: run } }, select: { id: true } });
  const ids = prospects.map((p) => p.id);
  await prisma.outreachMessage.deleteMany({ where: { prospectId: { in: ids } } });
  await prisma.prospect.deleteMany({ where: { id: { in: ids } } });
  await prisma.autopilotReview.deleteMany({ where: { id: { in: reviewIds } } });
  const created = await prisma.campaign.findMany({ where: { autopilot: true, id: { notIn: preexistingAutopilotCampaigns } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityType: "Autopilot" }, { entityId: { in: created.map((c) => c.id) } }], createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
  await prisma.campaign.deleteMany({ where: { id: { in: created.map((c) => c.id) } } });
  await prisma.autopilot.update({
    where: { id: "autopilot" },
    data: { on: saved.on, newContactsPerDay: saved.newContactsPerDay, emailShare: saved.emailShare, cities: saved.cities, weights: saved.weights, lastReviewAt: saved.lastReviewAt },
  });
  await prisma.campaign.updateMany({ where: { id: { in: preexistingAutopilotCampaigns } }, data: { status: saved.on ? "ACTIVE" : "PAUSED" } });
});

test("maths: shares sum to one with a floor; budgets scale with volume", () => {
  const w = floorAndNormalise({ a: 10, b: 1, c: 0 }, 0.15);
  assert.ok(Math.abs(w.a + w.b + w.c - 1) < 1e-9);
  assert.equal(w.c, 0.15);
  assert.equal(w.b, 0.15);
  assert.ok(Math.abs(w.a - 0.7) < 1e-9);
  assert.deepEqual(budgetFor(100, 1 / 3), { newContactsPerDay: 33, checksPerDay: 50, placesSearchesPerDay: 5 });
  assert.deepEqual(budgetFor(0, 1 / 3), { newContactsPerDay: 0, checksPerDay: 0, placesSearchesPerDay: 0 });
});

test("autopilot: owners only; on creates one standing campaign per segment for the chosen cities; off pauses them", async () => {
  await assert.rejects(() => updateAutopilot(CTO, { on: true }), ForbiddenError);
  const a = await updateAutopilot(FOUNDER, { on: true, newContactsPerDay: 90, emailShare: 50, cities: ["Ahmedabad", "Surat"] });
  assert.equal(a.on, true);
  const cs = await prisma.campaign.findMany({ where: { autopilot: true } });
  assert.equal(cs.length, 3);
  assert.ok(cs.every((c) => c.status === "ACTIVE" && c.locations === JSON.stringify(["Ahmedabad", "Surat"])));
  assert.deepEqual(cs.map((c) => c.newContactsPerDay).sort(), [30, 30, 30]);
  await updateAutopilot(FOUNDER, { on: false });
  assert.ok((await prisma.campaign.findMany({ where: { autopilot: true } })).every((c) => c.status === "PAUSED"));
  await assert.rejects(() => updateAutopilot(FOUNDER, { newContactsPerDay: -1 }), /0 to 1,000/);
});

test("weekly review: more contacts to the segment and channel that reply, cities reordered, written up", async () => {
  await updateAutopilot(FOUNDER, { on: true, newContactsPerDay: 100, emailShare: 50, cities: ["Surat", "Ahmedabad"] });
  // 60 contacted local services (Ahmedabad, 12 replied, mostly WhatsApp); 30 SMEs (Surat, 0 replied).
  const now = new Date();
  async function contact(i: number, segment: ProspectSegment, city: string, channel: "EMAIL" | "WHATSAPP", replied: boolean) {
    const code = await nextCode("PROS");
    const p = await prisma.prospect.create({
      data: { code, dedupeKey: `test:${run}:${i}`, nameKey: `${run}-${i}`, name: `Review ${run} ${i}`, segment, city, source: "MANUAL", status: replied ? "REPLIED" : "CONTACTED", repliedAt: replied ? now : null },
    });
    await prisma.outreachMessage.create({ data: { prospectId: p.id, channel, toAddress: channel === "EMAIL" ? `r${i}@${run}.test` : `9198250${String(i).padStart(5, "0")}`, body: "hello there, a test", draftedBy: "AGENT", status: "SENT", sentAt: now } });
  }
  for (let i = 0; i < 60; i++) await contact(i, "LOCAL_SERVICE", "Ahmedabad", i % 2 ? "WHATSAPP" : "EMAIL", i < 24 && i % 2 === 1);
  for (let i = 60; i < 90; i++) await contact(i, "SME_OPS", "Surat", i % 2 ? "WHATSAPP" : "EMAIL", false);

  const review = await reviewAutopilot(now, true);
  assert.ok(review);
  reviewIds.push(review!.id);
  const a = await getAutopilot();
  const w = JSON.parse(a.weights) as Record<string, number>;
  assert.ok(w.LOCAL_SERVICE > w.SME_OPS, "the segment that replied gets more");
  assert.ok(w.SME_OPS >= 0.15 - 1e-9 && w.RETAIL_D2C >= 0.15 - 1e-9, "every segment keeps its floor");
  assert.equal(a.emailShare, 40, "WhatsApp replied better, so email's share drops 10 points");
  assert.deepEqual(JSON.parse(a.cities), ["Ahmedabad", "Surat"], "the city that replied goes first");
  assert.match(review!.summary, /WhatsApp/);
  const local = await prisma.campaign.findFirstOrThrow({ where: { autopilot: true, segment: "LOCAL_SERVICE" } });
  assert.ok(local.newContactsPerDay > 33 && local.emailShare === 40);
  // Not due again for a week.
  assert.equal(await reviewAutopilot(new Date(now.getTime() + 86_400_000)), null);
  await updateAutopilot(FOUNDER, { on: false });
});

test("growth: owners only; the log finds messages; the CSV is safe to open in Excel", async () => {
  await assert.rejects(() => funnel(CTO), ForbiddenError);
  const f = await funnel(FOUNDER);
  assert.ok(f.contacted >= 0 && typeof f.wonValue === "number");
  const code = await nextCode("PROS");
  const p = await prisma.prospect.create({ data: { code, dedupeKey: `test:${run}:csv`, nameKey: `${run}-csv`, name: `Csv ${run}`, segment: "LOCAL_SERVICE", source: "MANUAL" } });
  await prisma.outreachMessage.create({ data: { prospectId: p.id, channel: "EMAIL", toAddress: `csv@${run}.test`, subject: "=HYPERLINK(\"evil\")", body: "=1+1 \"quoted\"", draftedBy: "AGENT" } });
  const log = await messageLog(FOUNDER, { q: `csv@${run}` });
  assert.equal(log.total, 1);
  const csv = await messagesCsv(FOUNDER, { q: `csv@${run}` });
  assert.ok(csv.includes(`"'=HYPERLINK(""evil"")"`), "formula neutralised, quotes escaped");
  assert.ok(csv.includes(`"'=1+1 ""quoted"""`));
  await assert.rejects(() => messagesCsv(CTO), ForbiddenError);
});
