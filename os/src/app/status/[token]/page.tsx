import type { Metadata } from "next";
import { projectForStatusToken } from "@/lib/projects/service";
import { clientProgress } from "@/lib/projects/progress";
import { getSettings } from "@/lib/finance/settings";
import { isOverdue } from "@/lib/finance/invoices";
import { formatInr } from "@/lib/proposals/model";
import { Logo } from "../../_components/Logo";

export const metadata: Metadata = { title: "Project status", referrer: "no-referrer" };

export default async function StatusPage({ params }: PageProps<"/status/[token]">) {
  const project = await projectForStatusToken((await params).token);
  if (!project) {
    return (
      <main className="client">
        <Brand />
        <h1>This link isn&apos;t active</h1>
        <p className="muted">Status links can be replaced. Please ask Nirmaan for the current one.</p>
      </main>
    );
  }
  const p = clientProgress(project.stage);
  const settings = project.invoices.length ? await getSettings() : null;
  const now = new Date();
  return (
    <main className="client">
      <Brand />
      <header>
        <span className="label">
          {project.code}
          {project.client ? ` · ${project.client.name}` : ""}
        </span>
        <h1>{project.name}</h1>
      </header>

      <section aria-labelledby="progress">
        <h2 id="progress">{p.live ? "Live" : "Progress"}</h2>
        <div className="progress" role="progressbar" aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Project progress">
          <span style={{ width: `${p.percent}%` }} />
        </div>
        <p className="num">{p.percent}% complete</p>
        <ol className="phases" role="list">
          {p.phases.map((ph) => (
            <li key={ph.name} className={ph.state}>
              {ph.name}
              <span className="visually-hidden"> ({ph.state === "done" ? "done" : ph.state === "current" ? "in progress" : "not started"})</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel">
        <dl className="dl">
          <dt>Current milestone</dt>
          <dd>{p.milestone}</dd>
          <dt>What we need from you</dt>
          <dd>{p.nextAction}</dd>
          <dt>Last updated</dt>
          <dd>{project.updatedAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</dd>
        </dl>
      </section>

      {project.invoices.length > 0 && (
        <section aria-labelledby="payments">
          <h2 id="payments">Invoices</h2>
          <table className="table">
            <tbody>
              {project.invoices.map((inv) => {
                const paid = inv.payments.reduce((s, x) => s + x.amount, 0);
                const due = inv.total - paid;
                return (
                  <tr key={inv.code}>
                    <td>
                      <span className="mono">{inv.code}</span>
                      <div style={{ fontSize: "0.875rem" }}>{inv.label.replace(/^PROP-\d+: /, "")}</div>
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {formatInr(inv.total)}
                      <div className="faint" style={{ fontSize: "0.8125rem" }}>
                        {inv.status === "PAID"
                          ? "Paid, thank you"
                          : isOverdue(inv, now)
                            ? `${formatInr(due)} overdue`
                            : `${formatInr(due)} due ${inv.dueDate ? inv.dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}`}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {settings?.paymentInstructions && project.invoices.some((i) => i.status === "ISSUED") && (
            <div className="panel">
              <span className="label">How to pay</span>
              <p className="prewrap">{settings.paymentInstructions}</p>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function Brand() {
  return (
    <div className="brand">
      <Logo />
      <b>Nirmaan</b>
      <span>SOFTWARE STUDIO</span>
    </div>
  );
}
