import { headers } from "next/headers";

/**
 * Absolute base URL for links we hand to clients. NIRMAAN_OS_URL wins
 * (set it in production); otherwise it's derived from the request, which
 * is correct for local use.
 */
export async function baseUrl(): Promise<string> {
  const configured = process.env.NIRMAAN_OS_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
