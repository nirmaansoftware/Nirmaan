import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { decodeStringList } from "@/lib/db/json";
import { allowedLeadTransitions } from "@/lib/leads/service";
import { promotionBlocker } from "@/lib/discovery/items";
import { DISCOVERY_KINDS, REQUIREMENT_KINDS, REQUIREMENT_PRIORITIES } from "@/lib/db/enums";
import { ActionForm } from "../../../_components/ActionForm";
import { Badge, NoAccess, PageHead, ago, when } from "../../../_components/ui";
import {
  addItemAction,
  addNoteAction,
  createProposalAction,
  createRequirementAction,
  decideItemAction,
  promoteAction,
  runDiscoveryAction,
  setLeadStatusAction,
} from "../../actions/leads";

export async function generateMetadata({ params }: PageProps<"/os/leads/[id]">): Promise<Metadata> {
  const lead = await prisma.lead.findUnique({ where: { id: (await params).id }, select: { code: true } });
  return { title: lead?.code ?? "Lead" };
}

const KIND_HELP: Record<string, string> = {
  FACT: "Stated by the customer",
  ASSUMPTION: "Inferred, not confirmed",
  QUESTION: "Still needs an answer",
  RECOMMENDATION: "What we might propose",
};

export default async function LeadPage({ params }: PageProps<"/os/leads/[id]">) {
  const user = await requireUser();
  if (!can(user.role, "lead:read")) return <NoAccess capability="lead:read" />;
  const { id } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      discovery: { orderBy: { createdAt: "asc" }, include: { requirement: { select: { code: true } } } },
      requirements: { orderBy: { code: "asc" } },
      proposals: { orderBy: { createdAt: "desc" } },
      notes: { orderBy: { createdAt: "desc" } },
      projects: { select: { id: true, code: true, name: true } },
    },
  });
  if (!lead) notFound();

  const ai = await prisma.aiUsage.aggregate({ where: { leadId: id }, _sum: { costUsd: true }, _count: true });
  const canEdit = can(user.role, "requirement:write");
  const transitions = can(user.role, "lead:write") ? allowedLeadTransitions(lead.status) : [];
  const context: [string, string | null][] = [
    ["Business", lead.business],
    ["Today", lead.currentSolution],
    ["Affected", lead.affected],
    ["How often", lead.frequency],
    ["Scale", lead.scale],
    ["Systems", lead.existingSystems],
    ["Outcome", lead.desiredOutcome],
    ["Budget", lead.budgetRange],
    ["Timeline", lead.timeline],
    ["Urgency", lead.urgency],
    ["Asked about", lead.interest],
  ];
  const openItems = lead.discovery.filter((d) => d.status === "OPEN").length;

  return (
    <>
      <PageHead title={lead.company ?? lead.contactName} eyebrow={lead.code} crumbs={[{ href: "/os/leads", label: "Leads" }]}>
        <Badge value={lead.status} />
      </PageHead>

      <div className="split">
        <div className="stack">
          <section className="panel" aria-labelledby="problem">
            <h2 id="problem">The problem, in their words</h2>
            <blockquote className="prewrap" style={{ borderLeft: "3px solid var(--blue)", paddingLeft: "0.9rem" }}>
              {lead.problem}
            </blockquote>
            <dl className="dl">
              {context
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} style={{ display: "contents" }}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
          </section>

          <section className="panel" aria-labelledby="discovery">
            <div className="panel-head">
              <h2 id="discovery">Discovery</h2>
              <span className="label">
                {lead.discovery.length} items · {openItems} awaiting a decision
              </span>
            </div>
            <p className="muted" style={{ fontSize: "0.875rem" }}>
              Facts, assumptions, questions and recommendations are kept apart. Only facts, confirmed items and answered questions can become
              requirements.
            </p>
            {can(user.role, "discovery:run") && (
              <ActionForm action={runDiscoveryAction} submit={lead.discovery.some((d) => d.source === "AGENT") ? "Run discovery again" : "Run discovery"} pendingLabel="Business Analyst is reading… (up to 2 minutes)" variant="ghost">
                <input type="hidden" name="leadId" value={lead.id} />
              </ActionForm>
            )}

            {DISCOVERY_KINDS.map((kind) => {
              const items = lead.discovery.filter((d) => d.kind === kind);
              if (!items.length) return null;
              return (
                <div key={kind} className="stack" style={{ gap: "0.25rem" }}>
                  <h3>
                    <span className={`kind ${kind}`}>{kind}</span> <span className="faint" style={{ fontWeight: 400 }}>{KIND_HELP[kind]}</span>
                  </h3>
                  <ul className="list" role="list">
                    {items.map((item) => {
                      const blocker = promotionBlocker(item);
                      return (
                        <li key={item.id}>
                          <div className="item-head">
                            <span className="prewrap">{item.text}</span>
                            <span className="row">
                              <span className="faint label">{item.source.toLowerCase()}</span>
                              <Badge value={item.status} />
                              {item.requirement && <span className="badge info">{item.requirement.code}</span>}
                            </span>
                          </div>
                          {item.answer && <p className="muted">Answer: {item.answer}</p>}
                          {canEdit && item.status === "OPEN" && item.kind !== "QUESTION" && (
                            <div className="row">
                              <ActionForm action={decideItemAction} submit="Confirm" variant="ghost sm" className="">
                                <input type="hidden" name="itemId" value={item.id} />
                                <input type="hidden" name="leadId" value={lead.id} />
                                <input type="hidden" name="decision" value="CONFIRM" />
                              </ActionForm>
                              <ActionForm action={decideItemAction} submit="Reject" variant="danger sm" className="">
                                <input type="hidden" name="itemId" value={item.id} />
                                <input type="hidden" name="leadId" value={lead.id} />
                                <input type="hidden" name="decision" value="REJECT" />
                              </ActionForm>
                            </div>
                          )}
                          {canEdit && item.kind === "QUESTION" && item.status === "OPEN" && (
                            <details className="disclose">
                              <summary>Record the customer&apos;s answer</summary>
                              <ActionForm action={decideItemAction} submit="Save answer" variant="sm">
                                <input type="hidden" name="itemId" value={item.id} />
                                <input type="hidden" name="leadId" value={lead.id} />
                                <input type="hidden" name="decision" value="ANSWER" />
                                <textarea className="input" name="answer" aria-label="Answer" required rows={2} />
                              </ActionForm>
                            </details>
                          )}
                          {canEdit && !item.requirement && !blocker && (
                            <details className="disclose">
                              <summary>Make this a requirement</summary>
                              <RequirementFields action={promoteAction} hidden={{ itemId: item.id, leadId: lead.id }} statement={item.kind === "QUESTION" ? item.answer ?? "" : item.text} />
                            </details>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}

            {canEdit && (
              <details className="disclose">
                <summary>Add something you learned on a call</summary>
                <ActionForm action={addItemAction} submit="Add item" variant="sm">
                  <input type="hidden" name="leadId" value={lead.id} />
                  <div className="form-row">
                    <div className="field">
                      <label htmlFor="kind">Kind</label>
                      <select className="input" id="kind" name="kind" defaultValue="FACT">
                        {DISCOVERY_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {k.toLowerCase()}: {KIND_HELP[k]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <textarea className="input" name="text" aria-label="Item" rows={2} required />
                </ActionForm>
              </details>
            )}
          </section>

          <section className="panel" aria-labelledby="reqs">
            <div className="panel-head">
              <h2 id="reqs">Requirements</h2>
              <span className="label">{lead.requirements.length}</span>
            </div>
            {lead.requirements.length === 0 ? (
              <p className="empty">None yet. Promote confirmed discovery items, or write one directly.</p>
            ) : (
              <ul className="list" role="list">
                {lead.requirements.map((r) => {
                  const criteria = decodeStringList(r.acceptanceCriteria);
                  return (
                    <li key={r.id}>
                      <div className="item-head">
                        <span>
                          <span className="code mono">{r.code}</span> {r.statement}
                        </span>
                        <span className="row">
                          <span className="badge">{r.kind.replace("_", " ").toLowerCase()}</span>
                          <span className={`badge ${r.priority === "MUST" ? "info" : ""}`}>{r.priority.toLowerCase()}</span>
                        </span>
                      </div>
                      {criteria.length > 0 && (
                        <ul className="faint" style={{ paddingLeft: "1.1rem", fontSize: "0.8125rem" }}>
                          {criteria.map((c) => (
                            <li key={c}>{c}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {canEdit && (
              <details className="disclose">
                <summary>Write a requirement directly</summary>
                <RequirementFields action={createRequirementAction} hidden={{ leadId: lead.id }} statement="" />
              </details>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="panel" aria-labelledby="contact">
            <h2 id="contact">Contact</h2>
            <dl className="dl">
              <dt>Name</dt>
              <dd>{lead.contactName}</dd>
              <dt>Email</dt>
              <dd>
                <a href={`mailto:${lead.contactEmail}`}>{lead.contactEmail}</a>
              </dd>
              {lead.contactPhone && (
                <>
                  <dt>Phone</dt>
                  <dd>{lead.contactPhone}</dd>
                </>
              )}
              <dt>Source</dt>
              <dd>{lead.source.toLowerCase()}</dd>
              <dt>Received</dt>
              <dd>{when(lead.createdAt)}</dd>
              {lead.lostReason && (
                <>
                  <dt>Lost because</dt>
                  <dd>{lead.lostReason}</dd>
                </>
              )}
              {can(user.role, "ai:read") && (
                <>
                  <dt>AI spend</dt>
                  <dd className="num">
                    {ai._count ? `$${(ai._sum.costUsd ?? 0).toFixed(2)} over ${ai._count} calls` : "none"}
                  </dd>
                </>
              )}
            </dl>
            {transitions.length > 0 && (
              <ActionForm action={setLeadStatusAction} submit="Update status" variant="ghost sm">
                <input type="hidden" name="leadId" value={lead.id} />
                <div className="form-row">
                  <select className="input" name="status" aria-label="New status" defaultValue={transitions[0]}>
                    {transitions.map((s) => (
                      <option key={s} value={s}>
                        {s.toLowerCase()}
                      </option>
                    ))}
                  </select>
                  <input className="input" name="reason" placeholder="Reason (required for lost)" aria-label="Reason" />
                </div>
              </ActionForm>
            )}
          </section>

          <section className="panel" aria-labelledby="proposals">
            <h2 id="proposals">Proposals</h2>
            {lead.proposals.length === 0 ? (
              <p className="empty">No proposal yet.</p>
            ) : (
              <ul className="list" role="list">
                {lead.proposals.map((p) => (
                  <li key={p.id} className="item-head">
                    <Link href={`/os/proposals/${p.id}`}>
                      <span className="mono">{p.code}</span> v{p.version}
                    </Link>
                    <Badge value={p.status} />
                  </li>
                ))}
              </ul>
            )}
            {lead.projects.map((p) => (
              <p key={p.id}>
                Won → <Link href={`/os/projects/${p.id}`}>{p.code}</Link>
              </p>
            ))}
            {can(user.role, "proposal:write") &&
              !["WON", "LOST", "SPAM"].includes(lead.status) &&
              !lead.proposals.some((p) => ["DRAFT", "SENT", "CLARIFICATION_REQUESTED"].includes(p.status)) && (
              <ActionForm action={createProposalAction} submit="Draft a proposal" pendingLabel="Drafting…" variant="ghost">
                <input type="hidden" name="leadId" value={lead.id} />
                {lead.requirements.length === 0 && <p className="notice warn">No requirements yet. The draft&apos;s scope will be empty.</p>}
              </ActionForm>
            )}
          </section>

          <section className="panel" aria-labelledby="notes">
            <h2 id="notes">Notes</h2>
            {can(user.role, "lead:write") && (
              <ActionForm action={addNoteAction} submit="Add note" variant="sm">
                <input type="hidden" name="leadId" value={lead.id} />
                <textarea className="input" name="body" aria-label="Note" rows={3} required />
              </ActionForm>
            )}
            <ul className="list" role="list">
              {lead.notes.map((n) => (
                <li key={n.id}>
                  <span className="faint label">
                    {n.author} · {ago(n.createdAt)}
                  </span>
                  <span className="prewrap">{n.body}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}

function RequirementFields({
  action,
  hidden,
  statement,
}: {
  action: Parameters<typeof ActionForm>[0]["action"];
  hidden: Record<string, string>;
  statement: string;
}) {
  return (
    <ActionForm action={action} submit="Create requirement" variant="sm">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="field">
        <span className="label-text">Requirement</span>
        <textarea className="input" name="statement" defaultValue={statement} rows={2} required />
      </label>
      <div className="form-row">
        <label className="field">
          <span className="label-text">Kind</span>
          <select className="input" name="kind" defaultValue="FUNCTIONAL">
            {REQUIREMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {k.replace("_", " ").toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label-text">Priority</span>
          <select className="input" name="priority" defaultValue="MUST">
            {REQUIREMENT_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p.toLowerCase()}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="label-text">Acceptance criteria</span>
        <textarea className="input" name="criteria" rows={3} placeholder="One per line" />
        <span className="hint">How will we know it&apos;s done? One testable statement per line.</span>
      </label>
    </ActionForm>
  );
}
