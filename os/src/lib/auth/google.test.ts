import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { prisma } from "../db/client";
import { decodeIdToken, finishSignIn, publicUrl, redirectUri, startSignIn, userForGoogleEmail, verifiedEmail } from "./google";

const env = { GOOGLE_CLIENT_ID: "client-123.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "secret" } as unknown as NodeJS.ProcessEnv;
const run = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const token = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
const good = { iss: "https://accounts.google.com", aud: env.GOOGLE_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 600, email: "Owner@Example.com", email_verified: true };

after(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: run } } });
});

test("start: PKCE S256 challenge matches the verifier; state and next travel in the cookie", () => {
  const { url, cookie } = startSignIn("http://localhost:3000", "/os/growth", env);
  const u = new URL(url);
  const saved = JSON.parse(cookie);
  assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(u.searchParams.get("client_id"), env.GOOGLE_CLIENT_ID);
  assert.equal(u.searchParams.get("redirect_uri"), "http://localhost:3000/api/auth/google/callback");
  assert.equal(u.searchParams.get("state"), saved.state);
  assert.equal(u.searchParams.get("code_challenge"), createHash("sha256").update(saved.verifier).digest("base64url"));
  assert.equal(u.searchParams.get("scope"), "openid email");
  assert.equal(saved.next, "/os/growth");
  assert.equal(redirectUri("http://x", { ...env, NIRMAAN_OS_URL: "https://os.nirmaan.online/" } as unknown as NodeJS.ProcessEnv), "https://os.nirmaan.online/api/auth/google/callback");
});

test("token checks: Google-issued, for this app, unexpired, verified email", () => {
  assert.equal(verifiedEmail(decodeIdToken(token(good)), env.GOOGLE_CLIENT_ID!), "owner@example.com");
  assert.throws(() => verifiedEmail({ ...good, iss: "https://evil.example" }, env.GOOGLE_CLIENT_ID!), /didn't come from Google/);
  assert.throws(() => verifiedEmail({ ...good, aud: "other-app" }, env.GOOGLE_CLIENT_ID!), /different app/);
  assert.throws(() => verifiedEmail({ ...good, exp: 1 }, env.GOOGLE_CLIENT_ID!), /expired/);
  assert.throws(() => verifiedEmail({ ...good, email_verified: false }, env.GOOGLE_CLIENT_ID!), /isn't verified/);
  assert.throws(() => decodeIdToken("nonsense"), /no ID token/);
});

test("finish: the code and verifier are exchanged server to server; Google's refusal is reported", async () => {
  let sent: URLSearchParams | null = null;
  const ok = (async (_url: string | URL, init?: RequestInit) => {
    sent = new URLSearchParams(String(init?.body));
    return new Response(JSON.stringify({ id_token: token(good) }), { status: 200 });
  }) as typeof fetch;
  assert.equal(await finishSignIn({ code: "c1", verifier: "v1", origin: "http://localhost:3000" }, { fetchImpl: ok, env }), "owner@example.com");
  assert.equal(sent!.get("code_verifier"), "v1");
  assert.equal(sent!.get("grant_type"), "authorization_code");
  const bad = (async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "Bad Request" }), { status: 400 })) as unknown as typeof fetch;
  await assert.rejects(() => finishSignIn({ code: "c", verifier: "v", origin: "http://x" }, { fetchImpl: bad, env }), /Bad Request/);
});

test("who may sign in: only an active user with that exact email", async () => {
  const email = `owner-${run}@example.test`;
  await prisma.user.create({ data: { email, name: "Owner", role: "FOUNDER", passwordHash: "x" } });
  assert.equal((await userForGoogleEmail(email))?.email, email);
  assert.equal(await userForGoogleEmail(`stranger-${run}@example.test`), null);
  await prisma.user.update({ where: { email }, data: { active: false } });
  assert.equal(await userForGoogleEmail(email), null);
});

test("behind a proxy, redirects use the public address, never the internal one", () => {
  const live = { NIRMAAN_OS_URL: "https://os.nirmaan.online" } as unknown as NodeJS.ProcessEnv;
  assert.equal(publicUrl("/os", "https://localhost:3000", live).toString(), "https://os.nirmaan.online/os");
  assert.equal(publicUrl("/login?error=google-expired", "https://localhost:3000", live).toString(), "https://os.nirmaan.online/login?error=google-expired");
  assert.equal(publicUrl("/os", "http://localhost:3000", {} as unknown as NodeJS.ProcessEnv).toString(), "http://localhost:3000/os", "locally, the request's own address");
});
