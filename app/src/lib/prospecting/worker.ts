import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { decodeStringList } from "../db/json";
import { isOneOf, PROSPECT_SEGMENTS } from "../db/enums";
import type { ModelProvider } from "../providers/types";
import { isWhatsappable, normalEmail } from "./basics";
import { auditNext } from "./audit";
import { nextSearch } from "./campaigns";
import { checkInbox, type MailboxReader } from "./inbox";
import { mailerFromEnv, dailyLimit, type Mailer } from "./mailer";
import { draftFollowUp, draftOutreach, maxMessages, sendQueuedEmail } from "./outreach";
import { placesConfigured } from "./places";
import type { SiteFetcher } from "./safeFetch";
import { isSuppressed, runProspectSearch, type Finders } from "./service";
import { getAutopilot, reviewAutopilot, syncCampaigns } from "./autopilot";
import { runBackupIfDue } from "../backup";

/**
 * The campaign worker: one "tick" of background work, run every minute by
 * `npm run campaigns:worker` (or once by `npm run campaigns:tick`).
 *
 * Each tick does a bounded amount, in this order, so replies are always seen
 * before anything else goes out:
 *   1. read the inbox for replies, "stop"s and bounces      (inbox.ts)
 *   2. send at most ONE approved email, only inside sending hours and after
 *      a random gap since the last one: paced like a person, never a burst
 *   3. for each active campaign, within its daily budgets:
 *        draft first messages (split between email and WhatsApp),
 *        draft follow-ups that are due, check new businesses, search for more
 *
 * Nothing here sends a message a person hasn't approved: drafts wait in the
 * Outreach queue; WhatsApp is always sent by a person from our own phone.
 */
export const WORKER: Actor = { type: "AGENT", id: "campaign-worker", label: "Campaign worker", role: "PROJECT_MANAGER" };

export interface TickDeps {
  now?: Date;
  mailer?: Mailer | null;
  reader?: MailboxReader | null;
  provider?: ModelProvider;
  fetcher?: SiteFetcher;
  finders?: Finders;
  random?: () => number;
  /** Stop starting new slow work (searches, checks, drafts) after this long. */
  budgetMs?: number;
  /** Tests: work only on these campaigns, and leave autopilot alone. */
  onlyCampaigns?: string[];
}

export interface TickReport {
  ran: boolean;
  inbox?: Awaited<ReturnType<typeof checkInbox>>;
  sent: number;
  sendNote?: string;
  campaigns: { code: string; searched: number; checked: number; firstDrafts: number; followUps: number; notes: string[] }[];
  autopilotReview?: string;
  backup?: string;
  errors: string[];
}

const LOCK = "campaign-tick";

// ---------------------------------------------------------------- pacing

/** Sending hours in India (OUTREACH_SEND_HOURS "10-19", OUTREACH_SEND_DAYS "1-6" = Mon–Sat). */
export function inSendingWindow(now: Date, env: NodeJS.ProcessEnv = process.env): boolean {
  const [h1, h2] = (env.OUTREACH_SEND_HOURS ?? "10-19").split("-").map(Number);
  const [d1, d2] = (env.OUTREACH_SEND_DAYS ?? "1-6").split("-").map(Number);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((p) => p.type === "weekday")?.value ?? "");
  return hour >= h1 && hour < h2 && day >= d1 && day <= d2;
}

/** Seconds to wait before the next email: random between OUTREACH_GAP_SECONDS (default 45) and 2.5× that. */
export function nextGapSeconds(random: () => number = Math.random, env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.OUTREACH_GAP_SECONDS);
  const min = Number.isFinite(n) && n >= 10 && n <= 3600 ? n : 45;
  return Math.round(min + random() * min * 1.5);
}

const startOfDay = (now: Date) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
};

// ---------------------------------------------------------------- lock

async function acquire(now: Date, minutes = 20): Promise<boolean> {
  await prisma.jobState.upsert({ where: { name: LOCK }, create: { name: LOCK }, update: {} });
  const got = await prisma.jobState.updateMany({
    where: { name: LOCK, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    data: { lockedUntil: new Date(now.getTime() + minutes * 60_000) },
  });
  return got.count === 1;
}

async function release(report: TickReport) {
  await prisma.jobState.update({
    where: { name: LOCK },
    data: { lockedUntil: null, lastRunAt: new Date(), data: JSON.stringify({ report, at: new Date().toISOString() }) },
  });
}

// ---------------------------------------------------------------- the tick

export async function runTick(deps: TickDeps = {}): Promise<TickReport> {
  const now = deps.now ?? new Date();
  const started = Date.now();
  const budgetMs = deps.budgetMs ?? 8 * 60_000;
  const report: TickReport = { ran: false, sent: 0, campaigns: [], errors: [] };
  if (!(await acquire(now))) return report;
  report.ran = true;
  const note = (where: string, err: unknown) => report.errors.push(`${where}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300));

  try {
    // 1. Replies first, so nothing goes to someone who already answered.
    try {
      report.inbox = await checkInbox({ reader: deps.reader });
    } catch (err) {
      note("inbox", err);
    }

    // 2. One paced email.
    try {
      const r = await sendOne(now, deps);
      report.sent = r.sent;
      report.sendNote = r.note;
    } catch (err) {
      note("send", err);
    }

    // Nightly backup, emailed to our own mailbox (once a day, after 02:00 India time).
    if (!deps.onlyCampaigns) {
      try {
        report.backup = (await runBackupIfDue({ now, mailer: deps.mailer })) ?? undefined;
      } catch (err) {
        note("backup", err);
      }
    }

    // 3. Autopilot keeps its standing campaigns in step, and re-balances once a week.
    try {
      const auto = await getAutopilot();
      if (auto.on && !deps.onlyCampaigns) {
        await syncCampaigns(auto);
        const review = await reviewAutopilot(now);
        if (review) report.autopilotReview = review.summary;
      }
    } catch (err) {
      note("autopilot", err);
    }

    // 4. Campaign work, oldest-run first, within the time budget.
    const campaigns = await prisma.campaign.findMany({ where: { status: "ACTIVE", ...(deps.onlyCampaigns ? { id: { in: deps.onlyCampaigns } } : {}) }, orderBy: [{ lastRunAt: { sort: "asc", nulls: "first" } }] });
    for (const c of campaigns) {
      if (Date.now() - started > budgetMs) break;
      const line = { code: c.code, searched: 0, checked: 0, firstDrafts: 0, followUps: 0, notes: [] as string[] };
      report.campaigns.push(line);
      const outOfTime = () => Date.now() - started > budgetMs;
      try {
        line.firstDrafts = await draftFirstMessages(c, now, deps, 5, line.notes);
        if (!outOfTime()) line.followUps = await draftDueFollowUps(c, now, deps, 5, line.notes);
        if (!outOfTime()) line.checked = await checkSome(c, now, deps);
        if (!outOfTime()) line.searched = await searchMore(c, now, deps, line.notes);
      } catch (err) {
        note(c.code, err);
      }
      await prisma.campaign.update({ where: { id: c.id }, data: { lastRunAt: now } });
    }
  } finally {
    await release(report);
  }
  return report;
}

/** Sends the oldest approved email if we're in sending hours, under today's cap, and past the random gap. */
async function sendOne(now: Date, deps: TickDeps): Promise<{ sent: number; note?: string }> {
  const due = await prisma.outreachMessage.findFirst({ where: { status: "APPROVED", channel: "EMAIL", scheduledFor: { lte: now } }, orderBy: { scheduledFor: "asc" } });
  if (!due) return { sent: 0 };
  const mailer = deps.mailer === undefined ? mailerFromEnv() : deps.mailer;
  if (!mailer) return { sent: 0, note: "Approved emails are waiting, but sending isn't set up (OUTREACH_FROM, SMTP_URL)." };
  if (!inSendingWindow(now)) return { sent: 0, note: "Outside sending hours; approved emails wait for the next window." };
  const today = await prisma.outreachMessage.count({ where: { status: "SENT", sentVia: "EMAIL", sentAt: { gte: startOfDay(now) } } });
  if (today >= dailyLimit()) return { sent: 0, note: `Today's ${dailyLimit()} emails are sent; the rest go tomorrow.` };

  const pace = await prisma.jobState.upsert({ where: { name: "send-pace" }, create: { name: "send-pace" }, update: {} });
  const notBefore = (JSON.parse(pace.data) as { notBefore?: string }).notBefore;
  if (notBefore && new Date(notBefore) > now) return { sent: 0 };

  try {
    await sendQueuedEmail(due.id, { mailer, now });
  } catch (err) {
    // A message that can no longer go (they replied, a limit, do-not-contact) leaves the queue with the reason.
    await prisma.outreachMessage.update({ where: { id: due.id }, data: { status: "DRAFT", scheduledFor: null, sendError: (err instanceof Error ? err.message : String(err)).slice(0, 300) } });
    throw err;
  } finally {
    const next = new Date(now.getTime() + nextGapSeconds(deps.random) * 1000);
    await prisma.jobState.update({ where: { name: "send-pace" }, data: { lastRunAt: now, data: JSON.stringify({ notBefore: next.toISOString() }) } });
  }
  return { sent: 1 };
}

type CampaignRow = Awaited<ReturnType<typeof prisma.campaign.findMany>>[number];

/** First messages for the best-fitting checked businesses, keeping today's email/WhatsApp split near the target. */
async function draftFirstMessages(c: CampaignRow, now: Date, deps: TickDeps, perTick = 5, errors?: string[]): Promise<number> {
  const today = await prisma.outreachMessage.groupBy({ by: ["channel"], where: { campaignId: c.id, step: 0, createdAt: { gte: startOfDay(now) } }, _count: true });
  let email = today.find((t) => t.channel === "EMAIL")?._count ?? 0;
  let whatsapp = today.find((t) => t.channel === "WHATSAPP")?._count ?? 0;
  const room = Math.min(perTick, c.newContactsPerDay - email - whatsapp);
  if (room <= 0) return 0;

  const candidates = await prisma.prospect.findMany({
    where: { campaignId: c.id, status: "AUDITED", fitScore: { gte: c.minFit }, messages: { none: {} } },
    orderBy: [{ fitScore: "desc" }, { ratingCount: { sort: "desc", nulls: "last" } }],
    take: room * 3,
  });
  let drafted = 0;
  for (const p of candidates) {
    if (drafted >= room) break;
    if (await isSuppressed(p)) continue;
    const canEmail = !!normalEmail(p.email);
    const canWhatsapp = isWhatsappable(p.phone);
    if (!canEmail && !canWhatsapp) continue;
    // Which channel is behind its share today?
    const total = email + whatsapp;
    const emailBehind = total === 0 ? c.emailShare >= 50 : email / total < c.emailShare / 100;
    const channel = canEmail && canWhatsapp ? (emailBehind ? "EMAIL" : "WHATSAPP") : canEmail ? "EMAIL" : "WHATSAPP";
    if ((channel === "EMAIL" && c.emailShare === 0) || (channel === "WHATSAPP" && c.emailShare === 100)) continue;
    try {
      await draftOutreach(WORKER, p.id, channel, { provider: deps.provider, angle: c.angle, campaignId: c.id });
    } catch (err) {
      // One business failing mustn't stop the rest; it's tried again next tick.
      errors?.push(`${p.code}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200));
      continue;
    }
    if (channel === "EMAIL") email++;
    else whatsapp++;
    drafted++;
  }
  return drafted;
}

/** Follow-ups whose day has come, for businesses that haven't replied. */
async function draftDueFollowUps(c: CampaignRow, now: Date, deps: TickDeps, perTick = 5, errors?: string[]): Promise<number> {
  const schedule = decodeStringList(c.followUpDays).map(Number).filter((n) => n > 0);
  if (!schedule.length) return 0;
  const contacted = await prisma.prospect.findMany({
    where: { campaignId: c.id, status: "CONTACTED" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
    take: 400,
  });
  let drafted = 0;
  for (const p of contacted) {
    if (drafted >= perTick) break;
    for (const channel of ["EMAIL", "WHATSAPP"] as const) {
      const msgs = p.messages.filter((m) => m.channel === channel);
      const sent = msgs.filter((m) => m.status === "SENT");
      if (!sent.length || msgs.some((m) => m.status === "DRAFT" || m.status === "APPROVED")) continue;
      const stepIndex = sent.length - 1; // follow-up number sent.length is due schedule[stepIndex] days after the last send
      if (sent.length >= Math.min(schedule.length + 1, maxMessages())) continue;
      const last = sent[sent.length - 1];
      if (!last.sentAt || now.getTime() - last.sentAt.getTime() < schedule[stepIndex] * 86_400_000) continue;
      try {
        await draftFollowUp(WORKER, p.id, channel, { provider: deps.provider, now, maxSteps: schedule.length + 1 });
        drafted++;
      } catch (err) {
        errors?.push(`${p.code}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200));
      }
      break;
    }
  }
  return drafted;
}

async function checkSome(c: CampaignRow, now: Date, deps: TickDeps, perTick = 3): Promise<number> {
  const today = await prisma.prospect.count({ where: { campaignId: c.id, auditedAt: { gte: startOfDay(now) } } });
  const room = Math.min(perTick, c.checksPerDay - today);
  if (room <= 0) return 0;
  const r = await auditNext(WORKER, { campaignId: c.id, limit: room, fetcher: deps.fetcher, provider: deps.provider });
  return r.done;
}

/** The next search in the plan: Places while its budget lasts (cheap), then the web (slow, uses the Claude plan). */
async function searchMore(c: CampaignRow, now: Date, deps: TickDeps, notes: string[]): Promise<number> {
  // Enough waiting to be checked already? Don't pile up more.
  const backlog = await prisma.prospect.count({ where: { campaignId: c.id, status: "NEW" } });
  if (backlog >= 60) return 0;
  const today = await prisma.prospectSearch.findMany({ where: { campaignId: c.id, createdAt: { gte: startOfDay(now) } }, select: { sources: true } });
  const places = today.filter((s) => decodeStringList(s.sources).includes("PLACES")).length;
  const web = today.filter((s) => decodeStringList(s.sources).includes("WEB")).length;
  const placesReady = (deps.finders?.placesReady ?? placesConfigured)();
  const source = placesReady && places < c.placesSearchesPerDay ? "PLACES" : web < c.webSearchesPerDay ? "WEB" : null;
  if (!source) return 0;
  const next = nextSearch(c);
  if (!next) return 0;
  const segment = isOneOf(PROSPECT_SEGMENTS, c.segment) ? c.segment : "LOCAL_SERVICE";
  await prisma.campaign.update({ where: { id: c.id }, data: { searchCursor: next.cursor } });
  const s = await runProspectSearch(WORKER, { query: next.query, location: next.location, segment, sources: [source], campaignId: c.id }, deps.finders);
  if (s.notes) notes.push(s.notes);
  return 1;
}

/** When the worker last ran, for the "is it running?" line in the UI. */
export async function workerStatus() {
  const s = await prisma.jobState.findUnique({ where: { name: LOCK } });
  const inbox = await prisma.jobState.findUnique({ where: { name: "inbox-check" } });
  let report: TickReport | null = null;
  try {
    report = s ? (JSON.parse(s.data) as { report?: TickReport }).report ?? null : null;
  } catch {
    report = null;
  }
  const now = new Date();
  return {
    lastRunAt: s?.lastRunAt ?? null,
    running: !!s?.lockedUntil && s.lockedUntil > now,
    // Quiet for over 10 minutes: probably not running at all.
    stale: !s?.lastRunAt || now.getTime() - s.lastRunAt.getTime() > 10 * 60_000,
    inboxCheckedAt: inbox?.lastRunAt ?? null,
    report,
  };
}
