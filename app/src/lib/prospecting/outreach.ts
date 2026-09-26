import { prisma } from "../db/client";
import { audit } from "../audit";
import { assertCan } from "../auth/permissions";
import type { Actor } from "../auth/actor";
import { callModel } from "../ai/callModel";
import { extractJsonObject, text } from "../ai/json";
import { decodeStringList } from "../db/json";
import { isOneOf, OUTREACH_CHANNELS, type OutreachChannel } from "../db/enums";
import type { ModelProvider } from "../providers/types";
import { isWhatsappable, normalEmail, normalPhone, packageName } from "./basics";
import { dailyLimit, mailerFromEnv, type Mailer } from "./mailer";
import { isSuppressed } from "./service";

/**
 * Prospecting, step 3: messages. Claude drafts each one for that business,
 * in the sender's own voice; a person reads, edits and approves the exact
 * words. Approved emails go out from our own mailbox, paced like a person
 * sending them (worker.ts); WhatsApp messages are sent from our own phone.
 * Follow-ups are short, human replies in the same thread, and stop the
 * moment the business replies or asks us to stop.
 *
 * Guard rails, all enforced here rather than in the UI: the do-not-contact
 * list, no messages after a reply, a limit on follow-ups, a minimum gap
 * between messages to one business, a daily email cap, and an opt-out line
 * on every message that can't be edited away.
 */
export const OPT_OUT_LINE = "Not relevant? Reply “stop” and we won’t contact you again.";
const SIGNATURE_SITE = "www.nirmaan.online";

/** Days between two messages to the same business (OUTREACH_MIN_DAYS_BETWEEN, default 2). */
export function minDaysBetween(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.OUTREACH_MIN_DAYS_BETWEEN);
  return Number.isFinite(n) && n >= 1 && n <= 30 ? n : 2;
}

/** Most messages one business gets per channel with no reply, first message included (OUTREACH_MAX_MESSAGES, default 3, at most 5). */
export function maxMessages(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.OUTREACH_MAX_MESSAGES);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 3;
}

/** "Sahaj Patel" from OUTREACH_SENDER_NAME, else "Team Nirmaan". */
export function senderName(env: NodeJS.ProcessEnv = process.env): string {
  return env.OUTREACH_SENDER_NAME?.trim() || "Team Nirmaan";
}

/** "+91 94938 33697" from OUTREACH_WHATSAPP_NUMBER, or null. */
export function ourWhatsapp(env: NodeJS.ProcessEnv = process.env): string | null {
  const d = normalPhone(env.OUTREACH_WHATSAPP_NUMBER);
  if (!d) return null;
  return d.startsWith("91") && d.length === 12 ? `+91 ${d.slice(2, 7)} ${d.slice(7)}` : `+${d}`;
}

/** The sign-off the drafts end with; the same every time, so it reads like one real person. */
export function signature(channel: OutreachChannel, env: NodeJS.ProcessEnv = process.env): string {
  const name = senderName(env);
  const lines = [name === "Team Nirmaan" ? name : `${name}\nNirmaan · ${SIGNATURE_SITE}`];
  if (name === "Team Nirmaan") lines.push(SIGNATURE_SITE);
  const wa = ourWhatsapp(env);
  if (channel === "EMAIL" && wa) lines.push(`WhatsApp: ${wa}`);
  return lines.join("\n");
}

const VOICE = `Write as {{sender}} of Nirmaan, a small software studio in India ("You bring the problem. We build the system."), personally writing one message to one business owner. It must read like a real person wrote it by hand today, not a campaign:
- First person ("I"), warm and plain. Indian English is fine. No emojis, no buzzwords, no flattery, no fake urgency, no discounts.
- Say one specific, true thing you noticed about their business (only from the facts given; never invent details, names, numbers, results or clients).
- About their website, say only what "What we noticed" states. Never call it broken, blank, empty, down or missing unless that is stated there; "no website link on the Google listing" is not "no website".
- Name the likely problem in their terms, as a question or an observation, never an accusation. Don't say their website is bad.
- One small next step: a 15-minute call, or they can simply reply.
- Vary your wording naturally; don't open with "I hope this finds you well" or "I came across".
- Plain text. No links except ${SIGNATURE_SITE} in the signature.
- End with exactly this signature:
{{signature}}
- Do not add an unsubscribe or opt-out line; one is added automatically.`;

const FIRST_PROMPT = `${VOICE}
- Email: 70 to 130 words, with a short, plain subject (under 60 characters, lowercase is fine, no clickbait). WhatsApp: 40 to 80 words, no subject.

Reply with one JSON object and nothing else: {"subject": "...", "body": "..."}`;

const FOLLOW_UP_PROMPT = `${VOICE}
This is follow-up number {{step}} to a message they haven't answered. It's a reply in the same conversation:
- 25 to 60 words. Don't repeat the first message or apologise for following up; don't guilt them.
- Add one small new, useful thing (a quick idea, or what the first step would look like), or simply ask if it's worth a chat.
- If this is the last follow-up ({{last}}), close politely: you won't keep writing, and they can reply any time.

Reply with one JSON object and nothing else: {"body": "..."}`;

/** Adds the sender's signature if the draft left it out, so every message is signed the same way. */
export function withSignature(body: string, channel: OutreachChannel, env: NodeJS.ProcessEnv = process.env): string {
  const name = senderName(env);
  const tail = body.trim().split("\n").slice(-4).join("\n");
  return tail.includes(name) ? body.trim() : `${body.trim()}\n\n${signature(channel, env)}`;
}

/** The exact text that goes out: the approved body plus the opt-out line. */
export function finalBody(body: string): string {
  return `${body.trim()}\n\n${OPT_OUT_LINE}`;
}

export function whatsappLink(phone: string | null, body: string): string | null {
  const digits = normalPhone(phone);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(finalBody(body))}` : null;
}

export function parseDraft(raw: string, channel: OutreachChannel): { subject: string | null; body: string } {
  const o = extractJsonObject(raw, "The draft");
  const body = text(o.body, 3000);
  if (body.length < 20) throw new Error("The draft came back empty.");
  const subject = channel === "EMAIL" ? text(o.subject, 120) || "a quick question" : null;
  return { subject, body };
}

type ContactableProspect = { id: string; code: string; status: string; email: string | null; phone: string | null; website: string | null };

async function assertContactable(p: ContactableProspect) {
  if (["DO_NOT_CONTACT", "DISMISSED", "CONVERTED", "REPLIED"].includes(p.status)) {
    throw new Error(`${p.code} is ${p.status.toLowerCase().replaceAll("_", " ")}; no more outreach from here.`);
  }
  if (await isSuppressed(p)) throw new Error(`${p.code} matches the do-not-contact list.`);
}

function recipient(p: { email: string | null; phone: string | null }, channel: OutreachChannel): string {
  const to = channel === "EMAIL" ? normalEmail(p.email) : normalPhone(p.phone);
  if (!to) throw new Error(channel === "EMAIL" ? "There's no email for this business. Add one, or use WhatsApp." : "There's no phone number for this business.");
  if (channel === "WHATSAPP" && !isWhatsappable(to)) throw new Error("That number looks like a landline, which can't receive WhatsApp. Add a mobile number.");
  return to;
}

function facts(p: { name: string; category: string | null; city: string | null; problem: string | null; evidence: string; suggestedPackage: string | null }, channel: OutreachChannel, angle?: string | null) {
  return [
    `Channel: ${channel === "EMAIL" ? "email" : "WhatsApp"}`,
    `Business: ${p.name}${p.category ? ` (${p.category})` : ""}${p.city ? `, ${p.city}` : ""}`,
    `Likely problem: ${p.problem}`,
    `What we noticed: ${decodeStringList(p.evidence).join("; ") || "nothing specific"}`,
    p.suggestedPackage && `What would probably help (don't name packages or prices): ${packageName(p.suggestedPackage)}`,
    angle && `The campaign's angle, to weave in naturally: ${angle}`,
  ].filter(Boolean);
}

function fill(prompt: string, channel: OutreachChannel, extra: Record<string, string> = {}): string {
  let out = prompt.replace("{{sender}}", senderName()).replace("{{signature}}", signature(channel));
  for (const [k, v] of Object.entries(extra)) out = out.replaceAll(`{{${k}}}`, v);
  return out;
}

export async function draftOutreach(actor: Actor, prospectId: string, channel: string, deps: { provider?: ModelProvider; angle?: string | null; campaignId?: string | null } = {}) {
  assertCan(actor.role, "prospect:run");
  if (!isOneOf(OUTREACH_CHANNELS, channel)) throw new Error("Pick email or WhatsApp.");
  const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  await assertContactable(p);
  if (p.fitScore == null) throw new Error("Check the business first, so the message can say something true about it.");
  const to = recipient(p, channel);
  const open = await prisma.outreachMessage.count({ where: { prospectId: p.id, channel, status: { in: ["DRAFT", "APPROVED"] } } });
  if (open) throw new Error(`There's already a ${channel === "EMAIL" ? "email" : "WhatsApp message"} waiting for this business.`);
  if (await prisma.outreachMessage.count({ where: { prospectId: p.id, channel, status: "SENT" } })) {
    throw new Error("They've already had a first message here; the next one is a follow-up.");
  }

  const { completion } = await callModel({
    task: "outreach-draft",
    taskType: "content",
    systemPrompt: fill(FIRST_PROMPT, channel),
    userPrompt: facts(p, channel, deps.angle).join("\n"),
    prospectId: p.id,
    provider: deps.provider,
  });
  const draft = parseDraft(completion.text, channel);
  const message = await prisma.outreachMessage.create({
    data: { prospectId: p.id, channel, toAddress: to, subject: draft.subject, body: withSignature(draft.body, channel), draftedBy: "AGENT", step: 0, campaignId: deps.campaignId ?? p.campaignId },
  });
  if (p.status === "NEW" || p.status === "AUDITED") await prisma.prospect.update({ where: { id: p.id }, data: { status: "DRAFTED" } });
  await audit(actor, "outreach.drafted", "OutreachMessage", message.id, `${p.code} by ${channel.toLowerCase()}`);
  return message;
}

/**
 * The next follow-up on a channel, as a reply in the same conversation.
 * Refuses if they replied, if the sequence is finished, or if it's too soon.
 */
export async function draftFollowUp(actor: Actor, prospectId: string, channel: string, deps: { provider?: ModelProvider; now?: Date; maxSteps?: number } = {}) {
  assertCan(actor.role, "prospect:run");
  if (!isOneOf(OUTREACH_CHANNELS, channel)) throw new Error("Pick email or WhatsApp.");
  const now = deps.now ?? new Date();
  const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  await assertContactable(p);
  const sent = await prisma.outreachMessage.findMany({ where: { prospectId: p.id, channel, status: "SENT" }, orderBy: { sentAt: "asc" } });
  if (!sent.length) throw new Error("Send a first message before a follow-up.");
  const max = Math.min(deps.maxSteps ?? maxMessages(), maxMessages());
  if (sent.length >= max) throw new Error(`${p.code} has had ${sent.length} messages on this channel with no reply; that's the limit.`);
  if (await prisma.outreachMessage.count({ where: { prospectId: p.id, channel, status: { in: ["DRAFT", "APPROVED"] } } })) {
    throw new Error("A message for this business is already waiting.");
  }
  const last = sent[sent.length - 1];
  if (last.sentAt && now.getTime() - last.sentAt.getTime() < minDaysBetween() * 86_400_000) throw new Error(`Too soon: the last message went ${last.sentAt.toDateString()}.`);

  const step = sent.length;
  const history = sent.map((m, i) => `Message ${i + 1} (sent ${m.sentAt?.toDateString()}):\n${m.body}`).join("\n\n");
  const { completion } = await callModel({
    task: "outreach-follow-up",
    taskType: "content",
    systemPrompt: fill(FOLLOW_UP_PROMPT, channel, { step: String(step), last: step + 1 >= max ? "yes, this is the last one" : "no" }),
    userPrompt: [...facts(p, channel), "", "What they've been sent so far, with no reply:", history].join("\n"),
    prospectId: p.id,
    provider: deps.provider,
  });
  const draft = parseDraft(completion.text, channel);
  const first = sent[0];
  const message = await prisma.outreachMessage.create({
    data: {
      prospectId: p.id,
      channel,
      toAddress: last.toAddress,
      subject: channel === "EMAIL" ? replySubject(first.subject) : null,
      body: withSignature(draft.body, channel),
      draftedBy: "AGENT",
      step,
      campaignId: last.campaignId ?? p.campaignId,
      threadRef: channel === "EMAIL" ? (first.messageRef ?? null) : null,
    },
  });
  await audit(actor, "outreach.drafted", "OutreachMessage", message.id, `${p.code} follow-up ${step} by ${channel.toLowerCase()}`);
  return message;
}

export function replySubject(subject: string | null): string {
  const s = (subject ?? "a quick question").trim();
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

export async function updateDraft(actor: Actor, messageId: string, input: { subject?: string; body: string; toAddress?: string }) {
  assertCan(actor.role, "prospect:run");
  const m = await prisma.outreachMessage.findUniqueOrThrow({ where: { id: messageId } });
  if (m.status !== "DRAFT") throw new Error("Only a draft can be edited.");
  const body = input.body.trim();
  if (body.length < 20 || body.length > 3000) throw new Error("Keep the message between 20 and 3,000 characters.");
  const to = m.channel === "EMAIL" ? normalEmail(input.toAddress ?? m.toAddress) : normalPhone(input.toAddress ?? m.toAddress);
  if (!to) throw new Error(m.channel === "EMAIL" ? "That email address doesn't look right." : "That phone number doesn't look right.");
  const subject = m.channel === "EMAIL" ? (input.subject ?? m.subject ?? "").trim().slice(0, 120) : null;
  if (m.channel === "EMAIL" && !subject) throw new Error("An email needs a subject.");
  return prisma.outreachMessage.update({ where: { id: m.id }, data: { body, subject, toAddress: to, draftedBy: m.draftedBy === "AGENT" && body !== m.body ? "USER" : m.draftedBy } });
}

export async function cancelDraft(actor: Actor, messageId: string) {
  assertCan(actor.role, "prospect:run");
  await prisma.outreachMessage.updateMany({ where: { id: messageId, status: { in: ["DRAFT", "APPROVED"] } }, data: { status: "CANCELLED", scheduledFor: null } });
}

/** Everything that must be true before a message may go out, whoever sends it and whenever. */
async function preflight(messageId: string, now: Date, allowed: string[]) {
  const m = await prisma.outreachMessage.findUniqueOrThrow({ where: { id: messageId }, include: { prospect: true } });
  if (!allowed.includes(m.status)) throw new Error("This message has already been handled.");
  await assertContactable(m.prospect);
  // The draft's recipient may have been edited away from the prospect's own details.
  if (await isSuppressed(m.channel === "EMAIL" ? { email: m.toAddress } : { phone: m.toAddress })) {
    throw new Error(`${m.toAddress} is on the do-not-contact list.`);
  }
  const lastSent = await prisma.outreachMessage.findFirst({ where: { prospectId: m.prospectId, status: "SENT" }, orderBy: { sentAt: "desc" } });
  if (lastSent?.sentAt && now.getTime() - lastSent.sentAt.getTime() < minDaysBetween() * 86_400_000) {
    throw new Error(`${m.prospect.code} was contacted on ${lastSent.sentAt.toDateString()}. Messages to one business are at least ${minDaysBetween()} days apart.`);
  }
  const sentOnChannel = await prisma.outreachMessage.count({ where: { prospectId: m.prospectId, channel: m.channel, status: "SENT" } });
  if (sentOnChannel >= maxMessages()) throw new Error(`${m.prospect.code} has had ${sentOnChannel} messages with no reply; that's the limit.`);
  return m;
}

/** Approve an email: it joins the send queue and goes out at the next paced slot (worker.ts). */
export async function approveEmail(actor: Actor, messageId: string, now = new Date()) {
  assertCan(actor.role, "outreach:send");
  const m = await preflight(messageId, now, ["DRAFT"]);
  if (m.channel !== "EMAIL") throw new Error("WhatsApp messages are sent from our phone: open WhatsApp, then mark it sent.");
  await prisma.outreachMessage.update({ where: { id: m.id }, data: { status: "APPROVED", approvedBy: actor.label, scheduledFor: now } });
  await audit(actor, "outreach.approved", "OutreachMessage", m.id, `${m.prospect.code} email queued`);
}

/** Sends one email now: a person with outreach:send pressing "Send now" (approving and sending in one step). */
export async function sendEmail(actor: Actor, messageId: string, deps: { mailer?: Mailer | null; now?: Date } = {}) {
  assertCan(actor.role, "outreach:send");
  return deliver(messageId, ["DRAFT", "APPROVED"], actor, deps);
}

/**
 * The worker's paced send. Only ever sends an email a person already
 * approved (status APPROVED, approvedBy set); every other check runs again.
 */
export async function sendQueuedEmail(messageId: string, deps: { mailer?: Mailer | null; now?: Date } = {}) {
  const queued = await prisma.outreachMessage.findUniqueOrThrow({ where: { id: messageId } });
  if (queued.status !== "APPROVED" || !queued.approvedBy) throw new Error("Only approved emails are sent automatically.");
  return deliver(messageId, ["APPROVED"], { type: "SYSTEM", id: null, label: `Send queue (approved by ${queued.approvedBy})` }, deps);
}

async function deliver(messageId: string, allowed: string[], actor: Actor, deps: { mailer?: Mailer | null; now?: Date }) {
  const now = deps.now ?? new Date();
  const m = await preflight(messageId, now, allowed);
  if (m.channel !== "EMAIL") throw new Error("WhatsApp messages are sent from our phone: open WhatsApp, then mark it sent.");
  const mailer = deps.mailer === undefined ? mailerFromEnv() : deps.mailer;
  if (!mailer) throw new Error("Email sending isn't set up yet (OUTREACH_FROM and SMTP_URL). Copy the message, send it from our mailbox, then press “I sent it myself”.");

  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const today = await prisma.outreachMessage.count({ where: { status: "SENT", sentVia: "EMAIL", sentAt: { gte: startOfDay } } });
  if (today >= dailyLimit()) throw new Error(`Today's limit of ${dailyLimit()} emails is reached (OUTREACH_DAILY_LIMIT). The rest go tomorrow.`);

  try {
    const res = await mailer.send({
      to: m.toAddress,
      subject: m.subject ?? "a quick question",
      text: finalBody(m.body),
      ...(m.threadRef ? { inReplyTo: m.threadRef, references: [m.threadRef] } : {}),
    });
    await prisma.outreachMessage.update({
      where: { id: m.id },
      data: { status: "SENT", sentVia: "EMAIL", sentAt: now, approvedBy: m.approvedBy ?? actor.label, providerId: res.id ?? null, messageRef: res.id ?? null, sendError: null, scheduledFor: null },
    });
  } catch (err) {
    const reason = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    await prisma.outreachMessage.update({ where: { id: m.id }, data: { sendError: reason } });
    throw new Error(`The email didn't go out: ${reason}`);
  }
  await markContacted(m.prospectId);
  await audit(actor, "outreach.sent", "OutreachMessage", m.id, `${m.prospect.code} by email via ${mailer.name}${m.step ? ` (follow-up ${m.step})` : ""}`);
}

/** Kept for the "Approve and send" button: approve and send in one step. */
export async function approveAndSendEmail(actor: Actor, messageId: string, deps: { mailer?: Mailer | null; now?: Date } = {}) {
  return sendEmail(actor, messageId, deps);
}

/** A person sent it themselves: WhatsApp from our phone, or email from our own mailbox. */
export async function markSentManually(actor: Actor, messageId: string, now = new Date()) {
  assertCan(actor.role, "outreach:send");
  const m = await preflight(messageId, now, ["DRAFT", "APPROVED"]);
  await prisma.outreachMessage.update({ where: { id: m.id }, data: { status: "SENT", sentVia: "MANUAL", sentAt: now, approvedBy: actor.label, scheduledFor: null } });
  await markContacted(m.prospectId);
  await audit(actor, "outreach.sent", "OutreachMessage", m.id, `${m.prospect.code} by ${m.channel.toLowerCase()}, sent by hand${m.step ? ` (follow-up ${m.step})` : ""}`);
}

async function markContacted(prospectId: string) {
  await prisma.prospect.updateMany({ where: { id: prospectId, status: { in: ["NEW", "AUDITED", "DRAFTED"] } }, data: { status: "CONTACTED" } });
}

/** They answered (seen in the inbox, or a person saw it on WhatsApp): stop every waiting message. */
export async function markReplied(prospectId: string, when = new Date()) {
  await prisma.outreachMessage.updateMany({ where: { prospectId, status: { in: ["DRAFT", "APPROVED"] } }, data: { status: "CANCELLED", scheduledFor: null } });
  await prisma.prospect.updateMany({ where: { id: prospectId, status: { in: ["NEW", "AUDITED", "DRAFTED", "CONTACTED"] } }, data: { status: "REPLIED", repliedAt: when } });
}
