import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db/client";
import { hashPassword, verifyPassword, passwordProblem } from "./password";
import { generateToken, hashToken, looksLikeToken } from "./tokens";
import { CAPABILITIES, ROLE_CAPABILITIES, can, assertCan, ForbiddenError } from "./permissions";
import { createSession, userForToken, deleteSession, authenticate, SESSION_TTL_MS } from "./sessionStore";
import { ROLES } from "../db/enums";
import { uniqueEmail } from "../testHelpers/businessFixtures";

test("passwords: hash verifies, wrong password and malformed hashes don't", async () => {
  const hash = await hashPassword("correct horse battery");
  assert.match(hash, /^scrypt\$32768\$8\$1\$/);
  assert.equal(await verifyPassword("correct horse battery", hash), true);
  assert.equal(await verifyPassword("correct horse batterY", hash), false);
  assert.equal(await verifyPassword("anything", "not-a-hash"), false);
  assert.notEqual(await hashPassword("correct horse battery"), hash, "salted: same password, different hash");
});

test("passwords: length policy is enforced on hashing", async () => {
  assert.ok(passwordProblem("short"));
  assert.equal(passwordProblem("twelve chars"), null);
  await assert.rejects(() => hashPassword("short"), /at least 12/);
});

test("tokens: 256-bit url-safe, hashed deterministically, shape-checked", () => {
  const t = generateToken();
  assert.equal(looksLikeToken(t), true);
  assert.equal(hashToken(t), hashToken(t));
  assert.notEqual(generateToken(), t);
  assert.equal(looksLikeToken("../../etc/passwd"), false);
  assert.equal(looksLikeToken(undefined), false);
});

test("permissions: every role maps only to known capabilities", () => {
  for (const role of ROLES) {
    for (const cap of ROLE_CAPABILITIES[role]) assert.ok(CAPABILITIES.includes(cap), `${role} has unknown ${cap}`);
  }
});

test("permissions: least privilege holds for the sensitive capabilities", () => {
  assert.equal(can("FOUNDER", "user:manage"), true);
  assert.equal(can("CTO", "user:manage"), false);
  assert.equal(can("ENGINEER", "proposal:send"), false);
  assert.equal(can("ENGINEER", "economics:read"), false);
  assert.equal(can("PROJECT_MANAGER", "approval:decide"), false, "gates are decided by founder/CTO");
  assert.equal(can("PROJECT_MANAGER", "change:decide"), false, "accepting cost impact is a founder/CTO call");
  assert.equal(can("FINANCE", "economics:read"), true);
  assert.equal(can("SUPPORT", "economics:read"), false);
  for (const cap of CAPABILITIES.filter((c) => !c.startsWith("client:"))) {
    assert.equal(can("CLIENT_ADMIN", cap), false, `client role must not get ${cap}`);
  }
  assert.equal(can(undefined, "lead:read"), false);
  assert.equal(can("NOT_A_ROLE", "lead:read"), false);
  assert.throws(() => assertCan("DESIGNER", "lead:write"), ForbiddenError);
});

test("sessions: token resolves to the user, expires, and can be revoked", async () => {
  const user = await prisma.user.create({
    data: { email: uniqueEmail(), name: "Session Fixture", role: "ENGINEER", passwordHash: await hashPassword("a long enough password") },
  });
  try {
    const { token, expiresAt } = await createSession(user.id);
    assert.ok(Math.abs(expiresAt.getTime() - Date.now() - SESSION_TTL_MS) < 5000);
    assert.equal((await userForToken(token))?.id, user.id);
    assert.equal(await userForToken(generateToken()), null, "unknown token");
    assert.equal(await userForToken("garbage"), null, "malformed token never hits the db");

    const later = new Date(Date.now() + SESSION_TTL_MS + 1000);
    assert.equal(await userForToken(token, later), null, "expired");
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0, "expired session is deleted");

    const second = await createSession(user.id);
    await deleteSession(second.token);
    assert.equal(await userForToken(second.token), null, "revoked");

    const third = await createSession(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    assert.equal(await userForToken(third.token), null, "deactivated user loses access immediately");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("authenticate: right password only, case-insensitive email, inactive users refused", async () => {
  const email = uniqueEmail();
  const user = await prisma.user.create({
    data: { email, name: "Login Fixture", role: "FOUNDER", passwordHash: await hashPassword("a long enough password") },
  });
  try {
    assert.equal((await authenticate(email.toUpperCase(), "a long enough password"))?.id, user.id);
    assert.equal(await authenticate(email, "wrong password here"), null);
    assert.equal(await authenticate(uniqueEmail(), "a long enough password"), null);
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    assert.equal(await authenticate(email, "a long enough password"), null);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
