import type { CostEntry, Invoice, Payment } from "@prisma/client";
import type { ProjectEconomics } from "@/lib/finance/costs";
import { formatInr } from "@/lib/proposals/model";
import { COST_CATEGORIES } from "@/lib/db/enums";
import { ActionForm } from "./ActionForm";
import { InvoiceTable } from "./InvoiceTable";
import { when } from "./ui";
import { costAction, manualInvoiceAction } from "../os/actions/finance";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const CATEGORY_LABEL: Record<string, string> = {
  HUMAN: "Human effort",
  INFRA: "Infrastructure",
  EXTERNAL_AI: "External AI/API bills",
  OTHER: "Other",
  AI_LEDGER: "AI (from usage ledger)",
};

/** A project's money: contract, billing, cash, and estimate vs actual. */
export function MoneyPanel({
  projectId,
  e,
  invoices,
  costs,
  canWrite,
}: {
  projectId: string;
  e: ProjectEconomics;
  invoices: (Invoice & { payments: Payment[] })[];
  costs: CostEntry[];
  canWrite: boolean;
}) {
  const hidden = <input type="hidden" name="projectId" value={projectId} />;
  const variance = (n: number, unit: "₹" | "h") => {
    if (!n) return <span className="faint">on estimate</span>;
    const text = unit === "₹" ? formatInr(Math.abs(n)) : `${Math.abs(Math.round(n * 10) / 10)} h`;
    return <span style={{ color: n > 0 ? "var(--bad)" : "var(--good)" }}>{n > 0 ? `+${text} over` : `${text} under`}</span>;
  };
  return (
    <section className="panel" aria-labelledby="money">
      <div className="panel-head">
        <h2 id="money">Money</h2>
        <span className="label num">
          contract {formatInr(e.contract)} · collected {formatInr(e.collected)} · outstanding {formatInr(e.outstanding)}
        </span>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th />
              <th style={{ textAlign: "right" }}>Estimated</th>
              <th style={{ textAlign: "right" }}>Actual</th>
              <th style={{ textAlign: "right" }}>Variance</th>
            </tr>
          </thead>
          <tbody className="num">
            <tr>
              <td>Cost</td>
              <td style={{ textAlign: "right" }}>{formatInr(e.estimated.cost)}</td>
              <td style={{ textAlign: "right" }}>{formatInr(e.actual.cost)}</td>
              <td style={{ textAlign: "right" }}>{variance(e.variance.cost, "₹")}</td>
            </tr>
            <tr>
              <td>Effort</td>
              <td style={{ textAlign: "right" }}>{e.estimated.hours} h</td>
              <td style={{ textAlign: "right" }}>{Math.round(e.actual.hours * 10) / 10} h</td>
              <td style={{ textAlign: "right" }}>{variance(e.variance.hours, "h")}</td>
            </tr>
            <tr>
              <td>
                <b>Gross margin</b>
              </td>
              <td style={{ textAlign: "right" }}>{pct(e.estimated.margin)}</td>
              <td style={{ textAlign: "right" }}>
                <b>{pct(e.actual.margin)}</b>
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="faint" style={{ fontSize: "0.75rem" }}>
        Actual cost by category:{" "}
        {Object.entries(e.actual.byCategory)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${CATEGORY_LABEL[k] ?? k} ${formatInr(v)}`)
          .join(" · ") || "nothing recorded yet"}
        {e.actual.aiUsd > 0 && ` (AI $${e.actual.aiUsd.toFixed(2)} converted at the settings rate)`}
      </p>

      <h3>Invoices</h3>
      <InvoiceTable invoices={invoices} canWrite={canWrite} projectId={projectId} />

      {canWrite && (
        <div className="grid-2">
          <details className="disclose">
            <summary>Record a cost</summary>
            <ActionForm action={costAction} submit="Record cost" variant="sm">
              {hidden}
              <div className="form-row">
                <select className="input" name="category" defaultValue="HUMAN" aria-label="Category">
                  {COST_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
                <input className="input" name="hours" inputMode="decimal" placeholder="Hours (human effort)" aria-label="Hours" />
              </div>
              <div className="form-row">
                <input className="input" name="amount" inputMode="numeric" placeholder="Amount ₹ (or leave empty to use hours)" aria-label="Amount" />
                <input className="input" name="incurredOn" type="date" aria-label="Date" />
              </div>
              <input className="input" name="note" placeholder="What for, e.g. Week 2 build, hosting Oct" aria-label="Note" required />
            </ActionForm>
          </details>
          <details className="disclose">
            <summary>Extra invoice</summary>
            <ActionForm action={manualInvoiceAction} submit="Create draft" variant="sm">
              {hidden}
              <input className="input" name="label" placeholder="What it's for" aria-label="Label" required />
              <input className="input" name="subtotal" inputMode="numeric" placeholder="Amount ₹ before tax" aria-label="Amount" required />
            </ActionForm>
          </details>
        </div>
      )}

      {costs.length > 0 && (
        <details className="disclose">
          <summary>Cost entries ({costs.length})</summary>
          <ul className="list" role="list">
            {costs.map((c) => (
              <li key={c.id} className="item-head" style={{ fontSize: "0.8125rem" }}>
                <span>
                  {CATEGORY_LABEL[c.category]}: {c.note}
                  {c.hours ? ` · ${c.hours} h` : ""}
                </span>
                <span className="num">
                  {formatInr(c.amount)} <span className="faint">{when(c.incurredOn)}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
