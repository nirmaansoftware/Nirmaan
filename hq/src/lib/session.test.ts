import { test } from "node:test";
import assert from "node:assert/strict";
import { authBypassed, isAllowed, safeNext, signSession, verifySession } from "./session";

const SECRET = "x".repeat(40);

test("a signed session verifies and returns its login", async () => {
  const cookie = await signSession("founder-login", SECRET);
  assert.equal(await verifySession(cookie, SECRET), "founder-login");
});

test("a tampered payload or signature is rejected (must-fail)", async () => {
  const cookie = await signSession("founder-login", SECRET);
  const [payload, sig] = cookie.split(".");
  const forged = Buffer.from(JSON.stringify({ l: "attacker", e: Date.now() + 1e9 })).toString("base64url");
  assert.equal(await verifySession(`${forged}.${sig}`, SECRET), null);
  assert.equal(await verifySession(`${payload}.${sig.slice(0, -2)}AA`, SECRET), null);
  assert.equal(await verifySession(cookie, "y".repeat(40)), null);
  assert.equal(await verifySession("garbage", SECRET), null);
  assert.equal(await verifySession(undefined, SECRET), null);
});

test("an expired session is rejected", async () => {
  const old = await signSession("founder-login", SECRET, Date.now() - 8 * 86_400_000);
  assert.equal(await verifySession(old, SECRET), null);
});

test("only allowed logins pass, case-insensitively", () => {
  assert.equal(isAllowed("Founder-Login", "founder-login, second-login"), true);
  assert.equal(isAllowed("second-login", "founder-login,second-login"), true);
  assert.equal(isAllowed("someone-else", "founder-login,second-login"), false);
  assert.equal(isAllowed("anyone", ""), false);
});

test("post-login redirects stay on hq", () => {
  assert.equal(safeNext("/agents?x=1"), "/agents?x=1");
  assert.equal(safeNext("//evil.example"), "/");
  assert.equal(safeNext("/\\evil.example"), "/");
  assert.equal(safeNext("https://evil.example"), "/");
  assert.equal(safeNext(null), "/");
});

test("HQ_AUTH=off works on the Mac and never on Vercel (must-fail)", () => {
  assert.equal(authBypassed({ HQ_AUTH: "off" }), true);
  assert.equal(authBypassed({ HQ_AUTH: "off", VERCEL: "1" }), false);
  assert.equal(authBypassed({}), false);
  assert.equal(authBypassed({ HQ_AUTH: "on" }), false);
});
