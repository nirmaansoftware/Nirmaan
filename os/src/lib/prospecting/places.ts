/**
 * Google Places (the "Places API (New)" Text Search): the most reliable list
 * of local businesses in India, with website, phone and rating.
 *
 * Needs GOOGLE_PLACES_API_KEY (a Google Cloud key restricted to the Places
 * API). Each search is one billed request; see /docs/product/prospecting.md
 * for cost and Google's terms on keeping Places data.
 */
export interface FoundBusiness {
  source: "PLACES" | "WEB";
  placeId?: string;
  name: string;
  category?: string;
  address?: string;
  city?: string;
  website?: string;
  phone?: string;
  email?: string;
  emailSource?: string;
  rating?: number;
  ratingCount?: number;
  mapsUrl?: string;
  sourceNote?: string;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.primaryTypeDisplayName",
  "places.businessStatus",
].join(",");

export class PlacesNotConfiguredError extends Error {
  constructor() {
    super("Google Places isn't set up (GOOGLE_PLACES_API_KEY is empty).");
    this.name = "PlacesNotConfiguredError";
  }
}

export function placesConfigured(): boolean {
  return !!process.env.GOOGLE_PLACES_API_KEY?.trim();
}

export async function searchPlaces(
  query: string,
  location: string,
  opts: { max?: number; apiKey?: string; fetchImpl?: FetchLike } = {}
): Promise<FoundBusiness[]> {
  const apiKey = opts.apiKey ?? process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) throw new PlacesNotConfiguredError();
  const doFetch = opts.fetchImpl ?? fetch;

  const res = await doFetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELDS },
    body: JSON.stringify({ textQuery: `${query} in ${location}`, pageSize: Math.min(opts.max ?? 20, 20), languageCode: "en", regionCode: "IN" }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    // Google's error body names the problem (bad key, API not enabled, quota); pass its message, never the key.
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(`Google Places said no (${res.status}): ${body?.error?.message ?? res.statusText}`.slice(0, 300));
  }
  return parsePlaces(await res.json(), location);
}

/** Turns a Text Search response into businesses; skips permanently closed ones and anything without a name. */
export function parsePlaces(body: unknown, location: string): FoundBusiness[] {
  const places = (body as { places?: unknown[] } | null)?.places;
  if (!Array.isArray(places)) return [];
  const out: FoundBusiness[] = [];
  for (const raw of places) {
    const p = raw as Record<string, unknown>;
    const name = (p.displayName as { text?: string } | undefined)?.text?.trim();
    if (!name || p.businessStatus === "CLOSED_PERMANENTLY") continue;
    out.push({
      source: "PLACES",
      placeId: typeof p.id === "string" ? p.id : undefined,
      name: name.slice(0, 200),
      category: (p.primaryTypeDisplayName as { text?: string } | undefined)?.text?.slice(0, 100),
      address: typeof p.formattedAddress === "string" ? p.formattedAddress.slice(0, 300) : undefined,
      city: location.slice(0, 100),
      website: typeof p.websiteUri === "string" ? p.websiteUri : undefined,
      phone: typeof p.internationalPhoneNumber === "string" ? p.internationalPhoneNumber : typeof p.nationalPhoneNumber === "string" ? p.nationalPhoneNumber : undefined,
      rating: typeof p.rating === "number" ? p.rating : undefined,
      ratingCount: typeof p.userRatingCount === "number" ? p.userRatingCount : undefined,
      mapsUrl: typeof p.googleMapsUri === "string" ? p.googleMapsUri : undefined,
    });
  }
  return out;
}
