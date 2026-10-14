import { ImapFlow } from "imapflow";
import { prisma } from "../db/client";
import { audit } from "../audit";
import { SYSTEM_ACTOR } from "../auth/actor";
import { normalEmail } from "./basics";
import { markReplied, OPT_OUT_LINE } from "./outreach";
import { stopProspect } from "./service";

/**
 * Reads our own mailbox for answers to outreach, so the machine never keeps
 * following up with someone who already replied (the most bot-like thing it
 * could do). A reply stops that business's sequence; "stop" or "not
 * interested" also puts them on the do-not-contact list; a bounce marks the
 * address as bad so it's never used again.
 *
 *   IMAP_URL   e.g. imaps://you%40gmail.com:APP-PASSWORD@imap.gmail.com:993
 *
 * Only messages from addresses we wrote to are looked at; nothing else in
 * the mailbox is read or stored.
 */
export interface IncomingMail {
  uid: number;
  from: string;
  subject: string;
  inReplyTo?: string;
  text: string;
}

export interface MailboxReader {
  /** Messages with a UID above lastUid (the last 14 days on the first run). */
  readSince(lastUid: number): Promise<{ mails: IncomingMail[]; maxUid: number }>;
}

export function readerFromEnv(env: NodeJS.ProcessEnv = process.env): MailboxReader | null {
  const raw = env.IMAP_URL?.trim();
  if (!raw) return null;
  const url = new URL(raw);
  const options = {
    host: url.hostname,
    port: Number(url.port || 993),
    secure: url.protocol !== "imap:",
    auth: { user: decodeURIComponent(url.username), pass: decodeURIComponent(url.password) },
    logger: false as const,
  };
  return {
    async readSince(lastUid) {
      const client = new ImapFlow(options);
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const query = lastUid > 0 ? { uid: `${lastUid + 1}:*` } : { since: new Date(Date.now() - 14 * 86_400_000) };
        const found = await client.search(query, { uid: true });
        const uids = (found || []).filter((u) => u > lastUid);
        const mails: IncomingMail[] = [];
        let maxUid = lastUid;
        if (uids.length) {
          for await (const m of client.fetch(uids, { uid: true, envelope: true, source: { maxLength: 30_000 } }, { uid: true })) {
            maxUid = Math.max(maxUid, m.uid);
            mails.push({
              uid: m.uid,
              from: m.envelope?.from?.[0]?.address ?? "",
              subject: m.envelope?.subject ?? "",
              inReplyTo: m.envelope?.inReplyTo,
              text: bodyText(m.source?.toString("utf8") ?? ""),
            });
          }
        }
        return { mails, maxUid };
      } finally {
        lock.release();
        await client.logout().catch(() => undefined);
      }
    },
  };
}

/** The readable body of a raw message: headers dropped, quoted-printable and HTML roughly undone. */
export function bodyText(source: string): string {
  const body = source.split(/\r?\n\r?\n/).slice(1).join("\n\n");
  return body
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .slice(0, 20_000);
}

/** What they wrote, without the quoted history (which contains our own "reply stop" line). */
export function ownWords(text: string): string {
  const cut = text.search(/^\s*(On .{0,200}wrote:|-{2,} ?Original Message|From: .+|Sent from my )/im);
  const mine = (cut >= 0 ? text.slice(0, cut) : text)
    .split("\n")
    .filter((l) => !l.trim().startsWith(">") && !l.includes(OPT_OUT_LINE) && !/reply .{0,3}stop.{0,3} and we/i.test(l))
    .join("\n");
  return mine.trim().slice(0, 2000);
}

const STOP = /\b(stop|unsubscribe|remove me|not interested|no thanks|do not (contact|email|message)|don'?t (contact|email|message))\b/i;

export function wantsNoMore(text: string): boolean {
  const words = ownWords(text);
  return STOP.test(words) && words.length < 400;
}

export async function checkInbox(deps: { reader?: MailboxReader | null } = {}) {
  const reader = deps.reader === undefined ? readerFromEnv() : deps.reader;
  const report = { read: 0, replies: 0, stops: 0, bounces: 0 };
  if (!reader) return report;
  const state = await prisma.jobState.upsert({ where: { name: "inbox-check" }, create: { name: "inbox-check" }, update: {} });
  const lastUid = Number((JSON.parse(state.data) as { lastUid?: number }).lastUid ?? 0);
  const { mails, maxUid } = await reader.readSince(lastUid);
  report.read = mails.length;

  for (const mail of mails) {
    const from = normalEmail(mail.from) ?? "";
    if (/mailer-daemon|postmaster/i.test(from)) {
      // Which of our recipients bounced? The bounce names the address.
      const recent = await prisma.outreachMessage.findMany({ where: { channel: "EMAIL", status: "SENT", sentAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }, select: { id: true, toAddress: true, prospectId: true } });
      for (const m of recent.filter((m) => mail.text.toLowerCase().includes(m.toAddress))) {
        await prisma.outreachMessage.update({ where: { id: m.id }, data: { status: "FAILED", sendError: "Bounced: the address doesn't accept mail." } });
        await prisma.prospect.updateMany({ where: { id: m.prospectId, email: m.toAddress }, data: { email: null, emailSource: `Bounced: ${m.toAddress}` } });
        await audit(SYSTEM_ACTOR, "outreach.bounced", "OutreachMessage", m.id, m.toAddress);
        report.bounces++;
      }
      continue;
    }
    // A reply: to our thread, or from an address we wrote to.
    const ours = await prisma.outreachMessage.findFirst({
      where: { channel: "EMAIL", status: "SENT", OR: [...(mail.inReplyTo ? [{ messageRef: mail.inReplyTo }] : []), ...(from ? [{ toAddress: from }] : [])] },
      include: { prospect: true },
      orderBy: { sentAt: "desc" },
    });
    if (!ours) continue;
    await markReplied(ours.prospectId);
    report.replies++;
    await audit(SYSTEM_ACTOR, "prospect.replied", "Prospect", ours.prospectId, `${ours.prospect.code}: “${ownWords(mail.text).slice(0, 140)}”`);
    if (wantsNoMore(mail.text)) {
      await stopProspect(ours.prospectId, `${ours.prospect.code}: replied “${ownWords(mail.text).slice(0, 80)}”`, "Inbox check");
      report.stops++;
    }
  }
  await prisma.jobState.update({ where: { name: "inbox-check" }, data: { lastRunAt: new Date(), data: JSON.stringify({ lastUid: maxUid }) } });
  return report;
}
