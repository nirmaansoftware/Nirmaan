import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../db/client";

/**
 * "Sign in with Google" (OpenID Connect, authorization code + PKCE), with
 * no extra dependency.
 *
 * Who may sign in: only an ACTIVE user already in the OS whose email matches
 * the Google account's verified email. Google proves who you are; the OS
 * decides what you may do (roles and capabilities, e.g. growth:read for the
 * owners' Growth dashboard). Nobody gets an account by signing in.
 *
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   an OAuth client of type "Web application"
 *   NIRMAAN_OS_URL                           the OS's own address, for the redirect back
 *
 * The ID token comes straight from Google's token endpoint over TLS, so per
 * OpenID Connect Core §3.1.3.7 its signature needn't be re-checked; its
 * issuer, audience, expiry and email_verified are.
 */
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_COOKIE = "nirmaan_google";

export function googleConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());
}

/**
 * The address people use to reach the OS. Behind a proxy (Fly.io) the app
 * only sees its internal one (https://localhost:3000), so every redirect and
 * callback address comes from NIRMAAN_OS_URL when it's set.
 */
export function publicOrigin(requestOrigin: string, env: NodeJS.ProcessEnv = process.env): string {
  return (env.NIRMAAN_OS_URL?.trim() || requestOrigin).replace(/\/+$/, "");
}

/** An absolute URL on the OS's public address, e.g. for a redirect after sign-in. */
export function publicUrl(path: string, requestOrigin: string, env: NodeJS.ProcessEnv = process.env): URL {
  return new URL(path, `${publicOrigin(requestOrigin, env)}/`);
}

export function redirectUri(origin: string, env: NodeJS.ProcessEnv = process.env): string {
  return `${publicOrigin(origin, env)}/api/auth/google/callback`;
}

/** A fresh state and PKCE pair, and the Google URL to send the browser to. */
export function startSignIn(origin: string, next: string, env: NodeJS.ProcessEnv = process.env) {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!.trim(),
    redirect_uri: redirectUri(origin, env),
    response_type: "code",
    scope: "openid email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  // What the callback needs to check this round trip, kept in a short-lived httpOnly cookie.
  const cookie = JSON.stringify({ state, verifier, next });
  return { url: url.toString(), cookie };
}

export interface IdClaims {
  iss?: string;
  aud?: string;
  exp?: number;
  email?: string;
  email_verified?: boolean | string;
}

/** Reads an ID token's claims (the payload), without trusting anything yet. */
export function decodeIdToken(token: string): IdClaims {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("Google's reply had no ID token.");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as IdClaims;
}

/** The verified email the token proves, or an error saying exactly what's wrong with it. */
export function verifiedEmail(claims: IdClaims, clientId: string, now = Date.now()): string {
  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") throw new Error("The sign-in didn't come from Google.");
  if (claims.aud !== clientId) throw new Error("The sign-in was meant for a different app.");
  if (!claims.exp || claims.exp * 1000 < now) throw new Error("The sign-in expired. Try again.");
  if (claims.email_verified !== true && claims.email_verified !== "true") throw new Error("That Google account's email isn't verified.");
  if (!claims.email) throw new Error("Google didn't share an email address.");
  return claims.email.trim().toLowerCase();
}

/** Swaps the code for an ID token (server to server) and returns the verified email. */
export async function finishSignIn(
  input: { code: string; verifier: string; origin: string },
  opts: { fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv } = {}
): Promise<string> {
  const env = opts.env ?? process.env;
  const res = await (opts.fetchImpl ?? fetch)(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: env.GOOGLE_CLIENT_ID!.trim(),
      client_secret: env.GOOGLE_CLIENT_SECRET!.trim(),
      redirect_uri: redirectUri(input.origin, env),
      grant_type: "authorization_code",
      code_verifier: input.verifier,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id_token?: string; error_description?: string; error?: string };
  if (!res.ok || !body.id_token) throw new Error(`Google sign-in failed: ${body.error_description ?? body.error ?? res.status}`);
  return verifiedEmail(decodeIdToken(body.id_token), env.GOOGLE_CLIENT_ID!.trim());
}

/** The OS user this Google account may sign in as: active, and with exactly this email. */
export async function userForGoogleEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) return null;
  return prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
}
