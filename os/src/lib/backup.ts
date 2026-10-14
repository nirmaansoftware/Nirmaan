import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { prisma } from "./db/client";
import { mailerFromEnv, type Mailer } from "./prospecting/mailer";

/**
 * Nightly off-site backup: a consistent copy of the whole database (SQLite's
 * VACUUM INTO, safe while the OS is running), gzipped and emailed to our own
 * mailbox. Fly keeps volume snapshots for 5 days; this keeps a copy outside
 * Fly, one email a day, searchable by date.
 *
 *   BACKUP_EMAIL   where to send it (default: the address in OUTREACH_FROM)
 *   BACKUP_HOUR    hour in India time after which the day's backup is made (default 2)
 *
 * Restore: download the attachment, gunzip it, and put it at the path in
 * DATABASE_URL (on Fly: fly ssh sftp shell → put nirmaan.db /data/nirmaan.db,
 * then restart the machine).
 */
const JOB = "backup";
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // Gmail's limit is 25 MB

function indiaDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function indiaHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "numeric", hourCycle: "h23" }).format(d));
}

/** Has today's backup (India time) been made, and is it late enough to make it? */
export async function backupDue(now: Date, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const hour = Number(env.BACKUP_HOUR ?? 2);
  if (indiaHour(now) < (Number.isInteger(hour) ? hour : 2)) return false;
  const state = await prisma.jobState.findUnique({ where: { name: JOB } });
  return !state?.lastRunAt || indiaDay(state.lastRunAt) !== indiaDay(now);
}

/** A gzipped, consistent copy of the database. */
export async function snapshot(): Promise<{ gz: Buffer; rawBytes: number }> {
  const dir = mkdtempSync(path.join(tmpdir(), "nirmaan-backup-"));
  const file = path.join(dir, "nirmaan.db");
  try {
    await prisma.$executeRawUnsafe(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
    const raw = readFileSync(file);
    return { gz: gzipSync(raw, { level: 9 }), rawBytes: raw.length };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function runBackupIfDue(deps: { now?: Date; mailer?: Mailer | null; env?: NodeJS.ProcessEnv } = {}): Promise<string | null> {
  const now = deps.now ?? new Date();
  const env = deps.env ?? process.env;
  if (!(await backupDue(now, env))) return null;
  const mailer = deps.mailer === undefined ? mailerFromEnv(env) : deps.mailer;
  const to = env.BACKUP_EMAIL?.trim() || /<([^>]+)>/.exec(env.OUTREACH_FROM ?? "")?.[1] || env.OUTREACH_FROM?.trim();
  if (!mailer || !to) return null; // nowhere to send it; try again next tick once email is set up

  const { gz, rawBytes } = await snapshot();
  const day = indiaDay(now);
  const counts = await Promise.all([prisma.prospect.count(), prisma.outreachMessage.count({ where: { status: "SENT" } }), prisma.lead.count()]);
  const summary = `${counts[0]} prospects, ${counts[1]} messages sent, ${counts[2]} leads. Database ${(rawBytes / 1024).toFixed(0)} KB, ${(gz.length / 1024).toFixed(0)} KB compressed.`;
  if (gz.length > MAX_ATTACHMENT_BYTES) {
    await mailer.send({ to, subject: `Nirmaan OS backup ${day}: too large to email`, text: `${summary}\n\nThe backup is over 20 MB, so it wasn't attached. Time to move backups to storage (see src/lib/backup.ts).` });
  } else {
    await mailer.send({
      to,
      subject: `Nirmaan OS backup ${day}`,
      text: `The nightly backup of the Nirmaan OS database is attached.\n\n${summary}\n\nTo restore: gunzip it and replace the database file (see src/lib/backup.ts).`,
      attachments: [{ filename: `nirmaan-os-${day}.db.gz`, content: gz }],
    });
  }
  await prisma.jobState.upsert({ where: { name: JOB }, create: { name: JOB, lastRunAt: now }, update: { lastRunAt: now, data: JSON.stringify({ bytes: gz.length }) } });
  return summary;
}
