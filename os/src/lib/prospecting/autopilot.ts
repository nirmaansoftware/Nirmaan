import { prisma } from "../db/client";
import { audit } from "../audit";
import { nextCode } from "../ids";
import { assertCan } from "../auth/permissions";
import { SYSTEM_ACTOR, type Actor } from "../auth/actor";
import { decodeStringList, encodeStringList } from "../db/json";
import { PROSPECT_SEGMENTS, PROSPECT_SEGMENT_LABELS, type ProspectSegment } from "../db/enums";

/**
 * Autopilot: prospecting without anyone creating campaigns. It keeps one
 * standing campaign per segment, searching the chosen cities within one daily
 * volume, and every week re-balances from what actually got replies:
 * more new contacts to the segments and the channel that answer, the
 * best-answering cities searched first. Every message still waits for a
 * person to approve it (Outreach queue).
 *
 * The weekly review is plain arithmetic, written up in one paragraph for the
 * Growth dashboard; no model call, so it costs nothing and can be checked.
 */
export const DEFAULT_CITIES = ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Gandhinagar", "Bhavnagar"];

/** What each segment searches for on Google Maps, and what its first messages lead with. */
export const SEGMENT_PLANS: Record<ProspectSegment, { queries: string[]; angle: string }> = {
  LOCAL_SERVICE: {
    queries: ["dental clinic", "skin clinic", "physiotherapy clinic", "eye hospital", "diagnostic centre", "coaching classes", "chartered accountant", "interior designer", "salon", "gym"],
    angle: "People who find them on Google can't book or get answers without calling, so enquiries after hours or during busy times go to whoever makes it easy.",
  },
  RETAIL_D2C: {
    queries: ["restaurant", "bakery", "boutique", "furniture shop", "jewellery shop", "sweet shop", "electronics store", "cloud kitchen", "organic store", "gift shop"],
    angle: "Customers who want to order or book online can't, so orders stay on phone calls and WhatsApp chats that are easy to miss.",
  },
  SME_OPS: {
    queries: ["manufacturer", "wholesale distributor", "textile trader", "transport company", "packaging manufacturer", "pharmaceutical distributor", "engineering works", "chemical supplier", "printing press", "courier service"],
    angle: "Orders, stock and follow-ups probably live in WhatsApp groups and spreadsheets, where things slip as the business grows.",
  },
};

/** Share of new contacts every segment keeps even when it answers least, so none stops being tested. */
const MIN_SEGMENT_SHARE = 0.15;
const REVIEW_EVERY_DAYS = 7;
const LOOKBACK_DAYS = 30;

export async function getAutopilot() {
  return prisma.autopilot.upsert({ where: { id: "autopilot" }, create: { id: "autopilot" }, update: {} });
}

function weightsOf(raw: string): Record<ProspectSegment, number> {
  let parsed: Record<string, number> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, number>;
  } catch {
    parsed = {};
  }
  const w = Object.fromEntries(PROSPECT_SEGMENTS.map((s) => [s, Number(parsed[s]) > 0 ? Number(parsed[s]) : 1])) as Record<ProspectSegment, number>;
  const total = PROSPECT_SEGMENTS.reduce((n, s) => n + w[s], 0);
  return Object.fromEntries(PROSPECT_SEGMENTS.map((s) => [s, w[s] / total])) as Record<ProspectSegment, number>;
}

export async function updateAutopilot(actor: Actor, input: { on?: boolean; newContactsPerDay?: number; emailShare?: number; cities?: string[] }) {
  assertCan(actor.role, "growth:read");
  if (input.newContactsPerDay !== undefined && (!Number.isInteger(input.newContactsPerDay) || input.newContactsPerDay < 0 || input.newContactsPerDay > 1000)) {
    throw new Error("New businesses a day must be a whole number from 0 to 1,000.");
  }
  if (input.emailShare !== undefined && (!Number.isInteger(input.emailShare) || input.emailShare < 0 || input.emailShare > 100)) throw new Error("Email share must be 0 to 100.");
  const cities = input.cities?.map((c) => c.trim()).filter(Boolean).slice(0, 30);
  if (cities && !cities.length) throw new Error("Keep at least one city.");
  await getAutopilot();
  const a = await prisma.autopilot.update({
    where: { id: "autopilot" },
    data: {
      ...(input.on !== undefined ? { on: input.on } : {}),
      ...(input.newContactsPerDay !== undefined ? { newContactsPerDay: input.newContactsPerDay } : {}),
      ...(input.emailShare !== undefined ? { emailShare: input.emailShare } : {}),
      ...(cities ? { cities: encodeStringList(cities) } : {}),
      updatedBy: actor.label,
    },
  });
  await syncCampaigns(a);
  await audit(actor, "autopilot.updated", "Autopilot", "autopilot", `${a.on ? "on" : "off"}, ${a.newContactsPerDay}/day, ${a.emailShare}% email, ${decodeStringList(a.cities).join(", ")}`);
  return a;
}

type AutopilotRow = Awaited<ReturnType<typeof getAutopilot>>;

/** Budgets for one segment's campaign from the overall volume and that segment's share. */
export function budgetFor(total: number, share: number) {
  const contacts = Math.round(total * share);
  return {
    newContactsPerDay: contacts,
    checksPerDay: Math.ceil(contacts * 1.5),
    // About 20 businesses a Places search, of which roughly half are new and a good fit.
    placesSearchesPerDay: Math.min(20, Math.max(contacts > 0 ? 1 : 0, Math.ceil(contacts / 8))),
  };
}

/** Makes the three standing campaigns match the settings: created if missing, budgets and cities kept in step, paused when off. */
export async function syncCampaigns(a: AutopilotRow) {
  const weights = weightsOf(a.weights);
  const cities = decodeStringList(a.cities);
  for (const segment of PROSPECT_SEGMENTS) {
    const plan = SEGMENT_PLANS[segment];
    const budget = budgetFor(a.newContactsPerDay, weights[segment]);
    const existing = await prisma.campaign.findFirst({ where: { autopilot: true, segment } });
    const data = {
      ...budget,
      emailShare: a.emailShare,
      locations: encodeStringList(cities.length ? cities : DEFAULT_CITIES),
      status: a.on ? "ACTIVE" : existing ? "PAUSED" : "DRAFT",
      // Web search uses the Claude plan heavily; only when Google Places isn't set up.
      webSearchesPerDay: process.env.GOOGLE_PLACES_API_KEY?.trim() ? 0 : 1,
    };
    if (existing) {
      const citiesChanged = existing.locations !== data.locations;
      await prisma.campaign.update({ where: { id: existing.id }, data: { ...data, ...(citiesChanged ? { searchCursor: 0 } : {}) } });
      continue;
    }
    if (!a.on) continue;
    await prisma.$transaction(async (tx) => {
      const code = await nextCode("CAMP", tx);
      await tx.campaign.create({
        data: {
          ...data,
          code,
          autopilot: true,
          segment,
          name: `Autopilot: ${PROSPECT_SEGMENT_LABELS[segment]}`,
          goal: `Standing autopilot search for ${PROSPECT_SEGMENT_LABELS[segment].toLowerCase()} across ${cities.join(", ")}.`,
          queries: encodeStringList(plan.queries),
          angle: plan.angle,
          followUpDays: "[3,7]",
          createdBy: "Autopilot",
        },
      });
    });
  }
}

// ---------------------------------------------------------------- weekly review

interface Tally {
  contacted: number;
  replied: number;
}
const rate = (t: Tally) => (t.contacted ? t.replied / t.contacted : 0);
const pct = (t: Tally) => `${(rate(t) * 100).toFixed(1)}%`;
/** Smoothed score, so a segment with 2 contacts and 1 reply doesn't look like a 50% winner. */
const score = (t: Tally) => (t.replied + 1) / (t.contacted + 10);

export async function outboundTallies(since: Date) {
  const sent = await prisma.outreachMessage.findMany({
    where: { status: "SENT", sentAt: { gte: since } },
    select: { channel: true, prospect: { select: { id: true, segment: true, city: true, repliedAt: true } } },
  });
  const seen = { segment: new Map<string, Set<string>>(), channel: new Map<string, Set<string>>(), city: new Map<string, Set<string>>() };
  const add = (map: Map<string, Set<string>>, key: string, id: string) => map.set(key, (map.get(key) ?? new Set()).add(id));
  const replied = new Set<string>();
  for (const m of sent) {
    add(seen.segment, m.prospect.segment, m.prospect.id);
    add(seen.channel, m.channel, m.prospect.id);
    add(seen.city, m.prospect.city ?? "Unknown", m.prospect.id);
    if (m.prospect.repliedAt) replied.add(m.prospect.id);
  }
  const tally = (map: Map<string, Set<string>>) =>
    Object.fromEntries([...map].map(([k, ids]) => [k, { contacted: ids.size, replied: [...ids].filter((id) => replied.has(id)).length }])) as Record<string, Tally>;
  const all = new Set(sent.map((m) => m.prospect.id));
  return { segment: tally(seen.segment), channel: tally(seen.channel), city: tally(seen.city), total: { contacted: all.size, replied: [...all].filter((id) => replied.has(id)).length } };
}

/** Once a week: re-balance segments, the channel split and city order from replies in the last 30 days. */
export async function reviewAutopilot(now = new Date(), force = false) {
  const a = await getAutopilot();
  if (!a.on) return null;
  if (!force && a.lastReviewAt && now.getTime() - a.lastReviewAt.getTime() < REVIEW_EVERY_DAYS * 86_400_000) return null;
  const t = await outboundTallies(new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000));
  const lines: string[] = [];

  if (t.total.contacted < 20) {
    lines.push(`Only ${t.total.contacted} businesses contacted in the last 30 days, too few to judge; settings unchanged.`);
    await prisma.autopilot.update({ where: { id: "autopilot" }, data: { lastReviewAt: now } });
    return prisma.autopilotReview.create({ data: { summary: lines.join(" "), stats: JSON.stringify(t) } });
  }
  lines.push(`Last 30 days: ${t.total.contacted} businesses contacted, ${t.total.replied} replied (${pct(t.total)}).`);

  // Segments: share ∝ smoothed reply score, never below the floor.
  const zero = { contacted: 0, replied: 0 };
  const raw = Object.fromEntries(PROSPECT_SEGMENTS.map((s) => [s, score(t.segment[s] ?? zero)])) as Record<ProspectSegment, number>;
  const weights = floorAndNormalise(raw, MIN_SEGMENT_SHARE);
  const best = [...PROSPECT_SEGMENTS].sort((x, y) => weights[y] - weights[x])[0];
  lines.push(
    `${PROSPECT_SEGMENTS.map((s) => `${PROSPECT_SEGMENT_LABELS[s]} ${pct(t.segment[s] ?? zero)}`).join(", ")}; ${PROSPECT_SEGMENT_LABELS[best]} now gets ${Math.round(weights[best] * 100)}% of new contacts.`
  );

  // Channel: move 10 points toward the better one, only with enough of both, and keep both tested.
  let emailShare = a.emailShare;
  const email = t.channel.EMAIL ?? zero;
  const whatsapp = t.channel.WHATSAPP ?? zero;
  if (email.contacted >= 30 && whatsapp.contacted >= 30 && Math.abs(rate(email) - rate(whatsapp)) >= 0.005) {
    emailShare = Math.max(30, Math.min(70, emailShare + (rate(email) > rate(whatsapp) ? 10 : -10)));
    lines.push(`Email ${pct(email)} vs WhatsApp ${pct(whatsapp)}: email share ${a.emailShare}% → ${emailShare}%.`);
  } else {
    lines.push(`Email ${pct(email)} vs WhatsApp ${pct(whatsapp)}: not enough of both yet to move the split (${emailShare}% email).`);
  }

  // Cities: best replying first; cities with no contacts yet keep their place after the tested ones.
  const cities = decodeStringList(a.cities);
  const tested = cities.filter((c) => (t.city[c]?.contacted ?? 0) >= 10).sort((x, y) => score(t.city[y]) - score(t.city[x]));
  const reordered = [...tested, ...cities.filter((c) => !tested.includes(c))];
  if (tested.length && reordered.join() !== cities.join()) lines.push(`Cities reordered, best first: ${reordered.join(", ")}.`);

  const updated = await prisma.autopilot.update({
    where: { id: "autopilot" },
    data: { weights: JSON.stringify(weights), emailShare, cities: encodeStringList(reordered), lastReviewAt: now },
  });
  await syncCampaigns(updated);
  const review = await prisma.autopilotReview.create({ data: { summary: lines.join(" "), stats: JSON.stringify(t) } });
  await audit(SYSTEM_ACTOR, "autopilot.reviewed", "Autopilot", "autopilot", review.summary.slice(0, 500));
  return review;
}

/** Scales scores to shares summing to 1, with every share at least `floor`. */
export function floorAndNormalise<K extends string>(raw: Record<K, number>, floor: number): Record<K, number> {
  const keys = Object.keys(raw) as K[];
  const total = keys.reduce((n, k) => n + raw[k], 0) || 1;
  const share = Object.fromEntries(keys.map((k) => [k, raw[k] / total])) as Record<K, number>;
  const low = keys.filter((k) => share[k] < floor);
  const reserved = low.length * floor;
  const highTotal = keys.filter((k) => !low.includes(k)).reduce((n, k) => n + share[k], 0) || 1;
  return Object.fromEntries(keys.map((k) => [k, low.includes(k) ? floor : (share[k] / highTotal) * (1 - reserved)])) as Record<K, number>;
}
