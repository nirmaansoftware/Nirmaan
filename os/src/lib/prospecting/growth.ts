import { prisma } from "../db/client";
import { assertCan } from "../auth/permissions";
import type { Actor } from "../auth/actor";
import { isOneOf, OUTREACH_CHANNELS, OUTREACH_STATUSES } from "../db/enums";
import { finalBody } from "./outreach";

/**
 * The Growth dashboard's numbers (owners only, capability growth:read):
 * the outbound funnel from "found" to "won", channel against channel, and
 * the full record of every message, reply and lead, filterable and
 * exportable. Everything is read straight from the tables the pipeline
 * writes, so the dashboard can't disagree with what actually happened.
 */
export interface Funnel {
  found: number;
  checked: number;
  contacted: number;
  replied: number;
  leads: number;
  won: number;
  wonValue: number;
}

export async function funnel(actor: Actor, since?: Date): Promise<Funnel> {
  assertCan(actor.role, "growth:read");
  const after = since ? { gte: since } : undefined;
  const [found, checked, contacted, replied, leads, won] = await Promise.all([
    prisma.prospect.count({ where: after ? { createdAt: after } : {} }),
    prisma.prospect.count({ where: { auditedAt: after ?? { not: null } } }),
    prisma.outreachMessage.findMany({ where: { status: "SENT", ...(after ? { sentAt: after } : {}) }, distinct: ["prospectId"], select: { prospectId: true } }),
    prisma.prospect.count({ where: { repliedAt: after ?? { not: null } } }),
    prisma.lead.count({ where: { source: "OUTBOUND", ...(after ? { createdAt: after } : {}) } }),
    prisma.proposal.findMany({
      where: { status: "APPROVED", lead: { source: "OUTBOUND" }, ...(after ? { decidedAt: after } : {}) },
      select: { priceTotal: true },
    }),
  ]);
  return { found, checked, contacted: contacted.length, replied, leads, won: won.length, wonValue: won.reduce((n, p) => n + p.priceTotal, 0) };
}

export interface MessageFilter {
  channel?: string;
  status?: string;
  campaignId?: string;
  q?: string;
  page?: number;
}

const PAGE = 50;

/** Every outreach message, newest first, with who it went to and what happened next. */
export async function messageLog(actor: Actor, f: MessageFilter = {}) {
  assertCan(actor.role, "growth:read");
  const q = f.q?.trim();
  const where = {
    ...(isOneOf(OUTREACH_CHANNELS, f.channel) ? { channel: f.channel } : {}),
    ...(isOneOf(OUTREACH_STATUSES, f.status) ? { status: f.status } : {}),
    ...(f.campaignId ? { campaignId: f.campaignId } : {}),
    ...(q
      ? { OR: [{ toAddress: { contains: q } }, { body: { contains: q } }, { subject: { contains: q } }, { prospect: { name: { contains: q } } }, { prospect: { code: { contains: q.toUpperCase() } } }] }
      : {}),
  };
  const page = Math.max(1, f.page ?? 1);
  const [rows, total] = await Promise.all([
    prisma.outreachMessage.findMany({
      where,
      orderBy: [{ sentAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { prospect: { select: { id: true, code: true, name: true, city: true, segment: true, status: true, repliedAt: true, leadId: true, lead: { select: { id: true, code: true, status: true } } } } },
    }),
    prisma.outreachMessage.count({ where }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE)) };
}

/** Businesses that replied, most recent first, with the reply as the inbox check recorded it. */
export async function replies(actor: Actor, take = 50) {
  assertCan(actor.role, "growth:read");
  const prospects = await prisma.prospect.findMany({
    where: { repliedAt: { not: null } },
    orderBy: { repliedAt: "desc" },
    take,
    include: { lead: { select: { id: true, code: true, status: true } }, campaign: { select: { id: true, code: true, name: true } } },
  });
  const said = await prisma.auditLog.findMany({ where: { action: "prospect.replied", entityId: { in: prospects.map((p) => p.id) } }, orderBy: { createdAt: "desc" } });
  return prospects.map((p) => ({ ...p, reply: said.find((a) => a.entityId === p.id)?.detail ?? null }));
}

/** Leads that came from outbound, with how far each got. */
export async function outboundLeads(actor: Actor, take = 50) {
  assertCan(actor.role, "growth:read");
  return prisma.lead.findMany({
    where: { source: "OUTBOUND" },
    orderBy: { createdAt: "desc" },
    take,
    include: { prospect: { select: { id: true, code: true, name: true, campaign: { select: { code: true, name: true } } } }, proposals: { select: { code: true, status: true, priceTotal: true } } },
  });
}

/** Reply rate by campaign, split by channel, for "what's working". */
export async function byCampaign(actor: Actor) {
  assertCan(actor.role, "growth:read");
  const campaigns = await prisma.campaign.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  const sent = await prisma.outreachMessage.findMany({ where: { status: "SENT", campaignId: { not: null } }, select: { campaignId: true, channel: true, prospectId: true, prospect: { select: { repliedAt: true, leadId: true } } } });
  return campaigns.map((c) => {
    const mine = sent.filter((m) => m.campaignId === c.id);
    const tally = (channel?: string) => {
      const ms = channel ? mine.filter((m) => m.channel === channel) : mine;
      const ids = new Map(ms.map((m) => [m.prospectId, m.prospect]));
      const replied = [...ids.values()].filter((p) => p.repliedAt).length;
      return { reached: ids.size, replied, rate: ids.size ? Math.round((replied / ids.size) * 1000) / 10 : 0, leads: [...ids.values()].filter((p) => p.leadId).length };
    };
    return { campaign: c, all: tally(), email: tally("EMAIL"), whatsapp: tally("WHATSAPP") };
  });
}

/** CSV of the message log with the same filters (all pages), for Excel. */
export async function messagesCsv(actor: Actor, f: MessageFilter = {}): Promise<string> {
  assertCan(actor.role, "growth:read");
  const header = ["Sent", "Channel", "Status", "Step", "Business code", "Business", "City", "To", "Subject", "Message", "Approved by", "Replied", "Lead"];
  const lines = [header];
  for (let page = 1; ; page++) {
    const { rows, pages } = await messageLog(actor, { ...f, page });
    for (const m of rows) {
      lines.push([
        m.sentAt?.toISOString() ?? "",
        m.channel,
        m.status,
        m.step === 0 ? "first" : `follow-up ${m.step}`,
        m.prospect.code,
        m.prospect.name,
        m.prospect.city ?? "",
        m.toAddress,
        m.subject ?? "",
        m.status === "SENT" ? finalBody(m.body) : m.body,
        m.approvedBy ?? "",
        m.prospect.repliedAt?.toISOString() ?? "",
        m.prospect.lead?.code ?? "",
      ]);
    }
    if (page >= pages || page >= 200) break;
  }
  // Quote every cell; neutralise spreadsheet formulas (a cell starting with = + - @).
  const cell = (v: string) => `"${(/^[=+\-@]/.test(v) ? `'${v}` : v).replaceAll('"', '""')}"`;
  return "﻿" + lines.map((l) => l.map(cell).join(",")).join("\r\n");
}
