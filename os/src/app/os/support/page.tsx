import type { Metadata } from "next";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { SUPPORT_STATUSES } from "@/lib/db/enums";
import { ActionForm } from "../../_components/ActionForm";
import { Badge, NoAccess, PageHead, ago } from "../../_components/ui";
import { supportAction } from "../actions/knowledge";

export const metadata: Metadata = { title: "Support" };

export default async function SupportPage() {
  const user = await requireUser();
  if (!can(user.role, "support:write")) return <NoAccess capability="support:write" />;
  const requests = await prisma.supportRequest.findMany({
    orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
    take: 200,
    include: { client: { select: { name: true } }, project: { select: { name: true } } },
  });
  return (
    <>
      <PageHead title="Support" eyebrow="Delivery" />
      <p className="muted">Requests clients raise from their portal. Your response is shown to the client.</p>
      <section className="panel" aria-label="Requests">
        {requests.length === 0 ? (
          <p className="empty">No support requests.</p>
        ) : (
          <ul className="list" role="list">
            {requests.map((r) => (
              <li key={r.id}>
                <div className="item-head">
                  <span>
                    <span className="mono">{r.code}</span> <b>{r.subject}</b>{" "}
                    <span className="faint">
                      · {r.client.name}
                      {r.project && ` · ${r.project.name}`} · {r.openedBy}, {ago(r.createdAt)}
                    </span>
                  </span>
                  <span className="row">
                    {r.priority !== "NORMAL" && <Badge value={r.priority} tone={r.priority === "URGENT" ? "bad" : ""} />}
                    <Badge value={r.status} tone={r.status === "RESOLVED" ? "good" : r.status === "IN_PROGRESS" ? "info" : "warn"} />
                  </span>
                </div>
                <p className="prewrap" style={{ fontSize: "0.875rem" }}>{r.body}</p>
                <details className="disclose" open={r.status !== "RESOLVED" && !r.response}>
                  <summary>{r.response ? "Update response" : "Respond"}</summary>
                  <ActionForm action={supportAction} submit="Save" variant="sm">
                    <input type="hidden" name="id" value={r.id} />
                    <textarea className="input" name="response" rows={3} defaultValue={r.response ?? ""} aria-label="Response to client" />
                    <select className="input" name="status" defaultValue={r.status === "OPEN" ? "IN_PROGRESS" : r.status} aria-label="Status" style={{ maxWidth: "12rem" }}>
                      {SUPPORT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace("_", " ").toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </ActionForm>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
