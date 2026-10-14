import type { Invoice, Payment } from "@prisma/client";
import { formatInr } from "@/lib/proposals/model";
import { isOverdue } from "@/lib/finance/invoices";
import { PAYMENT_METHODS } from "@/lib/db/enums";
import { ActionForm } from "./ActionForm";
import { Badge, when } from "./ui";
import { issueInvoiceAction, paymentAction, voidInvoiceAction } from "../os/actions/finance";

type Row = Invoice & { payments: Payment[]; project?: { name: string } | null; client?: { name: string } | null };

/** Invoices with their state and, for finance:write, the next action (issue, record payment, void). */
export function InvoiceTable({ invoices, canWrite, projectId, showProject = false }: { invoices: Row[]; canWrite: boolean; projectId?: string; showProject?: boolean }) {
  if (!invoices.length) return <p className="empty">No invoices yet.</p>;
  const now = new Date();
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Invoice</th>
            {showProject && <th>Client / project</th>}
            <th>Status</th>
            <th style={{ textAlign: "right" }}>Total</th>
            <th style={{ textAlign: "right" }}>Due</th>
            {canWrite && <th />}
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => {
            const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
            const overdue = isOverdue(inv, now);
            return (
              <tr key={inv.id}>
                <td>
                  <span className="code">{inv.code}</span> <span className="faint">{inv.kind.toLowerCase()}</span>
                  <div style={{ fontSize: "0.8125rem" }}>{inv.label}</div>
                </td>
                {showProject && (
                  <td style={{ fontSize: "0.8125rem" }}>
                    {inv.client?.name ?? "—"}
                    {inv.project && <div className="faint">{inv.project.name}</div>}
                  </td>
                )}
                <td>
                  <Badge value={overdue ? "OVERDUE" : inv.status} tone={overdue ? "bad" : inv.status === "PAID" ? "good" : inv.status === "ISSUED" ? "warn" : ""} />
                  {inv.status === "ISSUED" && paid > 0 && <div className="faint num" style={{ fontSize: "0.75rem" }}>{formatInr(paid)} received</div>}
                </td>
                <td className="num" style={{ textAlign: "right" }}>
                  {formatInr(inv.total)}
                  {inv.tax > 0 && <div className="faint" style={{ fontSize: "0.75rem" }}>incl. {formatInr(inv.tax)} GST</div>}
                </td>
                <td className="num faint" style={{ textAlign: "right" }}>{inv.status === "PAID" ? `paid ${when(inv.paidAt)}` : when(inv.dueDate)}</td>
                {canWrite && (
                  <td style={{ minWidth: "14rem" }}>
                    {inv.status === "DRAFT" && (
                      <div className="row">
                        <ActionForm action={issueInvoiceAction} submit="Issue" variant="sm" className="">
                          <input type="hidden" name="invoiceId" value={inv.id} />
                          {projectId && <input type="hidden" name="projectId" value={projectId} />}
                        </ActionForm>
                        <details className="disclose">
                          <summary className="faint">Void</summary>
                          <ActionForm action={voidInvoiceAction} submit="Void invoice" variant="danger sm">
                            <input type="hidden" name="invoiceId" value={inv.id} />
                            {projectId && <input type="hidden" name="projectId" value={projectId} />}
                            <input className="input" name="reason" placeholder="Why?" aria-label="Reason" required />
                          </ActionForm>
                        </details>
                      </div>
                    )}
                    {inv.status === "ISSUED" && (
                      <details className="disclose">
                        <summary>Record payment</summary>
                        <ActionForm action={paymentAction} submit="Record" variant="sm">
                          <input type="hidden" name="invoiceId" value={inv.id} />
                          {projectId && <input type="hidden" name="projectId" value={projectId} />}
                          <div className="form-row">
                            <input className="input" name="amount" inputMode="numeric" defaultValue={inv.total - paid} aria-label="Amount received" required />
                            <select className="input" name="method" defaultValue="BANK" aria-label="Method">
                              {PAYMENT_METHODS.map((m) => (
                                <option key={m} value={m}>
                                  {m.toLowerCase()}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="form-row">
                            <input className="input" name="reference" placeholder="UTR / reference" aria-label="Reference" />
                            <input className="input" name="receivedAt" type="date" aria-label="Received on" />
                          </div>
                        </ActionForm>
                      </details>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
