import { prisma } from "../db/client";
import { audit } from "../audit";
import { nextCode } from "../ids";
import { assertCan } from "../auth/permissions";
import type { Actor } from "../auth/actor";
import { encodeStringList } from "../db/json";
import { isOneOf, PROSPECT_SEGMENTS, PROSPECT_SEGMENT_LABELS, type ProspectSegment } from "../db/enums";
import { createLead, validateIntake } from "../leads/intake";
import { dedupeKeyFor, nameKeyFor, normalEmail, normalUrl, ownDomain, packageName, suppressionKeys, suppressionValue } from "./basics";
import { placesConfigured, searchPlaces, type FoundBusiness } from "./places";
import { searchWeb } from "./webSearch";

/**
 * Prospecting, step 1: find businesses and keep them as prospects.
 * Later steps live in audit.ts (check the website, score the fit) and
 * outreach.ts (draft, approve, send). See /docs/product/prospecting.md.
 */
export type SearchSource = "PLACES" | "WEB";

export interface SearchInput {
  query: string;
  location: string;
  segment: string;
  sources: SearchSource[];
  max?: number;
  /** Set when a campaign runs the search; its prospects belong to that campaign. */
  campaignId?: string;
}

/** Swappable finders, so tests (and a future source) don't need the network. */
export interface Finders {
  places?: (query: string, location: string, max: number) => Promise<FoundBusiness[]>;
  web?: (query: string, location: string, segment: ProspectSegment, max: number) => Promise<FoundBusiness[]>;
  placesReady?: () => boolean;
}

export function validateSearch(input: SearchInput): { query: string; location: string; segment: ProspectSegment; sources: SearchSource[]; max: number } {
  const query = input.query.trim().replace(/\s+/g, " ");
  const location = input.location.trim().replace(/\s+/g, " ");
  if (query.length < 3 || query.length > 100) throw new Error("Say what kind of business to look for, e.g. “dental clinics” (3 to 100 characters).");
  if (location.length < 2 || location.length > 80) throw new Error("Say where to look, e.g. “Ahmedabad” or “Satellite, Ahmedabad”.");
  if (!isOneOf(PROSPECT_SEGMENTS, input.segment)) throw new Error("Pick who this search is for.");
  const sources = [...new Set(input.sources)].filter((s): s is SearchSource => s === "PLACES" || s === "WEB");
  if (!sources.length) throw new Error("Pick at least one place to search: Google Places or the web.");
  const max = Math.max(1, Math.min(input.max ?? 20, 20));
  return { query, location, segment: input.segment, sources, max };
}

export async function runProspectSearch(actor: Actor, input: SearchInput, finders: Finders = {}) {
  assertCan(actor.role, "prospect:run");
  const q = validateSearch(input);
  const places = finders.places ?? ((query, location, max) => searchPlaces(query, location, { max }));
  const web = finders.web ?? ((query, location, segment, max) => searchWeb(query, location, segment, { max }));
  const placesReady = finders.placesReady ?? placesConfigured;

  const found: FoundBusiness[] = [];
  const notes: string[] = [];
  const used: SearchSource[] = [];
  if (q.sources.includes("PLACES")) {
    if (!placesReady()) notes.push("Google Places skipped: GOOGLE_PLACES_API_KEY isn't set.");
    else {
      try {
        found.push(...(await places(q.query, q.location, q.max)));
        used.push("PLACES");
      } catch (err) {
        notes.push(`Google Places failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300));
      }
    }
  }
  if (q.sources.includes("WEB")) {
    try {
      found.push(...(await web(q.query, q.location, q.segment, Math.min(q.max, 15))));
      used.push("WEB");
    } catch (err) {
      notes.push(`Web search failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300));
    }
  }
  if (!used.length) throw new Error(notes.join(" ") || "Nothing to search with.");

  const search = await prisma.prospectSearch.create({
    data: { query: q.query, location: q.location, segment: q.segment, sources: encodeStringList(used), createdBy: actor.label, found: found.length, campaignId: input.campaignId ?? null },
  });
  let added = 0;
  let skipped = 0;
  for (const business of found) {
    const r = await upsertProspect(business, q.segment, search.id, input.campaignId ?? null);
    if (r === "added") added++;
    if (r === "suppressed") skipped++;
  }
  if (skipped) notes.push(`${skipped} on the do-not-contact list, left out.`);
  const updated = await prisma.prospectSearch.update({ where: { id: search.id }, data: { added, notes: notes.join(" ") || null } });
  await audit(actor, "prospect.search", "ProspectSearch", search.id, `“${q.query}” in ${q.location} via ${used.join("+")}: ${found.length} found, ${added} new`);
  return updated;
}

/** Adds a business, or fills gaps on the prospect it already is. Never changes a prospect's status. */
export async function upsertProspect(b: FoundBusiness, segment: ProspectSegment, searchId: string | null, campaignId: string | null = null): Promise<"added" | "merged" | "suppressed"> {
  const website = normalUrl(b.website);
  const email = normalEmail(b.email);
  if (await isSuppressed({ email, phone: b.phone, website })) return "suppressed";
  const dedupeKey = dedupeKeyFor({ placeId: b.placeId, website, name: b.name, city: b.city });
  const domain = ownDomain(website);
  const nameKey = nameKeyFor(b.name, b.city);
  // Same place, same own website, or same name in the same city: one business.
  const existing = await prisma.prospect.findFirst({
    where: { OR: [{ dedupeKey }, ...(b.placeId ? [{ placeId: b.placeId }] : []), ...(domain ? [{ domain }] : []), { nameKey }] },
    orderBy: { createdAt: "asc" },
  });
  const fields = {
    placeId: b.placeId ?? null,
    category: b.category ?? null,
    address: b.address ?? null,
    city: b.city ?? null,
    website,
    phone: b.phone ?? null,
    email,
    emailSource: email ? (b.emailSource ?? null) : null,
    rating: b.rating ?? null,
    ratingCount: b.ratingCount ?? null,
    mapsUrl: b.mapsUrl ?? null,
    sourceNote: b.sourceNote ?? null,
  };
  if (existing) {
    // Keep what we had; only fill what was missing.
    const gaps = Object.fromEntries(Object.entries({ ...fields, domain, campaignId }).filter(([k, v]) => v !== null && (existing as Record<string, unknown>)[k] == null));
    if (Object.keys(gaps).length) await prisma.prospect.update({ where: { id: existing.id }, data: gaps });
    return "merged";
  }
  await prisma.$transaction(async (tx) => {
    const code = await nextCode("PROS", tx);
    await tx.prospect.create({ data: { ...fields, code, dedupeKey, domain, nameKey, name: b.name, segment, source: b.source, searchId, campaignId } });
  });
  return "added";
}

export async function isSuppressed(p: { email?: string | null; phone?: string | null; website?: string | null }): Promise<boolean> {
  const keys = suppressionKeys(p);
  if (!keys.length) return false;
  return (await prisma.suppression.count({ where: { value: { in: keys } } })) > 0;
}

/** Adds an email, phone or domain to the do-not-contact list. */
export async function addSuppression(actor: Actor, raw: string, reason: string) {
  assertCan(actor.role, "prospect:run");
  const value = suppressionValue(raw);
  if (!value) throw new Error("Enter an email address, a phone number or a website.");
  const why = reason.trim().slice(0, 300) || "Asked not to be contacted";
  await prisma.suppression.upsert({ where: { value }, create: { value, reason: why, createdBy: actor.label }, update: {} });
  // Anything matching it stops here too.
  const matching = await prisma.prospect.findMany({ where: { status: { notIn: ["CONVERTED", "DO_NOT_CONTACT"] } } });
  for (const p of matching.filter((p) => suppressionKeys(p).includes(value))) await stopProspect(p.id, why, actor.label);
  await audit(actor, "prospect.suppressed", "Suppression", value, why);
  return value;
}

export async function removeSuppression(actor: Actor, value: string) {
  assertCan(actor.role, "outreach:send");
  await prisma.suppression.deleteMany({ where: { value } });
  await audit(actor, "prospect.unsuppressed", "Suppression", value);
}

/** This business asked not to be contacted: list its email, phone and domain, and cancel its drafts. */
export async function doNotContact(actor: Actor, prospectId: string, reason: string) {
  assertCan(actor.role, "prospect:run");
  const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  const why = reason.trim().slice(0, 300) || "Asked not to be contacted";
  await stopProspect(p.id, `${p.code}: ${why}`, actor.label);
  await audit(actor, "prospect.do_not_contact", "Prospect", p.id, `${p.code}: ${why}`);
}

/**
 * No more outreach to this business, ever: its email, phone and domain go on
 * the do-not-contact list and anything waiting (drafts, queued emails) is
 * cancelled. Used by the button, the list, and the inbox check on "stop".
 */
export async function stopProspect(id: string, reason: string, createdBy: string) {
  const p = await prisma.prospect.findUniqueOrThrow({ where: { id } });
  for (const value of suppressionKeys(p)) {
    await prisma.suppression.upsert({ where: { value }, create: { value, reason: reason.slice(0, 300), createdBy }, update: {} });
  }
  await prisma.outreachMessage.updateMany({ where: { prospectId: id, status: { in: ["DRAFT", "APPROVED"] } }, data: { status: "CANCELLED", scheduledFor: null } });
  await prisma.prospect.update({ where: { id }, data: { status: "DO_NOT_CONTACT" } });
}

/** Corrects or adds contact details a person found (e.g. an email from a call or their Instagram bio). */
export async function updateProspectContact(actor: Actor, prospectId: string, input: { email: string; phone: string; website: string }) {
  assertCan(actor.role, "prospect:run");
  const email = input.email.trim() ? normalEmail(input.email) : null;
  if (input.email.trim() && !email) throw new Error("That email address doesn't look right.");
  const website = input.website.trim() ? normalUrl(input.website) : null;
  if (input.website.trim() && !website) throw new Error("That website address doesn't look right.");
  const phone = input.phone.trim().slice(0, 40) || null;
  const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  const emailChanged = email !== p.email;
  await prisma.prospect.update({
    where: { id: p.id },
    data: { email, phone, website, domain: ownDomain(website), emailSource: emailChanged ? (email ? `Added by ${actor.label}` : null) : p.emailSource },
  });
  await audit(actor, "prospect.contact_updated", "Prospect", p.id, p.code);
}

/** Manual status moves. CONTACTED comes from sending, CONVERTED from convertToLead, DO_NOT_CONTACT from doNotContact. */
const MANUAL: Record<string, string[]> = {
  REPLIED: ["CONTACTED"],
  DISMISSED: ["NEW", "AUDITED", "DRAFTED", "CONTACTED", "REPLIED"],
  NEW: ["DISMISSED"],
};

export async function setProspectStatus(actor: Actor, prospectId: string, to: string, reason?: string) {
  assertCan(actor.role, "prospect:run");
  const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  if (!MANUAL[to]?.includes(p.status)) throw new Error(`A prospect can't move from ${p.status.toLowerCase()} to ${to.toLowerCase()} by hand.`);
  if (to === "DISMISSED" && !reason?.trim()) throw new Error("Say why it's not a fit. It sharpens future searches.");
  const reopened = to === "NEW" ? (p.auditedAt ? "AUDITED" : "NEW") : to;
  if (to === "REPLIED") {
    // Stops every waiting follow-up, the same as a reply found in the inbox.
    const { markReplied } = await import("./outreach");
    await markReplied(p.id);
    await audit(actor, "prospect.status_changed", "Prospect", p.id, `${p.status} → REPLIED`);
    return;
  }
  await prisma.prospect.update({ where: { id: p.id }, data: { status: reopened, dismissedReason: to === "DISMISSED" ? reason!.trim().slice(0, 300) : p.dismissedReason } });
  if (to === "DISMISSED") await prisma.outreachMessage.updateMany({ where: { prospectId: p.id, status: { in: ["DRAFT", "APPROVED"] } }, data: { status: "CANCELLED", scheduledFor: null } });
  await audit(actor, "prospect.status_changed", "Prospect", p.id, `${p.status} → ${reopened}${reason ? `: ${reason}` : ""}`);
}

/**
 * They replied and want to talk: create a lead (source OUTBOUND) from what
 * they told us, and link it. From here it's the normal pipeline.
 */
export async function convertToLead(actor: Actor, prospectId: string, input: { problem: string; contactName: string; contactEmail: string; contactPhone?: string }) {
  assertCan(actor.role, "lead:write");
  const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  if (p.leadId) throw new Error("This prospect is already a lead.");
  if (p.status === "DO_NOT_CONTACT") throw new Error("This business is on the do-not-contact list.");
  const result = validateIntake({
    problem: input.problem,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone || p.phone || "",
    company: p.name.slice(0, 200),
    business: [p.category, p.city].filter(Boolean).join(", ").slice(0, 1000),
    interest: p.suggestedPackage ? `${packageName(p.suggestedPackage)} package (suggested from outbound prospecting)` : "",
  });
  if (!result.ok) throw new Error(Object.values(result.errors).join(" "));
  const lead = await createLead(actor, result.data, "OUTBOUND");
  await prisma.prospect.update({ where: { id: p.id }, data: { leadId: lead.id, status: "CONVERTED" } });
  await audit(actor, "prospect.converted", "Prospect", p.id, `${p.code} → ${lead.code}`);
  return lead;
}

export function segmentLabel(segment: string): string {
  return isOneOf(PROSPECT_SEGMENTS, segment) ? PROSPECT_SEGMENT_LABELS[segment] : segment;
}
