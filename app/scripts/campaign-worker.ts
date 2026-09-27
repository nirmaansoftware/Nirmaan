/**
 * Runs the campaign worker (src/lib/prospecting/worker.ts).
 *
 *   npm run campaigns:worker     a tick every minute until stopped (Ctrl+C)
 *   npm run campaigns:tick       one tick, then exit (for cron)
 *
 * Reads app/.env and app/.env.local. Safe to run twice by mistake: a lock in
 * the database lets only one tick work at a time.
 */
import { runTick } from "../src/lib/prospecting/worker";
import { prisma } from "../src/lib/db/client";

const once = process.argv.includes("--once");
const EVERY_MS = 60_000;
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
  console.log("\nStopping after this tick…");
});

function line(r: Awaited<ReturnType<typeof runTick>>): string {
  if (!r.ran) return "another tick is still running; skipped";
  const parts = [
    r.inbox && (r.inbox.read ? `inbox ${r.inbox.read} read, ${r.inbox.replies} replies, ${r.inbox.stops} stops, ${r.inbox.bounces} bounces` : "inbox quiet"),
    r.sent ? `sent ${r.sent} email` : r.sendNote,
    r.backup && `backup emailed (${r.backup})`,
    ...r.campaigns.map((c) => `${c.code}: ${c.searched} search, ${c.checked} checked, ${c.firstDrafts} first drafts, ${c.followUps} follow-ups${c.notes.length ? ` (${c.notes.join(" ")})` : ""}`),
    ...r.errors.map((e) => `! ${e}`),
  ].filter(Boolean);
  return parts.join(" · ") || "nothing to do";
}

async function main() {
  do {
    const started = Date.now();
    try {
      console.log(`${new Date().toLocaleTimeString("en-IN")}  ${line(await runTick())}`);
    } catch (err) {
      console.error(`${new Date().toLocaleTimeString("en-IN")}  tick failed:`, err instanceof Error ? err.message : err);
    }
    if (once || stopping) break;
    await new Promise((r) => setTimeout(r, Math.max(5_000, EVERY_MS - (Date.now() - started))));
  } while (!stopping);
  await prisma.$disconnect();
}

main();
