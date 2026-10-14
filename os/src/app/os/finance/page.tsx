import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { cfoSummary, clientLifetimeValue } from "@/lib/finance/summary";
import { getSettings } from "@/lib/finance/settings";
import { formatInr } from "@/lib/proposals/model";
import { ActionForm } from "../../_components/ActionForm";
import { InvoiceTable } from "../../_components/InvoiceTable";
import { Badge, NoAccess, PageHead, when } from "../../_components/ui";
import { generateRecurringAction, settingsAction, subscriptionAction, subscriptionStatusAction } from "../actions/finance";

export const metadata: Metadata = { title: "Finance" };

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

export default async function FinancePage({ searchParams }: PageProps<"/os/finance">) {
  const user = await requireUser();
  if (!can(user.role, "finance:read")) return <NoAccess capability="finance:read" />;
  const canWrite = can(user.role, "finance:write");
  const show = (await searchParams).invoices;
  const invoiceFilter = show === "all" ? {} : show === "paid" ? { status: "PAID" } : { status: { in: ["DRAFT", "ISSUED"] } };

  const [s, ltv, settings, invoices, subs, clients] = await Promise.all([
    cfoSummary(),
    clientLifetimeValue(),
    getSettings(),
    prisma.invoice.findMany({
      where: invoiceFilter,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
      include: { payments: true, project: { select: { name: true } }, client: { select: { name: true } } },
    }),
    prisma.subscription.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], include: { client: { select: { name: true } } } }),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHead title="Finance" eyebrow="Company" />

      <div className="stats">
        <Stat label="Collected" value={formatInr(s.collected30d)} note={`last 30 days · ${formatInr(s.collectedAllTime)} all time`} />
        <Stat label="Outstanding" value={formatInr(s.outstanding)} note={s.overdueCount ? `${formatInr(s.overdue)} overdue (${s.overdueCount})` : "none overdue"} />
        <Stat label="MRR" value={formatInr(s.mrr)} note={`${s.activePlans} active care plan(s)`} />
        <Stat label="Gross margin" value={pct(s.grossMarginActual)} note="actual, projects with costs recorded" />
      </div>

      <section className="panel" aria-labelledby="projects-econ">
        <div className="panel-head">
          <h2 id="projects-econ">Projects: estimate vs actual</h2>
          <span className="label">{s.projects.length} projects</span>
        </div>
        {s.projects.length === 0 ? (
          <p className="empty">No approved projects yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th style={{ textAlign: "right" }}>Contract</th>
                  <th style={{ textAlign: "right" }}>Collected</th>
                  <th style={{ textAlign: "right" }}>Est. cost</th>
                  <th style={{ textAlign: "right" }}>Actual cost</th>
                  <th style={{ textAlign: "right" }}>Est. margin</th>
                  <th style={{ textAlign: "right" }}>Actual margin</th>
                </tr>
              </thead>
              <tbody className="num">
                {s.projects.map(({ project, e }) => {
                  const worse = e.actual.margin !== null && e.estimated.margin !== null && e.actual.margin < e.estimated.margin - 0.05;
                  return (
                    <tr key={project.id}>
                      <td>
                        <Link href={`/os/projects/${project.id}`}>{project.name}</Link>
                        <div className="faint code">
                          {project.code} · {project.serviceType?.replace("_", " ").toLowerCase() ?? "type not set"}
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>{formatInr(e.contract)}</td>
                      <td style={{ textAlign: "right" }}>{formatInr(e.collected)}</td>
                      <td style={{ textAlign: "right" }}>{formatInr(e.estimated.cost)}</td>
                      <td style={{ textAlign: "right" }}>{formatInr(e.actual.cost)}</td>
                      <td style={{ textAlign: "right" }}>{pct(e.estimated.margin)}</td>
                      <td style={{ textAlign: "right", color: worse ? "var(--bad)" : undefined }}>
                        <b>{pct(e.actual.margin)}</b>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="split">
        <section className="panel" aria-labelledby="by-type">
          <h2 id="by-type">By kind of work</h2>
          <p className="faint" style={{ fontSize: "0.8125rem" }}>
            Where estimates are consistently optimistic, prices should change. Where a type is repeatedly profitable and similar, consider productizing it.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th style={{ textAlign: "right" }}>Projects</th>
                  <th style={{ textAlign: "right" }}>Contract</th>
                  <th style={{ textAlign: "right" }}>Est. margin</th>
                  <th style={{ textAlign: "right" }}>Actual margin</th>
                </tr>
              </thead>
              <tbody className="num">
                {s.byServiceType.map((r) => (
                  <tr key={r.serviceType}>
                    <td className="code">{r.serviceType.replace("_", " ").toLowerCase()}</td>
                    <td style={{ textAlign: "right" }}>{r.projects}</td>
                    <td style={{ textAlign: "right" }}>{formatInr(r.contract)}</td>
                    <td style={{ textAlign: "right" }}>{pct(r.estimatedMargin)}</td>
                    <td style={{ textAlign: "right" }}>{pct(r.actualMargin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel" aria-labelledby="ltv">
          <h2 id="ltv">Client lifetime value</h2>
          {ltv.length === 0 ? (
            <p className="empty">No payments recorded yet.</p>
          ) : (
            <ul className="list" role="list">
              {ltv.map((c) => (
                <li key={c.name} className="item-head">
                  <span>{c.name}</span>
                  <span className="num">{formatInr(c.collected)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel" aria-labelledby="invoices">
        <div className="panel-head">
          <h2 id="invoices">Invoices</h2>
          <nav className="row" aria-label="Filter invoices">
            <Link className={`btn sm ${!show ? "" : "ghost"}`} href="/os/finance">
              Open
            </Link>
            <Link className={`btn sm ${show === "paid" ? "" : "ghost"}`} href="/os/finance?invoices=paid">
              Paid
            </Link>
            <Link className={`btn sm ${show === "all" ? "" : "ghost"}`} href="/os/finance?invoices=all">
              All
            </Link>
          </nav>
        </div>
        <InvoiceTable invoices={invoices} canWrite={canWrite} showProject />
      </section>

      <div className="split">
        <section className="panel" aria-labelledby="plans">
          <div className="panel-head">
            <h2 id="plans">Care plans</h2>
            {canWrite && (
              <ActionForm action={generateRecurringAction} submit="Create due invoices" variant="ghost sm" className="" />
            )}
          </div>
          {subs.length === 0 ? (
            <p className="empty">No recurring plans yet.</p>
          ) : (
            <ul className="list" role="list">
              {subs.map((sub) => (
                <li key={sub.id}>
                  <div className="item-head">
                    <span>
                      <span className="code mono">{sub.code}</span> {sub.name} · {sub.client.name}
                    </span>
                    <span className="row">
                      <span className="num">{formatInr(sub.monthly)}/mo</span>
                      <Badge value={sub.status} tone={sub.status === "ACTIVE" ? "good" : sub.status === "PAUSED" ? "warn" : ""} />
                    </span>
                  </div>
                  <span className="faint" style={{ fontSize: "0.8125rem" }}>
                    since {when(sub.startDate)} · next invoice {sub.status === "ACTIVE" ? when(sub.nextInvoiceDate) : "—"}
                  </span>
                  {canWrite && sub.status !== "CANCELLED" && (
                    <div className="row">
                      {(sub.status === "ACTIVE" ? ["PAUSED", "CANCELLED"] : ["ACTIVE", "CANCELLED"]).map((st) => (
                        <ActionForm key={st} action={subscriptionStatusAction} submit={st === "ACTIVE" ? "Resume" : st === "PAUSED" ? "Pause" : "Cancel"} variant={st === "CANCELLED" ? "danger sm" : "ghost sm"} className="">
                          <input type="hidden" name="subscriptionId" value={sub.id} />
                          <input type="hidden" name="status" value={st} />
                        </ActionForm>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canWrite && clients.length > 0 && (
            <details className="disclose">
              <summary>Start a care plan</summary>
              <ActionForm action={subscriptionAction} submit="Create plan" variant="sm">
                <div className="form-row">
                  <select className="input" name="clientId" aria-label="Client" required>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input className="input" name="name" placeholder="Care plan: Growth" aria-label="Plan name" required />
                </div>
                <div className="form-row">
                  <input className="input" name="monthly" inputMode="numeric" placeholder="Monthly ₹" aria-label="Monthly price" required />
                  <input className="input" name="startDate" type="date" aria-label="First billing date" />
                </div>
              </ActionForm>
            </details>
          )}
        </section>

        <section className="panel" aria-labelledby="settings">
          <h2 id="settings">Invoice settings</h2>
          <ActionForm action={settingsAction} submit="Save settings" readOnly={!canWrite}>
            <fieldset disabled={!canWrite} style={{ border: 0, padding: 0, display: "grid", gap: "0.75rem" }}>
              <label className="field">
                <span className="label-text">Legal name on invoices</span>
                <input className="input" name="legalName" defaultValue={settings.legalName} />
              </label>
              <div className="form-row">
                <label className="field">
                  <span className="label-text">GSTIN</span>
                  <input className="input" name="gstin" defaultValue={settings.gstin ?? ""} placeholder="Leave empty if not registered" />
                </label>
                <label className="field">
                  <span className="label-text">GST %</span>
                  <input className="input" name="taxRatePercent" inputMode="numeric" defaultValue={settings.taxRatePercent} />
                </label>
              </div>
              <div className="form-row">
                <label className="field">
                  <span className="label-text">Payment terms (days)</span>
                  <input className="input" name="invoiceDueDays" inputMode="numeric" defaultValue={settings.invoiceDueDays} />
                </label>
                <label className="field">
                  <span className="label-text">Loaded hourly cost ₹</span>
                  <input className="input" name="hourlyCost" inputMode="numeric" defaultValue={settings.hourlyCost} />
                </label>
                <label className="field">
                  <span className="label-text">USD → INR</span>
                  <input className="input" name="usdToInr" inputMode="decimal" defaultValue={settings.usdToInr} />
                </label>
              </div>
              <label className="field">
                <span className="label-text">Payment instructions (shown to clients)</span>
                <textarea className="input" name="paymentInstructions" rows={3} defaultValue={settings.paymentInstructions ?? ""} placeholder="Bank account / UPI ID" />
              </label>
            </fieldset>
          </ActionForm>
        </section>
      </div>
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <b>{value}</b>
      <small>{note}</small>
    </div>
  );
}
