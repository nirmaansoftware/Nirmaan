import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";

/**
 * How approved outreach emails leave the OS. Configured by environment:
 *
 *   OUTREACH_FROM       "Nirmaan <nirmaansoftware@gmail.com>" (required to send at all)
 *   OUTREACH_REPLY_TO   optional; replies go here instead of OUTREACH_FROM
 *   SMTP_URL            e.g. smtps://you%40gmail.com:APP-PASSWORD@smtp.gmail.com:465
 *     or RESEND_API_KEY (Resend, needs a verified sending domain)
 *
 * With neither, nothing is sent: the OS says so and offers "I sent it myself".
 */
export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  /** Follow-ups: the first email's Message-ID, so mail apps show one conversation. */
  inReplyTo?: string;
  references?: string[];
  /** Files to attach (the nightly database backup). */
  attachments?: { filename: string; content: Buffer }[];
}

/** Our own Message-ID, so threading works the same with SMTP or Resend. */
function newMessageId(from: string): string {
  const domain = /@([^>\s]+)/.exec(from)?.[1] ?? "nirmaan.online";
  return `<${randomUUID()}@${domain}>`;
}

export interface Mailer {
  name: string;
  send(mail: OutgoingEmail): Promise<{ id?: string }>;
}

export function mailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer | null {
  const from = env.OUTREACH_FROM?.trim();
  if (!from) return null;
  const replyTo = env.OUTREACH_REPLY_TO?.trim() || undefined;

  if (env.SMTP_URL?.trim()) {
    const transport = nodemailer.createTransport(env.SMTP_URL.trim());
    return {
      name: "SMTP",
      async send(mail) {
        const messageId = newMessageId(from);
        await transport.sendMail({ from, replyTo, to: mail.to, subject: mail.subject, text: mail.text, messageId, inReplyTo: mail.inReplyTo, references: mail.references, attachments: mail.attachments });
        return { id: messageId };
      },
    };
  }
  if (env.RESEND_API_KEY?.trim()) {
    const key = env.RESEND_API_KEY.trim();
    return {
      name: "Resend",
      async send(mail) {
        const messageId = newMessageId(from);
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from,
            to: [mail.to],
            subject: mail.subject,
            text: mail.text,
            ...(replyTo ? { reply_to: replyTo } : {}),
            headers: { "Message-ID": messageId, ...(mail.inReplyTo ? { "In-Reply-To": mail.inReplyTo, References: (mail.references ?? [mail.inReplyTo]).join(" ") } : {}) },
            ...(mail.attachments ? { attachments: mail.attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })) } : {}),
          }),
          signal: AbortSignal.timeout(20_000),
        });
        const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
        if (!res.ok) throw new Error(`Resend said no (${res.status}): ${body.message ?? res.statusText}`);
        return { id: messageId };
      },
    };
  }
  return null;
}

export function sendingConfigured(): boolean {
  return mailerFromEnv() !== null;
}

/**
 * Most outreach emails the OS sends in one day (OUTREACH_DAILY_LIMIT).
 * Default 400: a Gmail account is cut off for a day at about 500 messages
 * in 24 hours (Google Workspace: 2,000), so this keeps a margin under the
 * mailbox's own ceiling. Raise it only on a Workspace or sending domain.
 */
export function dailyLimit(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.OUTREACH_DAILY_LIMIT);
  return Number.isInteger(n) && n > 0 && n <= 2000 ? n : 400;
}
