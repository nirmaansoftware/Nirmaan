/**
 * hq's session: a signed cookie, no database. The value is
 * base64url(JSON {l: GitHub login, e: expiry ms}) + "." + base64url(HMAC-SHA256).
 * Web Crypto only, so the same code runs in the proxy and in route handlers.
 * The GitHub access token is never stored: login is checked once, at sign-in.
 */

export const SESSION_COOKIE = "hq_session";
export const STATE_COOKIE = "hq_oauth_state";
export const SESSION_DAYS = 7;

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** Constant-time comparison of two byte arrays. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function sameText(a: string, b: string): boolean {
  return sameBytes(enc.encode(a), enc.encode(b));
}

export async function signSession(login: string, secret: string, now = Date.now()): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ l: login, e: now + SESSION_DAYS * 86_400_000 })));
  return `${payload}.${b64url(await hmac(secret, payload))}`;
}

/** The login inside a valid, unexpired session cookie, or null. */
export async function verifySession(value: string | undefined, secret: string, now = Date.now()): Promise<string | null> {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  try {
    if (!sameBytes(fromB64url(sig), await hmac(secret, payload))) return null;
    const { l, e } = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { l?: string; e?: number };
    if (typeof l !== "string" || typeof e !== "number" || e <= now) return null;
    return l;
  } catch {
    return null;
  }
}

/** HQ_ALLOWED_LOGINS: comma-separated GitHub logins, compared case-insensitively. */
export function isAllowed(login: string, allowed = process.env.HQ_ALLOWED_LOGINS ?? ""): boolean {
  const list = allowed.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(login.toLowerCase());
}

/** Only same-site paths survive as a post-login destination. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

/**
 * HQ_AUTH=off turns the gate off for running on the founder's Mac only. It is
 * ignored wherever Vercel runs the app (Vercel always sets VERCEL=1), so a
 * mistaken setting there can never open the site.
 */
export function authBypassed(env: Record<string, string | undefined> = process.env): boolean {
  return env.HQ_AUTH === "off" && !env.VERCEL;
}
