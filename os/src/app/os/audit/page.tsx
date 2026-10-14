import type { Metadata } from "next";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { NoAccess, PageHead } from "../../_components/ui";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage() {
  const user = await requireUser();
  if (!can(user.role, "audit:read")) return <NoAccess capability="audit:read" />;
  const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 300 });
  return (
    <>
      <PageHead title="Audit log" eyebrow="Company" />
      <p className="muted">Every sign-in, decision, link and status change, newest first. Append-only: nothing in the app edits or deletes these rows.</p>
      <div className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Object</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="faint num" style={{ whiteSpace: "nowrap" }}>
                    {r.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td>
                    {r.actorLabel} <span className="faint label">{r.actorType.toLowerCase()}</span>
                  </td>
                  <td className="code">{r.action}</td>
                  <td className="faint">{r.entityType}</td>
                  <td>{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
