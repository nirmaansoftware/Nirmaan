import { can } from "@/lib/auth/permissions";
import { requireClientUser } from "@/lib/web/session";
import { portalOverview } from "@/lib/portal/service";
import { clientProgress } from "@/lib/projects/progress";
import { isOverdue } from "@/lib/finance/invoices";
import { formatInr } from "@/lib/proposals/model";
import { SUPPORT_PRIORITIES } from "@/lib/db/enums";
import { ActionForm } from "../_components/ActionForm";
import { Badge, when } from "../_components/ui";
import { openSupportAction, requestChangeAction } from "./actions";

export default async function PortalPage() {
  const user = await requireClientUser();
  const { client, projects, invoices, requests } = await portalOverview(user);
  const canChange = can(user.role, "client:change:request");
  const now = new Date();

  return (
    <main className="stack" style={{ gap: "2rem" }}>
      <section>
        <span className="label">{client.name}</span>
        <h1>Your projects</h1>
      </section>

      {projects.length === 0 && <p className="muted">No projects yet. Once you approve a proposal, it appears here.</p>}
      {projects.map((p) => {
        const progress = clientProgress(p.stage);
        return (
          <section key={p.id} className="panel" aria-labelledby={`p-${p.id}`}>
            <div className="panel-head">
              <h2 id={`p-${p.id}`}>{p.name}</h2>
              <span className="label">{p.code}</span>
            </div>
            <div className="progress" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.name} progress`}>
              <span style={{ width: `${progress.percent}%` }} />
            </div>
            <ol className="phases row" role="list" style={{ gap: "1rem" }}>
              {progress.phases.map((ph) => (
                <li key={ph.name} className={ph.state}>
                  {ph.name}
                </li>
              ))}
            </ol>
            <dl className="dl">
              <dt>Now</dt>
              <dd>{progress.milestone}</dd>
              <dt>From you</dt>
              <dd>{progress.nextAction}</dd>
              <dt>Updated</dt>
              <dd>{when(p.updatedAt)}</dd>
            </dl>
            {canChange && (
              <details className="disclose">
                <summary>Ask for a change</summary>
                <ActionForm action={requestChangeAction} submit="Send request" variant="sm">
                  <input type="hidden" name="projectId" value={p.id} />
                  <textarea className="input" name="description" rows={3} placeholder="Can you also…" aria-label="Describe the change" required />
                  <p className="faint" style={{ fontSize: "0.8125rem" }}>
                    We&apos;ll tell you whether it&apos;s already in scope. If it isn&apos;t, you&apos;ll see the cost and time before any work starts.
                  </p>
                </ActionForm>
              </details>
            )}
          </section>
        );
      })}

      {invoices && (
        <section className="panel" aria-labelledby="invoices">
          <h2 id="invoices">Invoices</h2>
          {invoices.length === 0 ? (
            <p className="empty">No invoices yet.</p>
          ) : (
            <table className="table">
              <tbody>
                {invoices.map((inv) => {
                  const due = inv.total - inv.payments.reduce((s, x) => s + x.amount, 0);
                  return (
                    <tr key={inv.code}>
                      <td>
                        <span className="mono">{inv.code}</span>
                        <div style={{ fontSize: "0.875rem" }}>{inv.label.replace(/^PROP-\d+: /, "")}</div>
                      </td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {formatInr(inv.total)}
                        <div className="faint" style={{ fontSize: "0.8125rem" }}>
                          {inv.status === "PAID" ? "Paid, thank you" : isOverdue(inv, now) ? `${formatInr(due)} overdue` : `${formatInr(due)} due ${when(inv.dueDate)}`}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}

      <section className="panel" aria-labelledby="support">
        <h2 id="support">Support</h2>
        <ActionForm action={openSupportAction} submit="Send to Nirmaan" variant="sm">
          <div className="form-row">
            <label className="field">
              <span className="label-text">About</span>
              <select className="input" name="projectId" defaultValue={projects[0]?.id ?? ""}>
                <option value="">General</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label-text">Priority</span>
              <select className="input" name="priority" defaultValue="NORMAL">
                {SUPPORT_PRIORITIES.map((pr) => (
                  <option key={pr} value={pr}>
                    {pr === "URGENT" ? "Urgent: something is broken" : pr.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span className="label-text">Subject</span>
            <input className="input" name="subject" required maxLength={200} />
          </label>
          <label className="field">
            <span className="label-text">What&apos;s happening?</span>
            <textarea className="input" name="body" rows={4} required maxLength={5000} />
          </label>
        </ActionForm>
        {requests.length > 0 && (
          <ul className="list" role="list">
            {requests.map((r) => (
              <li key={r.code}>
                <div className="item-head">
                  <span>
                    <span className="mono">{r.code}</span> {r.subject}
                    {r.project && <span className="faint"> · {r.project.name}</span>}
                  </span>
                  <Badge value={r.status} tone={r.status === "RESOLVED" ? "good" : r.status === "IN_PROGRESS" ? "info" : "warn"} />
                </div>
                {r.response && <p className="muted prewrap">Nirmaan: {r.response}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
