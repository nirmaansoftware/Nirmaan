import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db/client";
import { MockProvider } from "@/lib/ai/providers/mock";
import type { CompletionRequest, CompletionResult, ModelProvider } from "@/lib/ai/providers/types";
import { FOUNDER } from "../testHelpers/businessFixtures";
import { nextSearch, parseFollowUps, parsePlan, planCampaign, setCampaignStatus, updateCampaign, campaignStats } from "./campaigns";
import { checkInbox, ownWords, wantsNoMore, type IncomingMail, type MailboxReader } from "./inbox";
import { approveEmail, OPT_OUT_LINE, ourWhatsapp, signature } from "./outreach";
import { inSendingWindow, nextGapSeconds, runTick } from "./worker";
import type { Mailer, OutgoingEmail } from "./mailer";
import type { FetchedSite } from "./safeFetch";
import type { FoundBusiness } from "./places";
import { isWhatsappable } from "./basics";

const run = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const campaigns: string[] = [];

/** Answers like Claude would, by what's being asked. */
class RoutingProvider implements ModelProvider {
  calls: string[] = [];
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const kind = /assess whether/.test(req.systemPrompt) ? "audit" : /follow-up number/.test(req.systemPrompt) ? "follow" : /first-contact|personally writing/.test(req.systemPrompt) ? "first" : "plan";
    this.calls.push(kind);
    const text =
      kind === "audit" ? JSON.stringify({ fit: 80, package: "starter", problem: "Bookings only by phone.", evidence: ["No online booking"] })
      : kind === "follow" ? JSON.stringify({ body: "Just bringing this back up in case it got buried. Would a 15-minute call help?\n\nSahaj" })
      : JSON.stringify({ subject: "bookings at your clinic", body: "Hello, I noticed bookings at your clinic are only by phone. Would online booking help? Happy to talk.\n\nSahaj" });
    return { text, provider: "mock", model: "mock-echo" };
  }
}

class FakeMailer implements Mailer {
  name = "Fake";
  sent: OutgoingEmail[] = [];
  async send(mail: OutgoingEmail) {
    this.sent.push(mail);
    return { id: `<m${this.sent.length}-${run}@test>` };
  }
}

const site = (): FetchedSite => ({ requestedUrl: "https://x.test", finalUrl: "https://x.test/", status: 200, html: "<html><title>Clinic</title></html>", bytes: 100, ms: 500, truncated: false });

// This week's Monday, 11:00 in India (05:30 UTC): inside sending hours. It must be
// recent: checkInbox counts bounces against the real clock (the last 7 days), so a
// frozen date in the past would never match. Monday 11:00 is always within 6 days.
const MONDAY_11_IST = (() => {
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  const daysSinceMonday = (ist.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - daysSinceMonday, 5, 30));
})();

async function resetJobs() {
  await prisma.jobState.deleteMany({ where: { name: { in: ["campaign-tick", "send-pace", "inbox-check"] } } });
}

before(async () => {
  // Ticks here are scoped to this file's own campaigns (onlyCampaigns), so a
  // developer's real campaigns in dev.db are never touched.
  await resetJobs();
});

after(async () => {
  const prospects = await prisma.prospect.findMany({ where: { campaignId: { in: campaigns } }, select: { id: true, email: true, phone: true, website: true } });
  const ids = prospects.map((p) => p.id);
  await prisma.aiUsage.deleteMany({ where: { OR: [{ prospectId: { in: ids } }, { task: "campaign-plan", createdAt: { gte: new Date(Date.now() - 3_600_000) } }] } });
  const msgs = await prisma.outreachMessage.findMany({ where: { prospectId: { in: ids } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...ids, ...campaigns, ...msgs.map((m) => m.id)] } } });
  await prisma.prospect.deleteMany({ where: { id: { in: ids } } });
  await prisma.prospectSearch.deleteMany({ where: { campaignId: { in: campaigns } } });
  await prisma.campaign.deleteMany({ where: { id: { in: campaigns } } });
  await prisma.suppression.deleteMany({ where: { value: { contains: run } } });
  await resetJobs();
});

// ---------------------------------------------------------------- pure parts

test("plan: parsed strictly, defaults sensible; follow-up days validated; the plan is walked city by city", () => {
  const plan = parsePlan('```json\n{"name":"Clinics","segment":"LOCAL_SERVICE","queries":["dental clinic","skin clinic"],"locations":["Ahmedabad","Surat"],"angle":"Phone-only booking","notes":"Picked two cities"}\n```');
  assert.deepEqual(plan.queries, ["dental clinic", "skin clinic"]);
  assert.equal(parsePlan('{"segment":"NOPE","queries":["a"],"locations":["b"]}').segment, "LOCAL_SERVICE");
  assert.throws(() => parsePlan('{"queries":[],"locations":["b"]}'), /at least one/);
  assert.deepEqual(parseFollowUps("3, 7"), [3, 7]);
  assert.throws(() => parseFollowUps("1,2,3,4,5"), /At most 4/);
  assert.throws(() => parseFollowUps("0"), /1 to 60/);
  const c = { queries: JSON.stringify(["dental clinic", "skin clinic"]), locations: JSON.stringify(["Ahmedabad", "Surat"]), searchCursor: 0 };
  const walk = [0, 1, 2, 3, 4].map((i) => nextSearch({ ...c, searchCursor: i }));
  assert.deepEqual(walk.map((w) => `${w!.query}@${w!.location}`), ["dental clinic@Ahmedabad", "skin clinic@Ahmedabad", "dental clinic@Surat", "skin clinic@Surat", "dental clinic@Ahmedabad"]);
});

test("pacing: India's working hours, Monday to Saturday, random gaps", () => {
  assert.equal(inSendingWindow(MONDAY_11_IST), true);
  assert.equal(inSendingWindow(new Date("2026-09-28T14:00:00Z")), false, "19:30 IST is after hours");
  assert.equal(inSendingWindow(new Date("2026-09-27T05:30:00Z")), false, "Sunday");
  assert.equal(inSendingWindow(new Date("2026-09-28T03:00:00Z")), false, "08:30 IST is too early");
  assert.equal(nextGapSeconds(() => 0), 45);
  assert.equal(nextGapSeconds(() => 1), 113);
  assert.equal(nextGapSeconds(() => 0, { OUTREACH_GAP_SECONDS: "120" } as unknown as NodeJS.ProcessEnv), 120);
});

test("voice: signed by a person, our WhatsApp in the email signature; WhatsApp only to mobiles", () => {
  const env = { OUTREACH_SENDER_NAME: "Sahaj Patel", OUTREACH_WHATSAPP_NUMBER: "9493833697" } as unknown as NodeJS.ProcessEnv;
  assert.equal(ourWhatsapp(env), "+91 94938 33697");
  assert.equal(signature("EMAIL", env), "Sahaj Patel\nNirmaan · www.nirmaan.online\nWhatsApp: +91 94938 33697");
  assert.equal(signature("WHATSAPP", env), "Sahaj Patel\nNirmaan · www.nirmaan.online");
  assert.equal(isWhatsappable("+91 98250 12345"), true);
  assert.equal(isWhatsappable("079 2656 1234"), false, "an Ahmedabad landline");
  assert.equal(isWhatsappable("+91 79 2656 1234"), false, "the same landline, international format");
  assert.equal(isWhatsappable("+91 7069089250"), true, "a mobile starting 70 (from the first real search)");
  assert.equal(isWhatsappable("098250 12345"), true);
});

test("replies: only their own words count; our quoted opt-out line never reads as a stop", () => {
  const quoted = `Sounds useful, can you call me tomorrow?\n\nOn Mon, 28 Sep 2026, Sahaj Patel wrote:\n> Hello...\n> ${OPT_OUT_LINE}`;
  assert.equal(ownWords(quoted), "Sounds useful, can you call me tomorrow?");
  assert.equal(wantsNoMore(quoted), false);
  assert.equal(wantsNoMore("Stop"), true);
  assert.equal(wantsNoMore("Not interested, thanks.\n\nOn Mon wrote:\n> hi"), true);
  assert.equal(wantsNoMore(`Please stop.\n${OPT_OUT_LINE}`), true);
});

// ---------------------------------------------------------------- the machine

test("campaign end to end: plan → search → check → split drafts → paced sending → follow-up in thread → reply stops it", async () => {
  const provider = new RoutingProvider();
  const planner = new MockProvider(JSON.stringify({ name: `Clinics ${run}`, segment: "LOCAL_SERVICE", queries: ["dental clinic"], locations: ["Ahmedabad", "Surat"], angle: "Phone-only booking" }));
  const { campaign } = await planCampaign(FOUNDER, "Dental clinics in Ahmedabad and Surat that still take bookings only by phone", { provider: planner });
  campaigns.push(campaign.id);
  assert.match(campaign.code, /^CAMP-\d{3,}$/);
  assert.equal(campaign.status, "DRAFT");
  await updateCampaign(FOUNDER, campaign.id, { name: `Clinics ${run}`, followUpDays: "3", emailShare: 50, minFit: 50 });
  await setCampaignStatus(FOUNDER, campaign.id, "ACTIVE");

  const found: FoundBusiness[] = [
    { source: "PLACES", placeId: `a-${run}`, name: `Both One ${run}`, city: "Ahmedabad", website: `https://both1-${run}.in`, phone: "9825000001", email: `one@both1-${run}.in`, emailSource: "site", ratingCount: 90 },
    { source: "PLACES", placeId: `b-${run}`, name: `Both Two ${run}`, city: "Ahmedabad", website: `https://both2-${run}.in`, phone: "9825000002", email: `two@both2-${run}.in`, emailSource: "site", ratingCount: 80 },
    { source: "PLACES", placeId: `c-${run}`, name: `Mobile Only ${run}`, city: "Ahmedabad", phone: "9825000003", ratingCount: 70 },
    { source: "PLACES", placeId: `d-${run}`, name: `Landline Only ${run}`, city: "Ahmedabad", phone: "079 2656 0004", ratingCount: 60 },
  ];
  const finders = { places: async () => found, web: async () => [], placesReady: () => true };
  const mailer = new FakeMailer();
  const deps = { onlyCampaigns: campaigns, now: MONDAY_11_IST, provider, fetcher: async () => site(), finders, mailer, reader: null, random: () => 0 };

  // Tick 1 searches; tick 2 checks three; tick 3 drafts for them and checks the fourth; tick 4 drafts the rest.
  for (let i = 0; i < 4; i++) {
    const r = await runTick(deps);
    assert.deepEqual(r.errors, [], `tick ${i + 1}`);
  }
  const drafts = await prisma.outreachMessage.findMany({ where: { campaignId: campaign.id }, include: { prospect: true } });
  const byName = (n: string) => drafts.filter((d) => d.prospect.name.startsWith(n));
  assert.equal(drafts.length, 3, "the landline-only business can't get WhatsApp and has no email, so it's skipped");
  assert.deepEqual(byName("Mobile Only").map((d) => d.channel), ["WHATSAPP"]);
  assert.deepEqual(byName("Landline Only"), []);
  assert.ok(drafts.some((d) => d.channel === "EMAIL") && drafts.some((d) => d.channel === "WHATSAPP"), "both channels used, near the 50-50 target");
  assert.ok(drafts.every((d) => d.status === "DRAFT"), "nothing leaves without a person");

  // A person approves the emails; the worker sends one per paced slot, never a burst.
  const emails = drafts.filter((d) => d.channel === "EMAIL");
  for (const e of emails) await approveEmail(FOUNDER, e.id, MONDAY_11_IST);
  await runTick(deps);
  assert.equal(mailer.sent.length, 1);
  await runTick(deps);
  assert.equal(mailer.sent.length, emails.length > 1 ? 1 : 1, "the random gap hasn't passed yet");
  if (emails.length > 1) {
    await runTick({ ...deps, now: new Date(MONDAY_11_IST.getTime() + 5 * 60_000) });
    assert.equal(mailer.sent.length, 2);
  }
  assert.ok(mailer.sent[0].text.endsWith(OPT_OUT_LINE));
  const first = await prisma.outreachMessage.findFirstOrThrow({ where: { id: emails[0].id } });
  assert.equal(first.status, "SENT");
  assert.match(first.approvedBy ?? "", /Test founder/);

  // Three days on, a follow-up is drafted as a reply in the same thread.
  const later = new Date(MONDAY_11_IST.getTime() + 3 * 86_400_000 + 3_600_000);
  await runTick({ ...deps, now: later });
  const follow = await prisma.outreachMessage.findFirstOrThrow({ where: { prospectId: first.prospectId, step: 1 } });
  assert.equal(follow.subject, `Re: ${first.subject}`);
  assert.equal(follow.threadRef, first.messageRef);
  assert.equal(follow.status, "DRAFT");

  // They reply: the waiting follow-up is cancelled and the business is marked replied.
  const reply: IncomingMail = { uid: 7, from: first.toAddress, subject: `Re: ${first.subject}`, inReplyTo: first.messageRef ?? undefined, text: `Yes, call me on Thursday.\n\nOn Mon wrote:\n> ${OPT_OUT_LINE}` };
  const reader: MailboxReader = { readSince: async (last) => ({ mails: last < 7 ? [reply] : [], maxUid: 7 }) };
  const r = await runTick({ ...deps, now: later, reader });
  assert.equal(r.inbox?.replies, 1);
  assert.equal(r.inbox?.stops, 0);
  assert.equal((await prisma.outreachMessage.findUniqueOrThrow({ where: { id: follow.id } })).status, "CANCELLED");
  assert.equal((await prisma.prospect.findUniqueOrThrow({ where: { id: first.prospectId } })).status, "REPLIED");
  const again = await runTick({ ...deps, now: later, reader });
  assert.equal(again.inbox?.read, 0, "the inbox checkpoint moved on");

  const stats = await campaignStats(campaign.id);
  assert.equal(stats.email.replied, 1);
  assert.ok(stats.email.replyRate > 0);
});

test("inbox: a 'stop' puts them on do-not-contact; a bounce retires the address", async () => {
  const { campaign } = await planCampaign(FOUNDER, "Bakeries in Surat that take orders only on WhatsApp", {
    provider: new MockProvider(JSON.stringify({ name: `Bakeries ${run}`, queries: ["bakery"], locations: ["Surat"] })),
  });
  campaigns.push(campaign.id);
  await setCampaignStatus(FOUNDER, campaign.id, "ACTIVE");
  const found: FoundBusiness[] = [
    { source: "PLACES", placeId: `s-${run}`, name: `Stopper ${run}`, city: "Surat", email: `owner@stopper-${run}.in`, emailSource: "site", website: `https://stopper-${run}.in` },
    { source: "PLACES", placeId: `x-${run}`, name: `Bouncer ${run}`, city: "Surat", email: `gone@bouncer-${run}.in`, emailSource: "site", website: `https://bouncer-${run}.in` },
  ];
  await resetJobs();
  const provider = new RoutingProvider();
  const mailer = new FakeMailer();
  // web is stubbed too: the end-to-end campaign above is still ACTIVE, and once its Places quota is used up the tick falls back to web search. Unstubbed, that is a real network call, which never returns in a sandbox.
  const deps = { onlyCampaigns: campaigns, now: MONDAY_11_IST, provider, fetcher: async () => site(), finders: { places: async () => found, web: async () => [], placesReady: () => true }, mailer, reader: null, random: () => 0 };
  await updateCampaign(FOUNDER, campaign.id, { emailShare: 100, minFit: 10 });
  for (let i = 0; i < 3; i++) await runTick(deps);
  const msgs = await prisma.outreachMessage.findMany({ where: { campaignId: campaign.id } });
  assert.equal(msgs.length, 2);
  for (const [i, m] of msgs.entries()) {
    await approveEmail(FOUNDER, m.id, MONDAY_11_IST);
    await runTick({ ...deps, now: new Date(MONDAY_11_IST.getTime() + (i + 1) * 5 * 60_000) });
  }
  assert.equal(mailer.sent.length, 2);

  const stopper = msgs.find((m) => m.toAddress.startsWith("owner@"))!;
  const bouncer = msgs.find((m) => m.toAddress.startsWith("gone@"))!;
  const mails: IncomingMail[] = [
    { uid: 1, from: stopper.toAddress, subject: "Re: hi", text: "Please stop emailing me." },
    { uid: 2, from: "MAILER-DAEMON@googlemail.com", subject: "Delivery Status Notification (Failure)", text: `Your message wasn't delivered to ${bouncer.toAddress} because the address couldn't be found.` },
    { uid: 3, from: "someone-else@example.com", subject: "unrelated", text: "hello" },
  ];
  const report = await checkInbox({ reader: { readSince: async () => ({ mails, maxUid: 3 }) } });
  assert.deepEqual({ replies: report.replies, stops: report.stops, bounces: report.bounces }, { replies: 1, stops: 1, bounces: 1 });
  const s = await prisma.prospect.findUniqueOrThrow({ where: { id: stopper.prospectId } });
  assert.equal(s.status, "DO_NOT_CONTACT");
  assert.ok(await prisma.suppression.findUnique({ where: { value: stopper.toAddress } }));
  const b = await prisma.prospect.findUniqueOrThrow({ where: { id: bouncer.prospectId } });
  assert.equal(b.email, null);
  assert.equal((await prisma.outreachMessage.findUniqueOrThrow({ where: { id: bouncer.id } })).status, "FAILED");
});

test("worker: one tick at a time; nothing is sent outside hours or without approval", async () => {
  await resetJobs();
  await prisma.jobState.create({ data: { name: "campaign-tick", lockedUntil: new Date(Date.now() + 60_000) } });
  const skipped = await runTick({ mailer: new FakeMailer(), reader: null, onlyCampaigns: [] });
  assert.equal(skipped.ran, false);
  await resetJobs();
  const r = await runTick({ now: new Date("2026-09-27T05:30:00Z"), mailer: new FakeMailer(), reader: null, finders: { placesReady: () => false, web: async () => [] }, onlyCampaigns: [] });
  assert.equal(r.sent, 0);
});
