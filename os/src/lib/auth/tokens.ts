import { createHash, randomBytes } from "node:crypto";

/**
 * Bearer secrets (session cookies, client capability links). 256 bits of
 * randomness; only the SHA-256 hash is ever stored, so a database leak
 * doesn't hand out working sessions or proposal links.
 */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Cheap shape check before touching the database with an attacker-supplied value. */
export function looksLikeToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
