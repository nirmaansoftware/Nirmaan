import { test, after } from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { prisma } from "./db/client";
import { backupDue, runBackupIfDue, snapshot } from "./backup";
import type { Mailer, OutgoingEmail } from "./prospecting/mailer";

const env = { OUTREACH_FROM: "Sahaj Patel <owner@example.test>" } as unknown as NodeJS.ProcessEnv;
let saved: { lastRunAt: Date | null; data: string } | null = null;

after(async () => {
  if (saved) await prisma.jobState.update({ where: { name: "backup" }, data: saved });
  else await prisma.jobState.deleteMany({ where: { name: "backup" } });
});

test("snapshot: a real, complete SQLite file, gzipped", async () => {
  const { gz, rawBytes } = await snapshot();
  const raw = gunzipSync(gz);
  assert.equal(raw.length, rawBytes);
  assert.equal(raw.subarray(0, 15).toString(), "SQLite format 3");
});

test("once a day after 02:00 India time, emailed with the file attached", async () => {
  const before = await prisma.jobState.findUnique({ where: { name: "backup" } });
  saved = before ? { lastRunAt: before.lastRunAt, data: before.data } : null;
  await prisma.jobState.deleteMany({ where: { name: "backup" } });
  const sent: OutgoingEmail[] = [];
  const mailer: Mailer = { name: "Fake", send: async (m) => (sent.push(m), { id: "x" }) };

  const early = new Date("2026-09-28T20:00:00Z"); // 01:30 IST on the 29th
  assert.equal(await backupDue(early, env), false);
  const late = new Date("2026-09-28T21:00:00Z"); // 02:30 IST
  assert.ok(await runBackupIfDue({ now: late, mailer, env }));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "owner@example.test");
  assert.equal(sent[0].subject, "Nirmaan OS backup 2026-09-29");
  assert.equal(sent[0].attachments?.[0].filename, "nirmaan-os-2026-09-29.db.gz");
  assert.equal(await runBackupIfDue({ now: new Date(late.getTime() + 3_600_000), mailer, env }), null, "not twice in one day");
  assert.equal(sent.length, 1);
  assert.equal(await runBackupIfDue({ now: late, mailer: null, env: {} as unknown as NodeJS.ProcessEnv }), null, "no email set up: nothing to do");
});
