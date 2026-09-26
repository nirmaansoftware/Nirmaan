import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db/client";
import { MockProvider } from "../providers/mock";
import { ForbiddenError } from "../auth/permissions";
import { FOUNDER, actorAs, cleanupLead } from "../testHelpers/businessFixtures";
import { dedupeKeyFor, domainOf, normalPhone, suppressionKeys, suppressionValue } from "./basics";
import { parsePlaces, searchPlaces, type FoundBusiness } from "./places";
import { parseWebBusinesses } from "./webSearch";
import { fetchSite, isPrivateAddress, type FetchedSite } from "./safeFetch";
import { extractSignals } from "./siteSignals";
import { auditNext, auditProspect, parseAudit } from "./audit";
import { approveAndSendEmail, draftOutreach, finalBody, markSentManually, OPT_OUT_LINE, whatsappLink } from "./outreach";
import { addSuppression, convertToLead, doNotContact, runProspectSearch, setProspectStatus } from "./service";
import type { Mailer, OutgoingEmail } from "./mailer";

const PM = actorAs("PROJECT_MANAGER");
const ENGINEER = actorAs("ENGINEER");
const run = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const createdSearches: string[] = [];
const suppressed: string[] = [];

after(async () => {
  const prospects = await prisma.prospect.findMany({ where: { name: { contains: run } } });
  const ids = prospects.map((p) => p.id);
  const messages = await prisma.outreachMessage.findMany({ where: { prospectId: { in: ids } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...ids, ...createdSearches, ...messages.map((m) => m.id), ...suppressed] } } });
  await prisma.aiUsage.deleteMany({ where: { prospectId: { in: ids } } });
  for (const p of prospects) if (p.leadId) await prisma.prospect.update({ where: { id: p.id }, data: { leadId: null } }).then(() => cleanupLead(p.leadId!));
  await prisma.prospect.deleteMany({ where: { id: { in: ids } } });
  await prisma.prospectSearch.deleteMany({ where: { id: { in: createdSearches } } });
  await prisma.suppression.deleteMany({ where: { value: { in: suppressed } } });
});

function biz(name: string, extra: Partial<FoundBusiness> = {}): FoundBusiness {
  return { source: "PLACES", name: `${name} ${run}`, city: "Ahmedabad", ...extra };
}

async function search(found: FoundBusiness[], web: FoundBusiness[] = [], actor = FOUNDER) {
  const s = await runProspectSearch(
    actor,
    { query: "dental clinics", location: "Ahmedabad", segment: "LOCAL_SERVICE", sources: ["PLACES", "WEB"] },
    { places: async () => found, web: async () => web, placesReady: () => true }
  );
  createdSearches.push(s.id);
  return s;
}

const site = (html: string, over: Partial<FetchedSite> = {}): FetchedSite => ({ requestedUrl: "https://x.test", finalUrl: "https://x.test/", status: 200, html, bytes: html.length, ms: 900, truncated: false, ...over });

const AUDIT_REPLY = JSON.stringify({ fit: 82, package: "starter", problem: "Patients can't book online, so evening enquiries go to whoever answers first.", evidence: ["No online booking on the site", "Not set up for phones"] });
const DRAFT_REPLY = JSON.stringify({ subject: "Evening bookings at your clinic", body: "Hello, I noticed your clinic takes appointments only by phone. Do evening calls ever go unanswered? We build simple booking pages for clinics. Happy to talk for 15 minutes.\n\nTeam Nirmaan\nwww.nirmaan.online" });

class FakeMailer implements Mailer {
  name = "Fake";
  sent: OutgoingEmail[] = [];
  async send(mail: OutgoingEmail) {
    this.sent.push(mail);
    return { id: `fake-${this.sent.length}` };
  }
}

// ---------------------------------------------------------------- basics

test("basics: phones, domains and one key per real business", () => {
  assert.equal(normalPhone("098250 12345"), "919825012345");
  assert.equal(normalPhone("+91 98250-12345"), "919825012345");
  assert.equal(normalPhone("123"), null);
  assert.equal(domainOf("https://www.Smile-Dental.in/contact"), "smile-dental.in");
  assert.equal(domainOf("javascript:alert(1)"), null);
  assert.equal(domainOf("ftp://files.example.in"), null, "only web addresses");
  assert.equal(dedupeKeyFor({ placeId: "abc", website: "x.in", name: "X" }), "place:abc");
  assert.equal(dedupeKeyFor({ website: "https://www.x.in/a", name: "X" }), "domain:x.in");
  assert.equal(dedupeKeyFor({ website: "https://instagram.com/xclinic", name: "X Clinic", city: "Surat" }), "name:x clinic|surat", "a social page isn't their own domain");
  assert.equal(suppressionValue(" Owner@Clinic.IN "), "owner@clinic.in");
  assert.equal(suppressionValue("https://www.clinic.in/about"), "clinic.in");
  assert.deepEqual(suppressionKeys({ email: "dr@smile.in", phone: "9825012345", website: "https://smile.in" }).sort(), ["919825012345", "dr@smile.in", "smile.in"].sort());
  assert.deepEqual(suppressionKeys({ email: "smileclinic@gmail.com" }), ["smileclinic@gmail.com"], "gmail.com itself is never blocked");
});

// ---------------------------------------------------------------- sources

test("places: parses businesses, skips closed ones, sends the key only in the header", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const fetchImpl = async (url: string, init: RequestInit) => {
    seen = { url, init };
    return new Response(JSON.stringify({ places: [
      { id: "p1", displayName: { text: "Smile Dental" }, websiteUri: "https://smile.in", internationalPhoneNumber: "+91 98250 12345", rating: 4.6, userRatingCount: 210, primaryTypeDisplayName: { text: "Dentist" } },
      { id: "p2", displayName: { text: "Old Clinic" }, businessStatus: "CLOSED_PERMANENTLY" },
      { id: "p3" },
    ] }), { status: 200 });
  };
  const found = await searchPlaces("dental clinics", "Ahmedabad", { apiKey: "k-123", fetchImpl });
  assert.deepEqual(found.map((f) => f.name), ["Smile Dental"]);
  assert.equal(found[0].ratingCount, 210);
  const init = seen!.init;
  assert.equal((init.headers as Record<string, string>)["X-Goog-Api-Key"], "k-123");
  assert.ok(!seen!.url.includes("k-123"), "key never in the URL");
  assert.match(String(init.body), /dental clinics in Ahmedabad/);

  const failing = async () => new Response(JSON.stringify({ error: { message: "API key not valid." } }), { status: 400 });
  await assert.rejects(() => searchPlaces("x y z", "Surat", { apiKey: "k-123", fetchImpl: failing }), /API key not valid/);
  assert.deepEqual(parsePlaces({ nope: true }, "Surat"), []);
});

test("web search: strict parsing, no unsourced emails, no duplicates, no prose", () => {
  const raw = "Here you go:\n```json\n" + JSON.stringify({ businesses: [
    { name: "Kavya Foods", website: "kavyafoods.in", email: "Hello@KavyaFoods.in", emailSource: "Contact page", why: "Orders only on WhatsApp" },
    { name: "kavya foods", website: "other.in" },
    { name: "Guess Co", email: "info@guess.co" },
    { name: "" },
  ] }) + "\n```";
  const found = parseWebBusinesses(raw, "Surat");
  assert.deepEqual(found.map((f) => f.name), ["Kavya Foods", "Guess Co"]);
  assert.equal(found[0].email, "hello@kavyafoods.in");
  assert.equal(found[0].website, "https://kavyafoods.in/");
  assert.equal(found[1].email, undefined, "an email with no stated source is dropped");
  assert.throws(() => parseWebBusinesses("I found some great leads!", "Surat"), /JSON object/);
});

// ---------------------------------------------------------------- site check

test("safe fetch: only public addresses, re-checked after redirects", async () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "142.250.183.14", "2606:4700::1111"]) assert.equal(isPrivateAddress(ip), false, ip);

  const resolve = async (host: string) => (host === "internal.test" ? ["10.0.0.5"] : ["93.184.216.34"]);
  await assert.rejects(() => fetchSite("http://localhost/admin", { resolve }), /public internet address/, "refused by name, before any lookup");
  await assert.rejects(() => fetchSite("http://printer.local/", { resolve }), /public internet address/);
  await assert.rejects(() => fetchSite("http://127.0.0.1/", { resolve }), /public internet address/);
  await assert.rejects(() => fetchSite("http://internal.test/", { resolve }), /public internet address/);
  await assert.rejects(() => fetchSite("ftp://example.test/", { resolve }), /http and https/);
  await assert.rejects(() => fetchSite("https://example.test:8080/", { resolve }), /unusual port/);

  const redirecting = (async (url: string | URL) => {
    const u = String(url);
    if (u.startsWith("https://good.test")) return new Response(null, { status: 301, headers: { location: "http://internal.test/secret" } });
    throw new Error(`should never fetch ${u}`);
  }) as typeof fetch;
  await assert.rejects(() => fetchSite("https://good.test/", { resolve, fetchImpl: redirecting }), /public internet address/);

  const ok = (async () => new Response("<html><title>Hi</title></html>", { status: 200 })) as unknown as typeof fetch;
  const page = await fetchSite("good.test", { resolve, fetchImpl: ok });
  assert.equal(page.status, 200);
  assert.match(page.html, /<title>Hi/);
});

test("site signals: plain facts from the homepage", () => {
  const s = extractSignals(site(`<html><head><title>Smile Dental</title><meta name="description" content="Family dentist in Satellite">
    <link href="https://smile.in/wp-content/themes/x.css"></head><body>
    <a href="https://wa.me/919825012345">WhatsApp us</a> <a href="tel:+919825012345">Call</a>
    <a href="mailto:care@smile.in">care@smile.in</a> <img src="logo@2x.png"> <a href="https://www.instagram.com/smile">Insta</a>
    <p>© 2019 Smile Dental</p></body></html>`, { finalUrl: "http://smile.in/" }));
  assert.equal(s.mobileFriendly, false);
  assert.equal(s.https, false);
  assert.equal(s.platform, "WordPress");
  assert.equal(s.whatsapp, true);
  assert.equal(s.phoneLink, true);
  assert.equal(s.booking, false);
  assert.equal(s.onlineStore, false);
  assert.equal(s.latestYear, 2019);
  assert.deepEqual(s.emails, ["care@smile.in"]);
  assert.deepEqual(s.social, ["instagram.com"]);
});

// ---------------------------------------------------------------- the flow

test("search: sources merge into one prospect per business; permissions; do-not-contact is respected", async () => {
  const s = await search(
    [biz("Smile Dental", { placeId: `pl-${run}`, website: `https://smile-${run}.in`, phone: "+91 98250 12345", rating: 4.6, ratingCount: 210 })],
    [biz("Smile Dental", { source: "WEB", website: `https://www.smile-${run}.in/contact`, email: `care@smile-${run}.in`, emailSource: "Contact page" }), biz("Tooth Care", { source: "WEB" })]
  );
  assert.equal(s.found, 3);
  assert.equal(s.added, 2, "Places and web results for Smile Dental (same own website) are one prospect");
  const again = await search([biz("Smile Dental", { placeId: `pl-${run}`, email: `hello@smile-${run}.in` })]);
  assert.equal(again.added, 0, "the same place again is merged, not duplicated");
  const smile = await prisma.prospect.findUniqueOrThrow({ where: { dedupeKey: `place:pl-${run}` } });
  assert.match(smile.code, /^PROS-\d{3,}$/);
  assert.equal(smile.email, `care@smile-${run}.in`, "the web result filled the missing email; later ones don't overwrite it");
  assert.equal(smile.domain, `smile-${run}.in`);

  await assert.rejects(() => search([], [], ENGINEER), ForbiddenError);
  await search([biz("PM Clinic")], [], PM);

  const value = await addSuppression(FOUNDER, `blocked-${run}.in`, "Asked us not to");
  suppressed.push(value);
  const skipped = await search([biz("Blocked Clinic", { website: `https://blocked-${run}.in` })]);
  assert.equal(skipped.added, 0);
  assert.match(skipped.notes ?? "", /do-not-contact/);

  const noPlaces = await runProspectSearch(FOUNDER, { query: "bakeries", location: "Surat", segment: "RETAIL_D2C", sources: ["PLACES", "WEB"] }, { placesReady: () => false, web: async () => [biz("Web Bakery", { source: "WEB" })] });
  createdSearches.push(noPlaces.id);
  assert.match(noPlaces.notes ?? "", /GOOGLE_PLACES_API_KEY/);
  assert.equal(noPlaces.added, 1);
  await assert.rejects(() => runProspectSearch(FOUNDER, { query: "x", location: "Surat", segment: "SME_OPS", sources: ["WEB"] }), /3 to 100/);
});

test("audit: reads the site, keeps the published email, scores the fit", async () => {
  await search([biz("Audit Clinic", { placeId: `au-${run}`, website: "https://audit-clinic.test" })]);
  const p = await prisma.prospect.findUniqueOrThrow({ where: { dedupeKey: `place:au-${run}` } });
  const html = `<html><title>Audit Clinic</title><a href="mailto:owner@audit-clinic.test">mail</a><p>© 2018</p></html>`;
  const audited = await auditProspect(FOUNDER, p.id, { fetcher: async () => site(html), provider: new MockProvider(AUDIT_REPLY) });
  assert.equal(audited.status, "AUDITED");
  assert.equal(audited.fitScore, 82);
  assert.equal(audited.suggestedPackage, "starter");
  assert.equal(audited.email, "owner@audit-clinic.test");
  assert.equal(audited.emailSource, "Published on their website");
  const usage = await prisma.aiUsage.findFirstOrThrow({ where: { prospectId: p.id } });
  assert.equal(usage.task, "prospect-audit");

  assert.deepEqual(parseAudit('{"fit": 140, "package": "mega", "problem": "x", "evidence": ["a"]}').fit, 100);
  assert.equal(parseAudit('{"fit": 40, "package": "mega", "problem": "x"}').package, null);
  assert.throws(() => parseAudit('{"package": "starter"}'), /numeric/);
});

test("outreach: drafted by Claude, sent only by someone allowed to, with every guard rail", async () => {
  await search([biz("Send Clinic", { placeId: `se-${run}`, email: `owner@send-${run}.in`, emailSource: "Contact page", phone: "9825011111" })]);
  const p = await prisma.prospect.findUniqueOrThrow({ where: { dedupeKey: `place:se-${run}` } });

  await assert.rejects(() => draftOutreach(FOUNDER, p.id, "EMAIL", { provider: new MockProvider(DRAFT_REPLY) }), /Check the business first/);
  await auditProspect(FOUNDER, p.id, { fetcher: async () => site("<html></html>"), provider: new MockProvider(AUDIT_REPLY) });
  const draft = await draftOutreach(PM, p.id, "EMAIL", { provider: new MockProvider(DRAFT_REPLY) });
  assert.equal(draft.status, "DRAFT");
  assert.equal(draft.toAddress, `owner@send-${run}.in`);
  assert.equal((await prisma.prospect.findUniqueOrThrow({ where: { id: p.id } })).status, "DRAFTED");

  const mailer = new FakeMailer();
  await assert.rejects(() => approveAndSendEmail(PM, draft.id, { mailer }), ForbiddenError, "a project manager can draft but not send");
  await assert.rejects(() => approveAndSendEmail(FOUNDER, draft.id, { mailer: null }), /isn't set up/);

  await approveAndSendEmail(FOUNDER, draft.id, { mailer });
  assert.equal(mailer.sent.length, 1);
  assert.ok(mailer.sent[0].text.endsWith(OPT_OUT_LINE), "the opt-out line is always added");
  const sent = await prisma.outreachMessage.findUniqueOrThrow({ where: { id: draft.id } });
  assert.equal(sent.status, "SENT");
  assert.equal(sent.approvedBy, "Test founder");
  assert.equal((await prisma.prospect.findUniqueOrThrow({ where: { id: p.id } })).status, "CONTACTED");

  await assert.rejects(() => approveAndSendEmail(FOUNDER, draft.id, { mailer }), /already been handled/);
  const followUp = await draftOutreach(FOUNDER, p.id, "WHATSAPP", { provider: new MockProvider(DRAFT_REPLY) });
  assert.equal(followUp.subject, null);
  await assert.rejects(() => markSentManually(FOUNDER, followUp.id), /at least 2 days apart/);

  const link = whatsappLink("098250 11111", "Hello there, a short note.")!;
  assert.match(link, /^https:\/\/wa\.me\/919825011111\?text=/);
  assert.ok(decodeURIComponent(link.split("text=")[1]).endsWith(OPT_OUT_LINE));
  assert.equal(finalBody("Hi  "), `Hi\n\n${OPT_OUT_LINE}`);
});

test("outreach: the daily cap and the do-not-contact list stop sending", async () => {
  await search([
    biz("Cap One", { placeId: `c1-${run}`, email: `one@cap-${run}.in`, emailSource: "site" }),
    biz("Cap Two", { placeId: `c2-${run}`, email: `two@captwo-${run}.in`, emailSource: "site" }),
  ]);
  const [one, two] = await Promise.all([`c1-${run}`, `c2-${run}`].map((id) => prisma.prospect.findUniqueOrThrow({ where: { dedupeKey: `place:${id}` } })));
  for (const p of [one, two]) await auditProspect(FOUNDER, p.id, { fetcher: async () => site("<html></html>"), provider: new MockProvider(AUDIT_REPLY) });
  const d1 = await draftOutreach(FOUNDER, one.id, "EMAIL", { provider: new MockProvider(DRAFT_REPLY) });
  const d2 = await draftOutreach(FOUNDER, two.id, "EMAIL", { provider: new MockProvider(DRAFT_REPLY) });

  const sentToday = await prisma.outreachMessage.count({ where: { status: "SENT", sentVia: "EMAIL", sentAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } });
  process.env.OUTREACH_DAILY_LIMIT = String(sentToday + 1);
  try {
    await approveAndSendEmail(FOUNDER, d1.id, { mailer: new FakeMailer() });
    await assert.rejects(() => approveAndSendEmail(FOUNDER, d2.id, { mailer: new FakeMailer() }), /limit/);
  } finally {
    delete process.env.OUTREACH_DAILY_LIMIT;
  }

  await doNotContact(FOUNDER, two.id, "Replied stop");
  suppressed.push(`two@captwo-${run}.in`, `captwo-${run}.in`);
  assert.equal((await prisma.outreachMessage.findUniqueOrThrow({ where: { id: d2.id } })).status, "CANCELLED");
  await assert.rejects(() => draftOutreach(FOUNDER, two.id, "EMAIL", { provider: new MockProvider(DRAFT_REPLY) }), /do not contact|can't be contacted/);
});

test("reply → lead: an OUTBOUND lead linked to the prospect, once", async () => {
  await search([biz("Reply Clinic", { placeId: `re-${run}`, phone: "9825022222" })]);
  const p = await prisma.prospect.findUniqueOrThrow({ where: { dedupeKey: `place:re-${run}` } });
  await assert.rejects(() => setProspectStatus(FOUNDER, p.id, "DISMISSED"), /why/);
  await assert.rejects(() => setProspectStatus(FOUNDER, p.id, "REPLIED"), /can't move/);

  const input = { problem: "Evening appointment calls go unanswered and patients book elsewhere.", contactName: "Dr Mehta", contactEmail: `mehta-${run}@example.test` };
  const lead = await convertToLead(FOUNDER, p.id, input);
  assert.equal(lead.source, "OUTBOUND");
  assert.equal(lead.company, p.name);
  const linked = await prisma.prospect.findUniqueOrThrow({ where: { id: p.id } });
  assert.equal(linked.status, "CONVERTED");
  assert.equal(linked.leadId, lead.id);
  await assert.rejects(() => convertToLead(FOUNDER, p.id, input), /already a lead/);
  await assert.rejects(() => convertToLead(ENGINEER, p.id, input), ForbiddenError);
});

test("check the next few: unchecked prospects from one search, busiest first, failures reported not thrown", async () => {
  const s = await search([
    biz("Batch Quiet", { placeId: `b1-${run}`, website: "https://quiet.test", ratingCount: 3 }),
    biz("Batch Busy", { placeId: `b2-${run}`, website: "https://busy.test", ratingCount: 400 }),
    biz("Batch Broken", { placeId: `b3-${run}`, website: "https://broken.test", ratingCount: 50 }),
  ]);
  const provider = new MockProvider(AUDIT_REPLY);
  const fetcher = async (url: string) => (url.includes("broken") ? Promise.reject(new Error("timed out")) : site("<html></html>"));
  const first = await auditNext(FOUNDER, { searchId: s.id, limit: 1, fetcher, provider });
  assert.equal(first.done, 1);
  assert.equal((await prisma.prospect.findUniqueOrThrow({ where: { dedupeKey: `place:b2-${run}` } })).status, "AUDITED", "busiest first");
  const rest = await auditNext(FOUNDER, { searchId: s.id, limit: 5, fetcher, provider });
  assert.equal(rest.done, 2, "an unreachable site is still scored, as 'couldn't be read'");
  assert.equal(rest.remaining, 0);
  const broken = await prisma.prospect.findUniqueOrThrow({ where: { dedupeKey: `place:b3-${run}` } });
  assert.match(broken.siteSignals ?? "", /timed out/);
  await assert.rejects(() => auditNext(ENGINEER, { searchId: s.id }), ForbiddenError);
});

test("site reading: facts that may be said, unknowns that may not", async () => {
  const { readSite } = await import("./audit");
  const { describeSignals } = await import("./siteSignals");
  const page = (html: string, status = 200, finalUrl = "https://x.test/"): FetchedSite => ({ requestedUrl: finalUrl, finalUrl, status, html, bytes: html.length, ms: 100, truncated: false });
  const lines = async (fetcher: (u: string) => Promise<FetchedSite>, url: string | null = "https://x.test") => describeSignals(await readSite(url, fetcher)).join(" ");

  assert.match(await lines(async () => page(""), null), /^FACT: Their Google listing has no website link.*never say they have none/);
  assert.match(await lines(async () => page(""), "https://instagram.com/clinic"), /^FACT: Their listing links to a instagram\.com page/);
  assert.match(await lines(async () => { throw new Error("Won't fetch that address: the domain doesn't exist."); }), /^FACT: .*is dead: the domain doesn't exist/);
  assert.match(await lines(async () => page("<h1>Not found</h1>", 404)), /^FACT: .*missing page \(HTTP 404\)/);
  assert.match(await lines(async () => page("<title>Parked Domain name on Hostinger DNS system</title>")), /^FACT: .*parked placeholder page/);
  // Unknowns: never evidence.
  assert.match(await lines(async () => page("<html>Conflict</html>", 409)), /^UNKNOWN: .*HTTP 409/);
  assert.match(await lines(async () => { throw new Error("The operation was aborted due to timeout"); }), /^UNKNOWN: /);
  assert.match(await lines(async () => page(`<html><body><div id="root"></div><script src="/app.js"></script></body></html>`)), /^UNKNOWN: .*drawn by JavaScript/);
  assert.match(await lines(async () => page("")), /^UNKNOWN: .*frame/, "an empty page isn't a blank site");
  // A <meta refresh> page is followed once.
  const hops: string[] = [];
  assert.match(
    await lines(async (u) => {
      hops.push(u);
      return u.endsWith("/home") ? page("<title>Parked Domain</title>", 200, u) : page(`<meta http-equiv="refresh" content="0; url=/home">`);
    }),
    /parked placeholder/
  );
  assert.deepEqual(hops, ["https://x.test", "https://x.test/home"]);
});

test("site reading: the contact page is read for an email when the homepage has none", async () => {
  const { readSite } = await import("./audit");
  const words = "We are a family dental clinic in Satellite with twenty years of practice. ".repeat(6);
  const fetched: string[] = [];
  const s = await readSite("https://clinic.test", async (u) => {
    fetched.push(u);
    return u.endsWith("/contact-us")
      ? site(`<p>Write to us at care@clinic.test</p>`, { finalUrl: u })
      : site(`<html><p>${words}</p><a href="/contact-us">Contact us</a></html>`, { finalUrl: "https://clinic.test/" });
  });
  assert.deepEqual(s.emails, ["care@clinic.test"]);
  assert.deepEqual(fetched, ["https://clinic.test", "https://clinic.test/contact-us"]);
});

test("drafts are always signed", async () => {
  const { withSignature } = await import("./outreach");
  const env = { OUTREACH_SENDER_NAME: "Sahaj Patel", OUTREACH_WHATSAPP_NUMBER: "9493833697" } as unknown as NodeJS.ProcessEnv;
  assert.match(withSignature("Hi, a short note about bookings.", "WHATSAPP", env), /\n\nSahaj Patel\nNirmaan · www\.nirmaan\.online$/);
  const signed = "Hi, a note.\n\nSahaj Patel\nNirmaan · www.nirmaan.online";
  assert.equal(withSignature(signed, "WHATSAPP", env), signed, "not signed twice");
});
