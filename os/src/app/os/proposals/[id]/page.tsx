import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { economicsOf, formatInr, sendBlockers, totalWeeks, viewOf } from "@/lib/proposals/model";
import { ActionForm } from "../../../_components/ActionForm";
import { Badge, NoAccess, PageHead, when } from "../../../_components/ui";
import { revokeLinkAction, saveProposalAction, sendProposalAction } from "../../actions/proposals";

export async function generateMetadata({ params }: PageProps<"/os/proposals/[id]">): Promise<Metadata> {
  const p = await prisma.proposal.findUnique({ where: { id: (await params).id }, select: { code: true } });
  return { title: p?.code ?? "Proposal" };
}

const EDITABLE = ["DRAFT", "CLARIFICATION_REQUESTED"];

export default async function ProposalPage({ params }: PageProps<"/os/proposals/[id]">) {
  const user = await requireUser();
  if (!can(user.role, "proposal:read")) return <NoAccess capability="proposal:read" />;
  const p = await prisma.proposal.findUnique({
    where: { id: (await params).id },
    include: { lead: true, project: { select: { id: true, code: true } } },
  });
  if (!p) notFound();

  const v = viewOf(p);
  const e = economicsOf(p);
  const blockers = sendBlockers(p);
  const editable = EDITABLE.includes(p.status) && can(user.role, "proposal:write");
  const canSend = can(user.role, "proposal:send") && (EDITABLE.includes(p.status) || p.status === "SENT");
  const lines = (xs: string[]) => xs.join("\n");

  return (
    <>
      <PageHead title={p.title} eyebrow={`${p.code} · v${p.version}`} crumbs={[{ href: "/os/proposals", label: "Proposals" }, { href: `/os/leads/${p.leadId}`, label: p.lead.code }]}>
        <Badge value={p.status} />
        <Link className="btn ghost" href={`/os/proposals/${p.id}/preview`}>
          Preview as client
        </Link>
      </PageHead>

      {p.status === "CLARIFICATION_REQUESTED" && (
        <p className="notice warn">
          <b>{p.decidedByName}</b> asked for clarification on {when(p.decidedAt)}: <span className="prewrap">{p.clientNote}</span>
          <br />
          Edit below and send again. That issues a new link.
        </p>
      )}
      {p.status === "REJECTED" && (
        <p className="notice error">
          Rejected by <b>{p.decidedByName}</b> on {when(p.decidedAt)}: <span className="prewrap">{p.clientNote}</span>
        </p>
      )}
      {p.status === "APPROVED" && (
        <p className="notice ok">
          Approved by <b>{p.decidedByName}</b> on {when(p.decidedAt)}.{" "}
          {p.project && (
            <>
              Project <Link href={`/os/projects/${p.project.id}`}>{p.project.code}</Link> was created.
            </>
          )}
        </p>
      )}

      <div className="split">
        <div className="panel">
          <h2>{editable ? "Edit proposal" : "Proposal"}</h2>
          {!editable && <p className="faint">This version is {p.status.toLowerCase().replace("_", " ")} and can&apos;t be edited.</p>}
          <ActionForm action={saveProposalAction} submit="Save" pendingLabel="Saving…" readOnly={!editable}>
            <input type="hidden" name="proposalId" value={p.id} />
            <fieldset disabled={!editable} style={{ border: 0, padding: 0, display: "grid", gap: "0.85rem" }}>
              <Field label="Title" name="title" value={p.title} />
              <Field label="The problem (the customer's words, lightly edited at most)" name="problem" value={p.problem} rows={4} />
              <Field label="What we propose" name="solution" value={p.solution} rows={5} hint="The simplest system that safely solves the problem. Explain tradeoffs in plain language." />
              <div className="grid-2">
                <Field label="In scope" name="scope" value={lines(v.scope)} rows={6} hint="One item per line." />
                <Field label="Out of scope" name="outOfScope" value={lines(v.outOfScope)} rows={6} hint="Say it now to avoid disputes later." />
              </div>
              <Field label="Deliverables" name="deliverables" value={lines(v.deliverables)} rows={4} hint="Concrete outputs, one per line." />
              <div className="grid-2">
                <Field label="Milestones" name="milestones" value={v.milestones.map((m) => `${m.name} | ${m.weeks}`).join("\n")} rows={5} hint={'"Name | weeks" per line.'} />
                <Field label="Payment schedule" name="paymentSchedule" value={v.paymentSchedule.map((s) => `${s.label} | ${s.percent}`).join("\n")} rows={5} hint={'"Label | percent" per line, totalling 100.'} />
              </div>
              <div className="form-row">
                <Field label="Price (₹)" name="priceTotal" value={String(p.priceTotal || "")} inputMode="numeric" />
                <Field label="Valid until" name="validUntil" value={p.validUntil ? p.validUntil.toISOString().slice(0, 10) : ""} type="date" />
              </div>
              <Field label="Technology (only what helps the client decide)" name="technology" value={p.technology ?? ""} rows={2} />
              <details className="disclose" open={!!v.maintenance}>
                <summary>Optional maintenance plan</summary>
                <div className="form-row">
                  <Field label="Plan name" name="maintenanceName" value={v.maintenance?.name ?? ""} />
                  <Field label="Monthly price (₹)" name="maintenanceMonthly" value={String(v.maintenance?.monthly ?? "")} inputMode="numeric" />
                </div>
                <Field label="Includes" name="maintenanceIncludes" value={lines(v.maintenance?.includes ?? [])} rows={3} hint="Offer it only where it genuinely helps the client. Leave the name empty for no plan." />
              </details>
              <Field label="Assumptions" name="assumptions" value={lines(v.assumptions)} rows={4} hint="Anything that changes the estimate if it's wrong." />
              <Field label="Change-request policy" name="changePolicy" value={p.changePolicy} rows={3} />
              {can(user.role, "economics:read") && (
                <details className="disclose" open>
                  <summary>Internal economics (never shown to the client)</summary>
                  <div className="form-row">
                    <Field label="Estimated hours" name="estHours" value={String(p.estHours || "")} inputMode="numeric" />
                    <Field label="Human cost (₹)" name="estCostHuman" value={String(p.estCostHuman || "")} inputMode="numeric" />
                    <Field label="AI / API cost (₹)" name="estCostAi" value={String(p.estCostAi || "")} inputMode="numeric" />
                    <Field label="Infrastructure (₹)" name="estCostInfra" value={String(p.estCostInfra || "")} inputMode="numeric" />
                    <Field label="Other (₹)" name="estCostOther" value={String(p.estCostOther || "")} inputMode="numeric" />
                  </div>
                </details>
              )}
            </fieldset>
          </ActionForm>
        </div>

        <div className="stack">
          {can(user.role, "economics:read") && (
            <section className="panel" aria-labelledby="econ">
              <h2 id="econ">Expected economics</h2>
              <dl className="dl num">
                <dt>Revenue</dt>
                <dd>{formatInr(e.revenue)}</dd>
                <dt>Estimated cost</dt>
                <dd>{formatInr(e.estimatedCost)}</dd>
                <dt>Gross profit</dt>
                <dd>{formatInr(e.grossProfit)}</dd>
                <dt>Gross margin</dt>
                <dd>
                  <b>{e.grossMargin === null ? "—" : `${Math.round(e.grossMargin * 100)}%`}</b>
                </dd>
                <dt>Effort</dt>
                <dd>
                  {p.estHours} h over ~{totalWeeks(v.milestones)} weeks
                </dd>
              </dl>
              {e.grossMargin !== null && e.grossMargin < 0 && <p className="notice error">This price loses money on its own estimate.</p>}
              <p className="faint" style={{ fontSize: "0.8125rem" }}>
                Actual cost and margin tracking arrives with the financial OS (Phase 3).
              </p>
            </section>
          )}

          <section className="panel" aria-labelledby="send">
            <h2 id="send">Send to client</h2>
            {blockers.length > 0 && EDITABLE.includes(p.status) ? (
              <div className="notice warn">
                Before this can be sent:
                <ul style={{ paddingLeft: "1.1rem" }}>
                  {blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {p.status === "SENT" && (
              <p className="muted">
                Sent {when(p.sentAt)}. {p.shareTokenHash ? "The client link is active." : "The client link has been revoked."}
              </p>
            )}
            {canSend && (
              <ActionForm
                action={sendProposalAction}
                submit={p.status === "SENT" ? "Issue a new link" : "Send proposal"}
                pendingLabel="Preparing link…"
                confirm="I've previewed it as the client will see it"
              >
                <input type="hidden" name="proposalId" value={p.id} />
              </ActionForm>
            )}
            {p.status === "SENT" && p.shareTokenHash && can(user.role, "proposal:send") && (
              <ActionForm action={revokeLinkAction} submit="Revoke client link" variant="danger sm">
                <input type="hidden" name="proposalId" value={p.id} />
              </ActionForm>
            )}
          </section>

          <section className="panel" aria-labelledby="who">
            <h2 id="who">Client</h2>
            <dl className="dl">
              <dt>Contact</dt>
              <dd>{p.lead.contactName}</dd>
              <dt>Email</dt>
              <dd>{p.lead.contactEmail}</dd>
              <dt>Lead</dt>
              <dd>
                <Link href={`/os/leads/${p.leadId}`}>{p.lead.code}</Link>
              </dd>
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  name,
  value,
  rows,
  hint,
  type = "text",
  inputMode,
}: {
  label: string;
  name: string;
  value: string;
  rows?: number;
  hint?: string;
  type?: string;
  inputMode?: "numeric";
}) {
  return (
    <label className="field">
      <span className="label-text">{label}</span>
      {rows ? (
        <textarea className="input" name={name} defaultValue={value} rows={rows} />
      ) : (
        <input className="input" name={name} defaultValue={value} type={type} inputMode={inputMode} />
      )}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}
