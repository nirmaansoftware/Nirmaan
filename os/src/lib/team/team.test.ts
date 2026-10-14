import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db/client";
import { createUser, setUserActive, setUserRole } from "./service";
import { actorAs, uniqueEmail } from "../testHelpers/businessFixtures";
import { createSession } from "../auth/sessionStore";

test("team: only user:manage can create accounts; weak passwords and duplicates are refused", async () => {
  const email = uniqueEmail();
  await assert.rejects(() => createUser(actorAs("CTO"), { email, name: "X", role: "ENGINEER", password: "a long enough password" }), /permission/);
  await assert.rejects(() => createUser(actorAs("FOUNDER"), { email, name: "X", role: "ENGINEER", password: "short" }), /at least 12/);
  await assert.rejects(() => createUser(actorAs("FOUNDER"), { email, name: "X", role: "CLIENT_ADMIN", password: "a long enough password" }), /must belong to a client/);
  const user = await createUser(actorAs("FOUNDER"), { email, name: "Eng", role: "ENGINEER", password: "a long enough password" });
  try {
    await assert.rejects(() => createUser(actorAs("FOUNDER"), { email: email.toUpperCase(), name: "Y", role: "QA", password: "a long enough password" }), /already/);

    await createSession(user.id);
    const founder = { ...actorAs("FOUNDER"), id: "someone-else" };
    await setUserRole(founder, user.id, "QA");
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0, "role change signs the user out");
    await createSession(user.id);
    await setUserActive(founder, user.id, false);
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0, "deactivation signs the user out");
  } finally {
    await prisma.auditLog.deleteMany({ where: { entityId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("Google-only accounts: created without a password, and no password ever opens them", async () => {
  const { authenticate } = await import("../auth/sessionStore");
  const { NO_PASSWORD, passwordLoginEnabled } = await import("../auth/password");
  const email = `google-only-${Date.now()}@example.test`;
  const user = await createUser(actorAs("FOUNDER"), { email, name: "Owner", role: "FOUNDER" });
  try {
    assert.equal(user.passwordHash, NO_PASSWORD);
    for (const guess of ["", NO_PASSWORD, "!google-only", "a long enough password"]) {
      assert.equal(await authenticate(email, guess), null, `refused: ${JSON.stringify(guess)}`);
    }
    assert.equal(passwordLoginEnabled({} as unknown as NodeJS.ProcessEnv), true);
    assert.equal(passwordLoginEnabled({ NIRMAAN_PASSWORD_LOGIN: "OFF" } as unknown as NodeJS.ProcessEnv), false);
  } finally {
    await prisma.auditLog.deleteMany({ where: { entityId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
