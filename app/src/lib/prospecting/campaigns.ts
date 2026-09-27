import { prisma } from "../db/client";
import { audit } from "../audit";
import { nextCode } from "../ids";
import { assertCan } from "../auth/permissions";
import type { Actor } from "../auth/actor";
import { callModel } from "../ai/callModel";
import { extractJsonObject, text, textList } from "../ai/json";
import { decodeStringList, encodeStringList } from "../db/json";
import { CAMPAIGN_STATUSES, isOneOf, PROSPECT_SEGMENTS, PROSPECT_SEGMENT_LABELS } from "../db/enums";
import type { ModelProvider } from "../providers/types";
import { PACKAGES } from "./basics";

/**
 * Campaigns: a goal in plain words ("dental and skin clinics in Gujarat's big
 * cities that still book by phone") that Claude turns into a search plan, and
 * that the worker (worker.ts) then works on every day within its budgets:
 * search, check, draft first messages split between email and WhatsApp,
 * draft follow-ups. People still approve every message that goes out.
 */
const PLAN_PROMPT = `You plan outbound prospecting for Nirmaan, a small Indian software studio ("You bring the problem. We build the system.") that builds websites, online stores, booking systems, web applications and automation for small and mid-sized businesses.

Packages: ${PACKAGES.map((p) => `${p.name} (${p.for})`).join(" ")}

Turn the founder's goal into a search plan for Google Maps / web searches in India:
- "queries": 3 to 10 short business-type searches, as people would type them into Google Maps ("dental clinic", "skin clinic", "physiotherapy centre"). No locations inside queries.
- "locations": 1 to 15 cities or areas in India, most promising first. If the goal names none, pick sensible large cities for the business type and say so in "notes".
- "segment": one of ${PROSPECT_SEGMENTS.join(", ")} (${PROSPECT_SEGMENTS.map((s) => `${s} = ${PROSPECT_SEGMENT_LABELS[s]}`).join("; ")}).
- "angle": one sentence: the specific, honest problem first messages should lead with.
- "name": a short campaign name (max 6 words).
- "notes": anything the founder should check (assumptions you made).

Reply with one JSON object and nothing else: {"name": "", "segment": "", "queries": [], "locations": [], "angle": "", "notes": ""}`;

export interface CampaignPlan {
  name: string;
  segment: (typeof PROSPECT_SEGMENTS)[number];
  queries: string[];
  locations: string[];
  angle: string;
  notes: string;
}

export function parsePlan(raw: string): CampaignPlan {
  const o = extractJsonObject(raw, "The campaign plan");
  const queries = textList(o.queries, 10, 60);
  const locations = textList(o.locations, 15, 60);
  if (!queries.length || !locations.length) throw new Error("The plan needs at least one search and one location.");
  return {
    name: text(o.name, 80) || "New campaign",
    segment: isOneOf(PROSPECT_SEGMENTS, o.segment) ? o.segment : "LOCAL_SERVICE",
    queries,
    locations,
    angle: text(o.angle, 300),
    notes: text(o.notes, 500),
  };
}

/** Claude reads the goal and proposes a plan; the campaign starts as a DRAFT for a person to check. */
export async function planCampaign(actor: Actor, goal: string, deps: { provider?: ModelProvider } = {}) {
  assertCan(actor.role, "prospect:run");
  const g = goal.trim();
  if (g.length < 15 || g.length > 1500) throw new Error("Describe the goal in a sentence or two (15 to 1,500 characters).");
  const ask = () => callModel({ task: "campaign-plan", taskType: "requirements", systemPrompt: PLAN_PROMPT, userPrompt: g, provider: deps.provider });
  let plan: CampaignPlan;
  try {
    plan = parsePlan((await ask()).completion.text);
  } catch {
    // A short or vague goal sometimes gets a question back instead of a plan; one more try usually lands.
    plan = parsePlan((await ask()).completion.text);
  }
  const campaign = await prisma.$transaction(async (tx) => {
    const code = await nextCode("CAMP", tx);
    return tx.campaign.create({
      data: { code, name: plan.name, goal: g, segment: plan.segment, queries: encodeStringList(plan.queries), locations: encodeStringList(plan.locations), angle: plan.angle || null, createdBy: actor.label },
    });
  });
  await audit(actor, "campaign.planned", "Campaign", campaign.id, `${campaign.code}: ${plan.queries.length} searches × ${plan.locations.length} places${plan.notes ? `. Notes: ${plan.notes}` : ""}`);
  return { campaign, notes: plan.notes };
}

const intIn = (v: string | number | undefined, min: number, max: number, label: string, fallback: number) => {
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  return n;
};

export interface CampaignSettings {
  name?: string;
  angle?: string;
  segment?: string;
  queries?: string[];
  locations?: string[];
  placesSearchesPerDay?: string | number;
  webSearchesPerDay?: string | number;
  checksPerDay?: string | number;
  newContactsPerDay?: string | number;
  emailShare?: string | number;
  minFit?: string | number;
  followUpDays?: string;
}

export async function updateCampaign(actor: Actor, id: string, s: CampaignSettings) {
  assertCan(actor.role, "prospect:run");
  const c = await prisma.campaign.findUniqueOrThrow({ where: { id } });
  const queries = (s.queries ?? decodeStringList(c.queries)).map((q) => q.trim()).filter(Boolean).slice(0, 20);
  const locations = (s.locations ?? decodeStringList(c.locations)).map((q) => q.trim()).filter(Boolean).slice(0, 30);
  if (!queries.length || !locations.length) throw new Error("Keep at least one search and one location.");
  if (s.segment !== undefined && !isOneOf(PROSPECT_SEGMENTS, s.segment)) throw new Error("Pick a segment.");
  const followUps = s.followUpDays === undefined ? decodeStringList(c.followUpDays).map(Number) : parseFollowUps(s.followUpDays);
  const updated = await prisma.campaign.update({
    where: { id },
    data: {
      name: s.name?.trim().slice(0, 80) || c.name,
      angle: s.angle === undefined ? c.angle : s.angle.trim().slice(0, 300) || null,
      segment: s.segment ?? c.segment,
      queries: encodeStringList(queries),
      locations: encodeStringList(locations),
      // Plan changed: start walking it from the top again.
      searchCursor: s.queries || s.locations ? 0 : c.searchCursor,
      placesSearchesPerDay: intIn(s.placesSearchesPerDay, 0, 100, "Places searches a day", c.placesSearchesPerDay),
      webSearchesPerDay: intIn(s.webSearchesPerDay, 0, 20, "Web searches a day", c.webSearchesPerDay),
      checksPerDay: intIn(s.checksPerDay, 0, 500, "Checks a day", c.checksPerDay),
      newContactsPerDay: intIn(s.newContactsPerDay, 0, 1000, "New businesses contacted a day", c.newContactsPerDay),
      emailShare: intIn(s.emailShare, 0, 100, "Email share", c.emailShare),
      minFit: intIn(s.minFit, 0, 100, "Lowest fit to contact", c.minFit),
      followUpDays: JSON.stringify(followUps),
    },
  });
  await audit(actor, "campaign.updated", "Campaign", id, updated.code);
  return updated;
}

/** "3, 7" → [3, 7]: days after the previous message for each follow-up (at most 4 follow-ups). */
export function parseFollowUps(raw: string): number[] {
  const days = raw.split(/[,\s]+/).filter(Boolean).map(Number);
  if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 60)) throw new Error("Follow-up days are whole numbers from 1 to 60, e.g. “3, 7”.");
  if (days.length > 4) throw new Error("At most 4 follow-ups.");
  return days;
}

export async function setCampaignStatus(actor: Actor, id: string, status: string) {
  assertCan(actor.role, "prospect:run");
  if (!isOneOf(CAMPAIGN_STATUSES, status) || status === "DRAFT") throw new Error("Unknown campaign status.");
  const c = await prisma.campaign.update({ where: { id }, data: { status } });
  await audit(actor, "campaign.status_changed", "Campaign", id, `${c.code} → ${status}`);
  return c;
}

/** The next query × location to search, walking the plan in order and wrapping around. */
export function nextSearch(c: { queries: string; locations: string; searchCursor: number }): { query: string; location: string; cursor: number } | null {
  const queries = decodeStringList(c.queries);
  const locations = decodeStringList(c.locations);
  const total = queries.length * locations.length;
  if (!total) return null;
  const i = c.searchCursor % total;
  // Location-major: every search type in one city before moving to the next city.
  return { query: queries[i % queries.length], location: locations[Math.floor(i / queries.length)], cursor: i + 1 };
}

/** What each channel is producing, so the 50-50 split can be tuned from evidence. */
export async function campaignStats(campaignId: string) {
  const [prospects, byStatus, messages, leads] = await Promise.all([
    prisma.prospect.count({ where: { campaignId } }),
    prisma.prospect.groupBy({ by: ["status"], where: { campaignId }, _count: true }),
    prisma.outreachMessage.findMany({ where: { campaignId, status: "SENT" }, select: { channel: true, prospectId: true, step: true } }),
    prisma.prospect.count({ where: { campaignId, leadId: { not: null } } }),
  ]);
  const replied = new Set((await prisma.prospect.findMany({ where: { campaignId, repliedAt: { not: null } }, select: { id: true } })).map((p) => p.id));
  const channel = (c: "EMAIL" | "WHATSAPP") => {
    const sent = messages.filter((m) => m.channel === c);
    const reached = new Set(sent.map((m) => m.prospectId));
    const answered = [...reached].filter((id) => replied.has(id)).length;
    return { messages: sent.length, businesses: reached.size, replied: answered, replyRate: reached.size ? Math.round((answered / reached.size) * 1000) / 10 : 0 };
  };
  return {
    prospects,
    checked: byStatus.filter((s) => s.status !== "NEW").reduce((n, s) => n + s._count, 0),
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    email: channel("EMAIL"),
    whatsapp: channel("WHATSAPP"),
    leads,
  };
}
