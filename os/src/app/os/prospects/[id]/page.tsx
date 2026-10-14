import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { decodeStringList } from "@/lib/db/json";
import { packageName } from "@/lib/prospecting/basics";
import { describeSignals, type SiteSignals } from "@/lib/prospecting/siteSignals";
import { OPT_OUT_LINE, whatsappLink } from "@/lib/prospecting/outreach";
import { sendingConfigured } from "@/lib/prospecting/mailer";
import { segmentLabel } from "@/lib/prospecting/service";
import { ActionForm } from "../../../_components/ActionForm";
import { Badge, NoAccess, PageHead, ago, when } from "../../../_components/ui";
import {
  auditProspectAction,
  cancelDraftAction,
  convertAction,
  doNotContactAction,
  draftAction,
  markSentAction,
  sendEmailAction,
  approveEmailAction,
  draftFollowUpAction,
  setProspectStatusAction,
  updateContactAction,
  updateDraftAction,
} from "../../actions/prospects";

export async function generateMetadata({ params }: PageProps<"/os/prospects/[id]">): Promise<Metadata> {
  const p = await prisma.prospect.findUnique({ where: { id: (await params).id }, select: { code: true, name: true } });
  return { title: p ? `${p.code} · ${p.name}` : "Prospect" };
}

function signalsOf(raw: string | null): SiteSignals | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SiteSignals;
  } catch {
    return null;
  }
}

export default async function ProspectPage({ params }: PageProps<"/os/prospects/[id]">) {
  const user = await requireUser();
  if (!can(user.role, "prospect:read")) return <NoAccess capability="prospect:read" />;
  const { id } = await params;
  const p = await prisma.prospect.findUnique({
    where: { id },
    include: { search: true, lead: { select: { id: true, code: true } }, messages: { orderBy: { createdAt: "desc" } } },
  });
  if (!p) notFound();

  const canRun = can(user.role, "prospect:run");
  const canSend = can(user.role, "outreach:send");
  const closed = ["DO_NOT_CONTACT", "CONVERTED", "DISMISSED"].includes(p.status);
  const signals = signalsOf(p.siteSignals);
  const evidence = decodeStringList(p.evidence);
  const sending = sendingConfigured();
  const lastSent = p.messages.find((m) => m.status === "SENT");
  const openDraft = (channel: string) => p.messages.some((m) => m.channel === channel && (m.status === "DRAFT" || m.status === "APPROVED"));
  const sentOn = (channel: string) => p.messages.some((m) => m.channel === channel && m.status === "SENT");

  return (
    <>
      <PageHead title={p.name} eyebrow={p.code} crumbs={[{ href: "/os/prospects", label: "Prospects" }]}>
        <Badge value={p.status} />
      </PageHead>

      <div className="split">
        <div className="stack">
          <section className="panel" aria-labelledby="fit">
            <div className="panel-head">
              <h2 id="fit">Fit</h2>
              {p.auditedAt && <span className="label">checked {ago(p.auditedAt)}</span>}
            </div>
            {p.fitScore == null ? (
              <p className="empty">Not checked yet. Checking reads their website and scores the fit against who Nirmaan helps best.</p>
            ) : (
              <>
                <p>
                  <b className="num" style={{ fontSize: "1.5rem" }}>{p.fitScore}</b>
                  <span className="faint"> / 100</span>
                  {p.suggestedPackage && <> · probably <b>{packageName(p.suggestedPackage)}</b></>}
                </p>
                <blockquote className="prewrap" style={{ borderLeft: "3px solid var(--blue)", paddingLeft: "0.9rem" }}>
                  {p.problem}
                </blockquote>
                {evidence.length > 0 && (
                  <ul style={{ paddingLeft: "1.1rem" }}>
                    {evidence.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}
                <p className="faint" style={{ fontSize: "0.8125rem" }}>
                  A score is advice from Claude, based only on what&apos;s shown here. You decide whom to contact.
                </p>
              </>
            )}
            {canRun && !closed && (
              <ActionForm action={auditProspectAction} submit={p.fitScore == null ? "Check this business" : "Check again"} pendingLabel="Reading their website and scoring… (up to a minute)" variant="ghost">
                <input type="hidden" name="prospectId" value={p.id} />
              </ActionForm>
            )}
          </section>

          {signals && (
            <section className="panel" aria-labelledby="site">
              <h2 id="site">What their website shows</h2>
              <ul className="list" role="list">
                {describeSignals(signals).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="panel" aria-labelledby="outreach">
            <div className="panel-head">
              <h2 id="outreach">Outreach</h2>
              {lastSent?.sentAt && <span className="label">last contacted {when(lastSent.sentAt)}</span>}
            </div>
            {canRun && !closed && (
              <div className="row">
                {(["EMAIL", "WHATSAPP"] as const).map((channel) => {
                  const has = channel === "EMAIL" ? p.email : p.phone;
                  if (!has || openDraft(channel)) return null;
                  const label = channel === "EMAIL" ? "email" : "WhatsApp message";
                  const followUp = sentOn(channel);
                  if (followUp && p.status !== "CONTACTED") return null;
                  return (
                    <ActionForm
                      key={channel}
                      action={followUp ? draftFollowUpAction : draftAction}
                      submit={followUp ? `Draft a follow-up ${label}` : `Draft ${channel === "EMAIL" ? "an" : "a"} ${label}`}
                      pendingLabel="Writing… (under a minute)"
                      variant="ghost"
                      className=""
                    >
                      <input type="hidden" name="prospectId" value={p.id} />
                      <input type="hidden" name="channel" value={channel} />
                    </ActionForm>
                  );
                })}
                {!p.email && !p.phone && <p className="empty">No email or phone yet. Add one under Contact details.</p>}
              </div>
            )}
            {p.messages.length === 0 ? (
              <p className="empty">No messages yet.</p>
            ) : (
              <ul className="list" role="list">
                {p.messages.map((m) => {
                  const wa = m.channel === "WHATSAPP" && m.status === "DRAFT" ? whatsappLink(m.toAddress, m.body) : null;
                  return (
                    <li key={m.id}>
                      <div className="item-head">
                        <span>
                          {m.step > 0 ? `Follow-up ${m.step} · ` : ""}
                          {m.channel === "EMAIL" ? "Email" : "WhatsApp"} to <span className="mono">{m.channel === "EMAIL" ? m.toAddress : `+${m.toAddress}`}</span>
                        </span>
                        <span className="row">
                          <span className="faint label">{m.draftedBy === "AGENT" ? "drafted by Claude" : "edited by the team"}</span>
                          <Badge value={m.status} />
                        </span>
                      </div>
                      {m.status === "DRAFT" && canRun ? (
                        <ActionForm action={updateDraftAction} submit="Save changes" variant="ghost sm">
                          <input type="hidden" name="messageId" value={m.id} />
                          <input type="hidden" name="prospectId" value={p.id} />
                          <div className="form-row">
                            <div className="field">
                              <label htmlFor={`to-${m.id}`}>{m.channel === "EMAIL" ? "To" : "WhatsApp number"}</label>
                              <input className="input" id={`to-${m.id}`} name="toAddress" defaultValue={m.toAddress} required />
                            </div>
                            {m.channel === "EMAIL" && (
                              <div className="field">
                                <label htmlFor={`subject-${m.id}`}>Subject</label>
                                <input className="input" id={`subject-${m.id}`} name="subject" defaultValue={m.subject ?? ""} required maxLength={120} />
                              </div>
                            )}
                          </div>
                          <label className="label" htmlFor={`body-${m.id}`}>Message</label>
                          <textarea className="input" id={`body-${m.id}`} name="body" defaultValue={m.body} rows={10} required minLength={20} maxLength={3000} />
                          <p className="faint" style={{ fontSize: "0.8125rem" }}>Always added at the end: “{OPT_OUT_LINE}”</p>
                        </ActionForm>
                      ) : (
                        <>
                          {m.subject && <p><b>{m.subject}</b></p>}
                          <p className="prewrap">{m.body}</p>
                          {m.sentAt && (
                            <p className="faint">
                              Sent {when(m.sentAt)} {m.sentVia === "MANUAL" ? "by hand" : "from the OS"}
                              {m.approvedBy && `, approved by ${m.approvedBy}`}
                            </p>
                          )}
                        </>
                      )}
                      {m.sendError && m.status === "DRAFT" && <p className="notice error">Last attempt failed: {m.sendError}</p>}
                      {m.status === "DRAFT" && (
                        <div className="row">
                          {canSend && m.channel === "EMAIL" && (
                            <ActionForm action={approveEmailAction} submit="Approve" className="">
                              <input type="hidden" name="messageId" value={m.id} />
                              <input type="hidden" name="prospectId" value={p.id} />
                            </ActionForm>
                          )}
                          {canSend && m.channel === "EMAIL" && sending && (
                            <ActionForm action={sendEmailAction} submit="Send now" pendingLabel="Sending…" variant="ghost" className="">
                              <input type="hidden" name="messageId" value={m.id} />
                              <input type="hidden" name="prospectId" value={p.id} />
                            </ActionForm>
                          )}
                          {wa && (
                            <a className="btn" href={wa} target="_blank" rel="noopener noreferrer">
                              Open in WhatsApp
                            </a>
                          )}
                          {canSend && (
                            <ActionForm action={markSentAction} submit="I sent it myself" variant="ghost" confirm={m.channel === "EMAIL" && sending ? undefined : "I sent exactly this message, including the opt-out line."} className="">
                              <input type="hidden" name="messageId" value={m.id} />
                              <input type="hidden" name="prospectId" value={p.id} />
                            </ActionForm>
                          )}
                          {canRun && (
                            <ActionForm action={cancelDraftAction} submit="Discard" variant="danger sm" className="">
                              <input type="hidden" name="messageId" value={m.id} />
                              <input type="hidden" name="prospectId" value={p.id} />
                            </ActionForm>
                          )}
                        </div>
                      )}
                      {m.status === "APPROVED" && (
                        <div className="row">
                          <span className="faint">Approved by {m.approvedBy}; goes out at the next paced slot in sending hours.</span>
                          {canRun && (
                            <ActionForm action={cancelDraftAction} submit="Cancel" variant="ghost sm" className="">
                              <input type="hidden" name="messageId" value={m.id} />
                              <input type="hidden" name="prospectId" value={p.id} />
                            </ActionForm>
                          )}
                        </div>
                      )}
                      {m.status === "DRAFT" && !canSend && <p className="faint">Someone with permission to send (founder or CTO) approves this.</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {canRun && ["CONTACTED", "REPLIED"].includes(p.status) && can(user.role, "lead:write") && (
            <section className="panel" aria-labelledby="convert">
              <h2 id="convert">They replied? Make it a lead</h2>
              <p className="muted">Write the problem the way they described it. From here it follows the normal lead pipeline: discovery, proposal, project.</p>
              <ActionForm action={convertAction} submit="Create lead" pendingLabel="Creating…">
                <input type="hidden" name="prospectId" value={p.id} />
                <div className="field">
                  <label htmlFor="problem">The problem, in their words</label>
                  <textarea className="input" id="problem" name="problem" rows={4} required minLength={20} />
                </div>
                <div className="form-row">
                  <div className="field">
                    <label htmlFor="contactName">Contact name</label>
                    <input className="input" id="contactName" name="contactName" required />
                  </div>
                  <div className="field">
                    <label htmlFor="contactEmail">Email</label>
                    <input className="input" id="contactEmail" name="contactEmail" type="email" required defaultValue={p.email ?? ""} />
                  </div>
                  <div className="field">
                    <label htmlFor="contactPhone">Phone</label>
                    <input className="input" id="contactPhone" name="contactPhone" defaultValue={p.phone ?? ""} />
                  </div>
                </div>
              </ActionForm>
            </section>
          )}
        </div>

        <aside className="stack">
          <section className="panel" aria-labelledby="about">
            <h2 id="about">Business</h2>
            <dl className="dl">
              <dt>Segment</dt>
              <dd>{segmentLabel(p.segment)}</dd>
              {p.category && (
                <>
                  <dt>Category</dt>
                  <dd>{p.category}</dd>
                </>
              )}
              {(p.address || p.city) && (
                <>
                  <dt>Where</dt>
                  <dd>{p.address ?? p.city}</dd>
                </>
              )}
              {p.rating != null && (
                <>
                  <dt>Google</dt>
                  <dd>
                    ★ {p.rating} from {p.ratingCount ?? 0} reviews
                  </dd>
                </>
              )}
              <dt>Found via</dt>
              <dd>
                {p.source === "PLACES" ? "Google Places" : p.source === "WEB" ? "web search" : "added by hand"}
                {p.search && (
                  <>
                    {" · "}
                    <Link href={`/os/prospects?search=${p.search.id}`}>
                      {p.search.query} in {p.search.location}
                    </Link>
                  </>
                )}
              </dd>
              {p.sourceNote && (
                <>
                  <dt>Search note</dt>
                  <dd>{p.sourceNote}</dd>
                </>
              )}
              {p.lead && (
                <>
                  <dt>Lead</dt>
                  <dd>
                    <Link className="code" href={`/os/leads/${p.lead.id}`}>
                      {p.lead.code}
                    </Link>
                  </dd>
                </>
              )}
              {p.dismissedReason && (
                <>
                  <dt>Not a fit</dt>
                  <dd>{p.dismissedReason}</dd>
                </>
              )}
            </dl>
            <p className="row">
              {p.website && (
                <a href={p.website} target="_blank" rel="noopener noreferrer nofollow">
                  Website ↗
                </a>
              )}
              {p.mapsUrl && (
                <a href={p.mapsUrl} target="_blank" rel="noopener noreferrer nofollow">
                  Google Maps ↗
                </a>
              )}
            </p>
          </section>

          <section className="panel" aria-labelledby="contact">
            <h2 id="contact">Contact details</h2>
            <dl className="dl">
              <dt>Email</dt>
              <dd>
                {p.email ?? "—"}
                {p.emailSource && <div className="faint">{p.emailSource}</div>}
              </dd>
              <dt>Phone</dt>
              <dd>{p.phone ?? "—"}</dd>
            </dl>
            {canRun && !closed && (
              <details className="disclose">
                <summary>Correct or add details</summary>
                <ActionForm action={updateContactAction} submit="Save" variant="sm">
                  <input type="hidden" name="prospectId" value={p.id} />
                  <div className="field">
                    <label htmlFor="email">Email (one they published)</label>
                    <input className="input" id="email" name="email" type="email" defaultValue={p.email ?? ""} />
                  </div>
                  <div className="field">
                    <label htmlFor="phone">Phone</label>
                    <input className="input" id="phone" name="phone" defaultValue={p.phone ?? ""} />
                  </div>
                  <div className="field">
                    <label htmlFor="website">Website</label>
                    <input className="input" id="website" name="website" defaultValue={p.website ?? ""} />
                  </div>
                </ActionForm>
              </details>
            )}
          </section>

          {canRun && !closed && (
            <section className="panel" aria-labelledby="decide">
              <h2 id="decide">Decide</h2>
              {p.status === "CONTACTED" && (
                <ActionForm action={setProspectStatusAction} submit="They replied" variant="ghost">
                  <input type="hidden" name="prospectId" value={p.id} />
                  <input type="hidden" name="status" value="REPLIED" />
                </ActionForm>
              )}
              <details className="disclose">
                <summary>Not a fit</summary>
                <ActionForm action={setProspectStatusAction} submit="Dismiss" variant="ghost sm">
                  <input type="hidden" name="prospectId" value={p.id} />
                  <input type="hidden" name="status" value="DISMISSED" />
                  <input className="input" name="reason" aria-label="Why it's not a fit" placeholder="Why? e.g. already has a good booking system" required />
                </ActionForm>
              </details>
              <details className="disclose">
                <summary>They asked not to be contacted</summary>
                <ActionForm action={doNotContactAction} submit="Never contact them" variant="danger sm">
                  <input type="hidden" name="prospectId" value={p.id} />
                  <input className="input" name="reason" aria-label="Reason" placeholder="e.g. replied “stop”" />
                </ActionForm>
              </details>
            </section>
          )}
          {canRun && p.status === "DISMISSED" && (
            <ActionForm action={setProspectStatusAction} submit="Reopen" variant="ghost">
              <input type="hidden" name="prospectId" value={p.id} />
              <input type="hidden" name="status" value="NEW" />
            </ActionForm>
          )}
        </aside>
      </div>
    </>
  );
}
