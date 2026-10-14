import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { decodeStringList } from "@/lib/db/json";
import { PROSPECT_SEGMENTS, PROSPECT_SEGMENT_LABELS } from "@/lib/db/enums";
import { campaignStats, nextSearch } from "@/lib/prospecting/campaigns";
import { placesConfigured } from "@/lib/prospecting/places";
import { ActionForm } from "../../../_components/ActionForm";
import { Badge, NoAccess, PageHead, ago } from "../../../_components/ui";
import { setCampaignStatusAction, updateCampaignAction } from "../../actions/campaigns";

export async function generateMetadata({ params }: PageProps<"/os/campaigns/[id]">): Promise<Metadata> {
  const c = await prisma.campaign.findUnique({ where: { id: (await params).id }, select: { code: true, name: true } });
  return { title: c ? `${c.code} · ${c.name}` : "Campaign" };
}

export default async function CampaignPage({ params }: PageProps<"/os/campaigns/[id]">) {
  const user = await requireUser();
  if (!can(user.role, "prospect:read")) return <NoAccess capability="prospect:read" />;
  const { id } = await params;
  const c = await prisma.campaign.findUnique({ where: { id } });
  if (!c) notFound();
  const [stats, searches, waiting] = await Promise.all([
    campaignStats(c.id),
    prisma.prospectSearch.findMany({ where: { campaignId: c.id }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.outreachMessage.groupBy({ by: ["channel"], where: { campaignId: c.id, status: "DRAFT" }, _count: true }),
  ]);
  const canRun = can(user.role, "prospect:run");
  const next = nextSearch(c);
  const waitingOn = (ch: string) => waiting.find((w) => w.channel === ch)?._count ?? 0;
  const places = placesConfigured();

  return (
    <>
      <PageHead title={c.name} eyebrow={c.code} crumbs={[{ href: "/os/campaigns", label: "Campaigns" }]}>
        <Badge value={c.status} />
      </PageHead>

      <div className="split">
        <div className="stack">
          <section className="panel" aria-labelledby="goal">
            <h2 id="goal">Goal</h2>
            <blockquote className="prewrap" style={{ borderLeft: "3px solid var(--blue)", paddingLeft: "0.9rem" }}>
              {c.goal}
            </blockquote>
            {canRun && (
              <div className="row">
                {c.status !== "ACTIVE" && (
                  <ActionForm action={setCampaignStatusAction} submit={c.status === "DRAFT" ? "Start the campaign" : "Resume"} className="" confirm={c.status === "DRAFT" ? "I've checked the plan below." : undefined}>
                    <input type="hidden" name="campaignId" value={c.id} />
                    <input type="hidden" name="status" value="ACTIVE" />
                  </ActionForm>
                )}
                {c.status === "ACTIVE" && (
                  <ActionForm action={setCampaignStatusAction} submit="Pause" variant="ghost" className="">
                    <input type="hidden" name="campaignId" value={c.id} />
                    <input type="hidden" name="status" value="PAUSED" />
                  </ActionForm>
                )}
                {c.status !== "DONE" && c.status !== "DRAFT" && (
                  <ActionForm action={setCampaignStatusAction} submit="Finish" variant="ghost sm" className="">
                    <input type="hidden" name="campaignId" value={c.id} />
                    <input type="hidden" name="status" value="DONE" />
                  </ActionForm>
                )}
              </div>
            )}
          </section>

          <section className="panel" aria-labelledby="results">
            <h2 id="results">What&apos;s working</h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th>Messages sent</th>
                    <th>Businesses reached</th>
                    <th>Replied</th>
                    <th>Reply rate</th>
                    <th>Waiting for you</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["Email", stats.email, waitingOn("EMAIL")],
                      ["WhatsApp", stats.whatsapp, waitingOn("WHATSAPP")],
                    ] as const
                  ).map(([label, s, w]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td className="num">{s.messages}</td>
                      <td className="num">{s.businesses}</td>
                      <td className="num">{s.replied}</td>
                      <td className="num">{s.replyRate}%</td>
                      <td className="num">{w ? <Link href="/os/outreach">{w} to review</Link> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="faint">
              {stats.prospects} businesses found · {stats.checked} checked · {stats.leads} became leads.{" "}
              <Link href={`/os/prospects?status=all`}>See prospects</Link>
            </p>
          </section>

          <section className="panel" aria-labelledby="searches">
            <div className="panel-head">
              <h2 id="searches">Searches</h2>
              {next && c.status === "ACTIVE" && (
                <span className="label">
                  next: {next.query} in {next.location}
                </span>
              )}
            </div>
            {searches.length === 0 ? (
              <p className="empty">None yet. The worker searches once the campaign is running.</p>
            ) : (
              <ul className="list" role="list">
                {searches.map((s) => (
                  <li key={s.id}>
                    <div className="item-head">
                      <Link href={`/os/prospects?search=${s.id}`}>
                        {s.query} in {s.location}
                      </Link>
                      <span className="faint">
                        {decodeStringList(s.sources).map((x) => (x === "PLACES" ? "Places" : "web")).join(" + ")} · {s.found} found, {s.added} new · {ago(s.createdAt)}
                      </span>
                    </div>
                    {s.notes && <p className="faint">{s.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="stack">
          <section className="panel" aria-labelledby="plan">
            <h2 id="plan">Plan and daily budget</h2>
            <ActionForm action={updateCampaignAction} submit="Save" variant="sm" readOnly={!canRun}>
              <input type="hidden" name="campaignId" value={c.id} />
              <div className="field">
                <label htmlFor="name">Name</label>
                <input className="input" id="name" name="name" defaultValue={c.name} />
              </div>
              <div className="field">
                <label htmlFor="segment">Who it&apos;s for</label>
                <select className="input" id="segment" name="segment" defaultValue={c.segment}>
                  {PROSPECT_SEGMENTS.map((s) => (
                    <option key={s} value={s}>
                      {PROSPECT_SEGMENT_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="queries">Search for (one per line)</label>
                <textarea className="input" id="queries" name="queries" rows={4} defaultValue={decodeStringList(c.queries).join("\n")} />
              </div>
              <div className="field">
                <label htmlFor="locations">In (one per line, best first)</label>
                <textarea className="input" id="locations" name="locations" rows={4} defaultValue={decodeStringList(c.locations).join("\n")} />
              </div>
              <div className="field">
                <label htmlFor="angle">What first messages lead with</label>
                <textarea className="input" id="angle" name="angle" rows={2} defaultValue={c.angle ?? ""} />
              </div>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="newContactsPerDay">New businesses a day</label>
                  <input className="input" id="newContactsPerDay" name="newContactsPerDay" type="number" min={0} max={1000} defaultValue={c.newContactsPerDay} />
                </div>
                <div className="field">
                  <label htmlFor="emailShare">% by email</label>
                  <input className="input" id="emailShare" name="emailShare" type="number" min={0} max={100} defaultValue={c.emailShare} />
                </div>
              </div>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="followUpDays">Follow up after (days)</label>
                  <input className="input" id="followUpDays" name="followUpDays" defaultValue={decodeStringList(c.followUpDays).join(", ")} />
                </div>
                <div className="field">
                  <label htmlFor="minFit">Lowest fit to contact</label>
                  <input className="input" id="minFit" name="minFit" type="number" min={0} max={100} defaultValue={c.minFit} />
                </div>
              </div>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="placesSearchesPerDay">Places searches a day{!places && " (not set up)"}</label>
                  <input className="input" id="placesSearchesPerDay" name="placesSearchesPerDay" type="number" min={0} max={100} defaultValue={c.placesSearchesPerDay} />
                </div>
                <div className="field">
                  <label htmlFor="webSearchesPerDay">Web searches a day</label>
                  <input className="input" id="webSearchesPerDay" name="webSearchesPerDay" type="number" min={0} max={20} defaultValue={c.webSearchesPerDay} />
                </div>
                <div className="field">
                  <label htmlFor="checksPerDay">Checks a day</label>
                  <input className="input" id="checksPerDay" name="checksPerDay" type="number" min={0} max={500} defaultValue={c.checksPerDay} />
                </div>
              </div>
              <p className="faint" style={{ fontSize: "0.8125rem" }}>
                Places searches are cheap (about 20 businesses each). A web search takes a few minutes and uses a lot of the Claude plan, so keep it low.
                Every message still waits for a person in the outreach queue.
              </p>
            </ActionForm>
          </section>
        </aside>
      </div>
    </>
  );
}
