import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { userActor } from "@/lib/auth/actor";
import { requireUser } from "@/lib/web/session";
import { OUTREACH_STATUSES } from "@/lib/db/enums";
import { messageLog } from "@/lib/prospecting/growth";
import { finalBody } from "@/lib/prospecting/outreach";
import { Badge, NoAccess, PageHead, when } from "../../../_components/ui";

export const metadata: Metadata = { title: "Every message" };

export default async function MessagesPage({ searchParams }: PageProps<"/os/growth/messages">) {
  const user = await requireUser();
  if (!can(user.role, "growth:read")) return <NoAccess capability="growth:read" />;
  const p = await searchParams;
  const one = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
  const filter = { channel: one("channel"), status: one("status"), campaignId: one("campaign"), q: one("q"), page: Number(one("page")) || 1 };
  const [log, campaigns] = await Promise.all([messageLog(userActor(user), filter), prisma.campaign.findMany({ select: { id: true, code: true, name: true }, orderBy: { createdAt: "desc" } })]);
  const qs = (extra: Record<string, string | number>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ channel: filter.channel, status: filter.status, campaign: filter.campaignId, q: filter.q, ...extra })) if (v) q.set(k, String(v));
    return q.toString();
  };

  return (
    <>
      <PageHead title="Every message" crumbs={[{ href: "/os/growth", label: "Growth" }]}>
        <a className="btn ghost" href={`/os/growth/export?${qs({})}`}>
          Download for Excel
        </a>
      </PageHead>

      <form className="panel form" method="get">
        <div className="form-row">
          <div className="field">
            <label htmlFor="q">Search</label>
            <input className="input" id="q" name="q" defaultValue={filter.q} placeholder="Business, email, phone, words in the message" />
          </div>
          <div className="field">
            <label htmlFor="channel">Channel</label>
            <select className="input" id="channel" name="channel" defaultValue={filter.channel}>
              <option value="">Both</option>
              <option value="EMAIL">Email</option>
              <option value="WHATSAPP">WhatsApp</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="status">Status</label>
            <select className="input" id="status" name="status" defaultValue={filter.status}>
              <option value="">Any</option>
              {OUTREACH_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="campaign">Campaign</label>
            <select className="input" id="campaign" name="campaign" defaultValue={filter.campaignId}>
              <option value="">All</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row">
          <button className="btn" type="submit">
            Show
          </button>
          <span className="faint">{log.total} messages</span>
        </div>
      </form>

      <div className="panel">
        {log.rows.length === 0 ? (
          <p className="empty">No messages match.</p>
        ) : (
          <ul className="list" role="list">
            {log.rows.map((m) => (
              <li key={m.id}>
                <div className="item-head">
                  <span>
                    <Link className="code" href={`/os/prospects/${m.prospect.id}`}>
                      {m.prospect.code}
                    </Link>{" "}
                    {m.prospect.name} <span className="faint">· {m.prospect.city}</span>
                  </span>
                  <span className="row">
                    <span className="faint label">
                      {m.channel === "EMAIL" ? "email" : "WhatsApp"} · {m.step === 0 ? "first" : `follow-up ${m.step}`} · {m.sentAt ? when(m.sentAt) : "not sent"}
                    </span>
                    <Badge value={m.status} />
                    {m.prospect.repliedAt && <span className="badge good">replied</span>}
                    {m.prospect.lead && (
                      <Link className="badge info" href={`/os/leads/${m.prospect.lead.id}`}>
                        {m.prospect.lead.code}
                      </Link>
                    )}
                  </span>
                </div>
                <p className="faint mono">
                  To {m.channel === "EMAIL" ? m.toAddress : `+${m.toAddress}`}
                  {m.approvedBy && ` · approved by ${m.approvedBy}`}
                  {m.sentVia === "MANUAL" && " · sent by hand"}
                </p>
                <details className="disclose">
                  <summary>{m.subject ?? "Message"}</summary>
                  <p className="prewrap">{m.status === "SENT" ? finalBody(m.body) : m.body}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
        {log.pages > 1 && (
          <nav className="row" aria-label="Pages">
            {log.page > 1 && (
              <Link className="btn ghost sm" href={`/os/growth/messages?${qs({ page: log.page - 1 })}`}>
                Newer
              </Link>
            )}
            <span className="faint">
              Page {log.page} of {log.pages}
            </span>
            {log.page < log.pages && (
              <Link className="btn ghost sm" href={`/os/growth/messages?${qs({ page: log.page + 1 })}`}>
                Older
              </Link>
            )}
          </nav>
        )}
      </div>
    </>
  );
}
