/**
 * Shared basics for prospecting: what Nirmaan sells (so a prospect can be
 * matched to a package), and the normalisers that make "the same business"
 * and "do not contact" checks reliable.
 */

/**
 * The public packages, as the website's pricing page states them
 * (website/src/_data/pricing.json). Keep in step with that file.
 */
export const PACKAGES = [
  { id: "starter", name: "Starter", from: 15000, for: "A professional website that brings in enquiries (clinics, consultants, service businesses)." },
  { id: "growth", name: "Growth", from: 35000, for: "An online store or booking flow with payments (shops, restaurants, schools, D2C brands)." },
  { id: "system", name: "System", from: 60000, for: "A web application that replaces a spreadsheet-and-WhatsApp workflow (order tracking, internal tools, portals)." },
  { id: "platform", name: "Platform", from: 80000, for: "A full platform: many users, integrations, AI features (SaaS, marketplaces, AI-assisted operations)." },
] as const;
export type PackageId = (typeof PACKAGES)[number]["id"];

export function isPackageId(value: unknown): value is PackageId {
  return PACKAGES.some((p) => p.id === value);
}

export function packageName(id: string | null | undefined): string {
  return PACKAGES.find((p) => p.id === id)?.name ?? "—";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Adds https:// to a bare "example.com", leaves any address that already has a scheme alone. */
export function withScheme(url: string): string {
  const u = url.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : `https://${u}`;
}

export function normalEmail(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().toLowerCase();
  return EMAIL_RE.test(v) && v.length <= 254 ? v : null;
}

/** Digits only, with India's country code when a 10-digit mobile is given. */
export function normalPhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits.length === 10 ? `91${digits}` : digits;
}

/**
 * WhatsApp needs a mobile. Indian mobiles are 10 digits starting 6–9, written
 * "98250 12345" or "9825012345". Landlines are written with their area code
 * as its own group ("079 2656 0004", "+91 79 2656 0004"), and Ahmedabad's 79
 * would otherwise pass for a mobile prefix.
 */
export function isWhatsappable(phone: string | null | undefined): boolean {
  const d = normalPhone(phone);
  if (!d) return false;
  if (!d.startsWith("91")) return d.length >= 10;
  if (!/^91[6-9]\d{9}$/.test(d)) return false;
  const rest = (phone ?? "").trim().replace(/^(\+?91[\s-]*|0)/, "");
  const firstGroup = /^(\d+)[\s-]/.exec(rest)?.[1];
  return !(firstGroup && firstGroup.length >= 2 && firstGroup.length <= 4);
}

/** "https://www.Example.com/contact" → "example.com". Null for anything that isn't a web address. */
export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(withScheme(url));
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

/** An http(s) URL we can store and link to, or null. */
export function normalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(withScheme(url));
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * One key per real business, so two searches (or two sources) finding the
 * same place make one prospect: its Google place, else its website domain,
 * else its name in its city.
 */
export function dedupeKeyFor(p: { placeId?: string | null; website?: string | null; name: string; city?: string | null }): string {
  if (p.placeId) return `place:${p.placeId}`;
  const domain = ownDomain(p.website);
  if (domain) return `domain:${domain}`;
  return `name:${nameKeyFor(p.name, p.city)}`;
}

/** The business's own website domain; null for directory and social pages, which many businesses share. */
export function ownDomain(url: string | null | undefined): string | null {
  const domain = domainOf(url);
  return domain && !SHARED_HOSTS.some((h) => domain === h || domain.endsWith(`.${h}`)) ? domain : null;
}

/** "Smile Dental Clinic", "Ahmedabad" → "smile dental clinic|ahmedabad". */
export function nameKeyFor(name: string, city?: string | null): string {
  const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
  return `${slug(name)}|${slug(city ?? "")}`;
}

/** Hosts shared by many businesses (listings, social pages, site builders' free subdomains stay distinct). */
const SHARED_HOSTS = ["facebook.com", "instagram.com", "justdial.com", "indiamart.com", "google.com", "linktr.ee", "wa.me", "whatsapp.com", "youtube.com", "linkedin.com", "x.com", "twitter.com", "zomato.com", "swiggy.com", "practo.com", "sulekha.com"];

export function isSharedHost(url: string | null | undefined): boolean {
  const d = domainOf(url);
  return !!d && SHARED_HOSTS.some((h) => d === h || d.endsWith(`.${h}`));
}

/** What a Suppression row may hold for this prospect: its email, phone and own domain. */
export function suppressionKeys(p: { email?: string | null; phone?: string | null; website?: string | null }): string[] {
  const keys = [normalEmail(p.email), normalPhone(p.phone)];
  const emailDomain = normalEmail(p.email)?.split("@")[1];
  if (p.website && !isSharedHost(p.website)) keys.push(domainOf(p.website));
  // A company-domain email (not gmail etc.) also blocks that domain.
  if (emailDomain && !FREE_MAIL.includes(emailDomain)) keys.push(emailDomain);
  return [...new Set(keys.filter((k): k is string => !!k))];
}

const FREE_MAIL = ["gmail.com", "yahoo.com", "yahoo.co.in", "hotmail.com", "outlook.com", "rediffmail.com", "icloud.com", "live.com", "proton.me", "protonmail.com"];

/** Normalises what someone types into the do-not-contact box. */
export function suppressionValue(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.includes("@")) return normalEmail(v);
  if (/^[+\d\s()-]+$/.test(v)) return normalPhone(v);
  return domainOf(v);
}
