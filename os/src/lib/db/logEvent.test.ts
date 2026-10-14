import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./client";
import { logEvent } from "./logEvent";
import { seedFixtureProject, cleanupFixtureProject } from "../testHelpers/fixtureProject";

test("logEvent writes an Event row and returns it", async () => {
  const project = await seedFixtureProject();
  try {
    const event = await logEvent(project.id, "qa-engineer", null, "Ran the test suite, all green.");
    assert.equal(event.projectId, project.id);
    assert.equal(event.agentSlug, "qa-engineer");
    assert.equal(event.message, "Ran the test suite, all green.");

    const persisted = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    assert.equal(persisted.message, "Ran the test suite, all green.");
  } finally {
    await cleanupFixtureProject(project.id);
  }
});

test("logEvent redacts a secret embedded in the message before it's ever written to the DB", async () => {
  const project = await seedFixtureProject();
  try {
    // Built by concatenation, not one literal string — see redact.test.ts's
    // file-level comment for why: this was never a real credential, but a
    // static scanner (rightly) can't tell that from the shape alone.
    const fakeKey = "sk-ant-api03-" + "abcdefghijklmnopqrstuvwxyz0123456789ABCD";
    const event = await logEvent(project.id, "security-engineer", null, `Found a hardcoded key in the code: ${fakeKey}`);
    assert.ok(!event.message.includes(fakeKey));
    assert.match(event.message, /\[REDACTED\]/);

    const persisted = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    assert.ok(!persisted.message.includes(fakeKey), "secret must never reach the database, not just the in-memory return value");
  } finally {
    await cleanupFixtureProject(project.id);
  }
});
