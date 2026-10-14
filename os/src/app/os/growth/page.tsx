import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { userActor } from "@/lib/auth/actor";
import { requireUser } from "@/lib/web/session";
import { decodeStringList } from "@/lib/db/json";
import { PROSPECT_SEGMENTS, PROSPECT_SEGMENT_LABELS } from "@/lib/db/enums";
import { byCampaign, funnel, outboundLeads, replies, type Funnel } from "@/lib/prospecting/growth";
import { getAutopilot, outboundTallies } from "@/lib/prospecting/autopilot";
import { workerStatus } from "@/lib/prospecting/worker";
import { ActionForm } from "../../_components/ActionForm";
import { Badge, NoAccess, PageHead, ago, when } from "../../_components/ui";
import { reviewNowAction, updateAutopilotAction } from "../actions/growth";

export const metadata: Metadata = { title: "Growth" };

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const rate = (t?: { contacted: number; replied: number }) => (t && t.contacted ? `${((t.replied / t.contacted) * 100).toFixed(1)}%` : "—");

const STAGES: [keyof Funnel, string][] = [
  ["found", "Businesses found"],
  ["checked", "Checked and scored"],
  ["contacted", "Contacted"],
  ["replied", "Replied"],
  ["leads", "Became leads"],
  ["won", "Won"],
];

export default async function GrowthPage() {
  const user = await requireUser();
  if (!can(user.role, "growth:read")) return <NoAccess capability="growth:read" />;
  const actor = userActor(user);
  const now = new Date();
  const today = new Date(new Date(now).setHours(0, 0, 0, 0));
  const week = new Date(today.getTime() - 6 * 86_400_000);

  const [fToday, fWeek, fAll, tallies, campaigns, replied, leads, auto, reviews, worker, emailsWaiting, whatsappWaiting, repliesWaiting] = await Promise.all([
    funnel(actor, today),
    funnel(actor, week),
    funnel(actor),
    outboundTallies(new Date(0)),
    byCampaign(actor),
    replies(actor, 15),
    outboundLeads(actor, 15),
    getAutopilot(),
    prisma.autopilotReview.findMany({ orderBy: { createdAt: "desc" }, take: 4 }),
    workerStatus(),
    prisma.outreachMessage.count({ where: { status: "DRAFT", channel: "EMAIL" } }),
    prisma.outreachMessage.count({ where: { status: "DRAFT", channel: "WHATSAPP" } }),
    prisma.prospect.count({ where: { status: "REPLIED" } }),
  ]);
  const funnels: [string, Funnel][] = [
    ["Today", fToday],
    ["Last 7 days", fWeek],
    ["All time", fAll],
  ];
  const cities = Object.entries(tallies.city).sort((a, b) => b[1].contacted - a[1].contacted).slice(0, 12);

  return (
    <>
      <PageHead title="Growth" eyebrow="Owners">
        <Link className="btn ghost" href="/os/growth/messages">
          Every message
        </Link>
      </PageHead>

      <section className="panel" aria-labelledby="now">
        <h2 id="now">Needs you now</h2>
        <div className="row">
          <Link className={`btn ${emailsWaiting ? "" : "ghost"}`} href="/os/outreach">
            {emailsWaiting} emails to approve
          </Link>
          <Link className={`btn ${whatsappWaiting ? "" : "ghost"}`} href="/os/outreach#whatsapp">
            {whatsappWaiting} WhatsApp to send
          </Link>
          <Link className={`btn ${repliesWaiting ? "" : "ghost"}`} href="/os/prospects?status=REPLIED">
            {repliesWaiting} replies to answer
          </Link>
        </div>
        <p className="faint">
          Worker {worker.lastRunAt ? `ran ${ago(worker.lastRunAt)}` : "hasn't run"}
          {worker.stale && auto.on ? " — it isn't running, so autopilot is standing still (npm run campaigns:worker)" : ""}.
          {worker.inboxCheckedAt ? ` Inbox checked ${ago(worker.inboxCheckedAt)}.` : " Inbox not connected yet (IMAP_URL), so replies must be marked by hand."}
        </p>
      </section>

      <section className="panel" aria-labelledby="funnel">
        <h2 id="funnel">Outbound funnel</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th />
                {funnels.map(([label]) => (
                  <th key={label} className="num">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STAGES.map(([key, label]) => (
                <tr key={key}>
                  <td>{label}</td>
                  {funnels.map(([period, f]) => (
                    <td key={period} className="num">
                      {f[key]}
                      {key === "won" && f.wonValue > 0 && <div className="faint">{inr(f.wonValue)}</div>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="split">
        <div className="stack">
          <section className="panel" aria-labelledby="working">
            <h2 id="working">What&apos;s working (all time)</h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>By</th>
                    <th className="num">Reached</th>
                    <th className="num">Replied</th>
                    <th className="num">Reply rate</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["Email", tallies.channel.EMAIL],
                      ["WhatsApp", tallies.channel.WHATSAPP],
                    ] as const
                  ).map(([label, t]) => (
                    <tr key={label}>
                      <td>
                        <b>{label}</b>
                      </td>
                      <td className="num">{t?.contacted ?? 0}</td>
                      <td className="num">{t?.replied ?? 0}</td>
                      <td className="num">{rate(t)}</td>
                    </tr>
                  ))}
                  {PROSPECT_SEGMENTS.map((s) => (
                    <tr key={s}>
                      <td>{PROSPECT_SEGMENT_LABELS[s]}</td>
                      <td className="num">{tallies.segment[s]?.contacted ?? 0}</td>
                      <td className="num">{tallies.segment[s]?.replied ?? 0}</td>
                      <td className="num">{rate(tallies.segment[s])}</td>
                    </tr>
                  ))}
                  {cities.map(([city, t]) => (
                    <tr key={city}>
                      <td className="faint">{city}</td>
                      <td className="num">{t.contacted}</td>
                      <td className="num">{t.replied}</td>
                      <td className="num">{rate(t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel" aria-labelledby="campaigns">
            <h2 id="campaigns">Campaigns</h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th className="num">Email reached / replied</th>
                    <th className="num">WhatsApp reached / replied</th>
                    <th className="num">Leads</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map(({ campaign: c, email, whatsapp, all }) => (
                    <tr key={c.id}>
                      <td>
                        <Link className="code" href={`/os/campaigns/${c.id}`}>
                          {c.code}
                        </Link>{" "}
                        {c.name} <Badge value={c.status} />
                      </td>
                      <td className="num">
                        {email.reached} / {email.replied} <span className="faint">({email.rate}%)</span>
                      </td>
                      <td className="num">
                        {whatsapp.reached} / {whatsapp.replied} <span className="faint">({whatsapp.rate}%)</span>
                      </td>
                      <td className="num">{all.leads}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel" aria-labelledby="replies">
            <div className="panel-head">
              <h2 id="replies">Replies</h2>
              <Link href="/os/prospects?status=REPLIED">All waiting</Link>
            </div>
            {replied.length === 0 ? (
              <p className="empty">No replies yet.</p>
            ) : (
              <ul className="list" role="list">
                {replied.map((p) => (
                  <li key={p.id}>
                    <div className="item-head">
                      <span>
                        <Link className="code" href={`/os/prospects/${p.id}`}>
                          {p.code}
                        </Link>{" "}
                        {p.name} <span className="faint">· {p.city}</span>
                      </span>
                      <span className="row">
                        <span className="faint">{p.repliedAt && when(p.repliedAt)}</span>
                        {p.lead ? (
                          <Link className="badge good" href={`/os/leads/${p.lead.id}`}>
                            {p.lead.code}
                          </Link>
                        ) : (
                          <Badge value={p.status} />
                        )}
                      </span>
                    </div>
                    {p.reply && <p className="muted">{p.reply}</p>}
                    {p.campaign && <p className="faint">from {p.campaign.name}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel" aria-labelledby="leads">
            <h2 id="leads">Leads from outreach</h2>
            {leads.length === 0 ? (
              <p className="empty">None yet. A reply becomes a lead with “Create lead” on the business&apos;s page.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Lead</th>
                      <th>From</th>
                      <th>Status</th>
                      <th className="num">Proposal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((l) => {
                      const proposal = l.proposals.find((p) => p.status === "APPROVED") ?? l.proposals[0];
                      return (
                        <tr key={l.id}>
                          <td>
                            <Link className="code" href={`/os/leads/${l.id}`}>
                              {l.code}
                            </Link>{" "}
                            {l.company ?? l.contactName}
                          </td>
                          <td className="faint">
                            {l.prospect ? (
                              <>
                                <Link href={`/os/prospects/${l.prospect.id}`}>{l.prospect.code}</Link>
                                {l.prospect.campaign && ` · ${l.prospect.campaign.name}`}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            <Badge value={l.status} />
                          </td>
                          <td className="num">{proposal ? `${inr(proposal.priceTotal)} · ${proposal.status.toLowerCase()}` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="stack">
          <section className="panel" aria-labelledby="autopilot">
            <h2 id="autopilot">Autopilot</h2>
            <p className="muted" style={{ fontSize: "0.875rem" }}>
              Searches all three segments across these cities by itself, drafts messages for the best fits, and re-balances every week from what gets replies. You only
              approve and send.
            </p>
            <ActionForm action={updateAutopilotAction} submit="Save" variant="sm">
              <label className="check">
                <input type="checkbox" name="on" defaultChecked={auto.on} /> Autopilot on
              </label>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="newContactsPerDay">New businesses a day</label>
                  <input className="input" id="newContactsPerDay" name="newContactsPerDay" type="number" min={0} max={1000} defaultValue={auto.newContactsPerDay} />
                </div>
                <div className="field">
                  <label htmlFor="emailShare">% by email</label>
                  <input className="input" id="emailShare" name="emailShare" type="number" min={0} max={100} defaultValue={auto.emailShare} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="cities">Cities (one per line, best first)</label>
                <textarea className="input" id="cities" name="cities" rows={6} defaultValue={decodeStringList(auto.cities).join("\n")} />
              </div>
            </ActionForm>
          </section>

          <section className="panel" aria-labelledby="reviews">
            <div className="panel-head">
              <h2 id="reviews">Weekly reviews</h2>
              {auto.on && (
                <ActionForm action={reviewNowAction} submit="Review now" variant="ghost sm" className="">
                  {null}
                </ActionForm>
              )}
            </div>
            {reviews.length === 0 ? (
              <p className="empty">The first review runs a week after autopilot starts.</p>
            ) : (
              <ul className="list" role="list">
                {reviews.map((r) => (
                  <li key={r.id}>
                    <span className="faint label">{when(r.createdAt)}</span>
                    <p>{r.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
