import type { Metadata } from "next";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { ActionForm } from "../../../_components/ActionForm";
import { NoAccess, PageHead, when } from "../../../_components/ui";
import { addSuppressionAction, removeSuppressionAction } from "../../actions/prospects";

export const metadata: Metadata = { title: "Do not contact" };

export default async function DoNotContactPage() {
  const user = await requireUser();
  if (!can(user.role, "prospect:read")) return <NoAccess capability="prospect:read" />;
  const rows = await prisma.suppression.findMany({ orderBy: { createdAt: "desc" }, take: 500 });

  return (
    <>
      <PageHead title="Do not contact" crumbs={[{ href: "/os/prospects", label: "Prospects" }]} />
      <div className="panel">
        <p className="muted">
          Emails, phone numbers and websites that must never get outreach. Searches leave them out, and nothing can be drafted or sent to them. Anyone who replies
          &ldquo;stop&rdquo; belongs here.
        </p>
        {can(user.role, "prospect:run") && (
          <ActionForm action={addSuppressionAction} submit="Add">
            <div className="form-row">
              <div className="field">
                <label htmlFor="value">Email, phone or website</label>
                <input className="input" id="value" name="value" required />
              </div>
              <div className="field">
                <label htmlFor="reason">Why</label>
                <input className="input" id="reason" name="reason" placeholder="Replied “stop”" />
              </div>
            </div>
          </ActionForm>
        )}
      </div>
      <div className="panel">
        {rows.length === 0 ? (
          <p className="empty">Nobody yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Blocked</th>
                  <th>Why</th>
                  <th>Added</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.value}</td>
                    <td>{r.reason}</td>
                    <td className="faint">
                      {when(r.createdAt)} · {r.createdBy}
                    </td>
                    <td>
                      {can(user.role, "outreach:send") && (
                        <ActionForm action={removeSuppressionAction} submit="Remove" variant="ghost sm" confirm="They asked to hear from us again." className="">
                          <input type="hidden" name="value" value={r.value} />
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
