import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { clientProgress } from "@/lib/projects/progress";
import { Badge, NoAccess, PageHead, ago } from "../../_components/ui";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const user = await requireUser();
  if (!can(user.role, "project:read")) return <NoAccess capability="project:read" />;
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      client: true,
      _count: { select: { requirements: true, changeRequests: { where: { status: { in: ["OPEN", "ASSESSED"] } } } } },
      approvals: { where: { status: "PENDING" }, select: { gate: true } },
      tasks: { where: { status: "BLOCKED" }, select: { id: true } },
    },
  });

  return (
    <>
      <PageHead title="Projects" eyebrow="Delivery" />
      <div className="panel">
        {projects.length === 0 ? (
          <p className="empty">No projects yet. A project is created automatically when a client approves a proposal.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  <th>Stage</th>
                  <th>Progress</th>
                  <th>Health</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const progress = clientProgress(p.stage);
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/os/projects/${p.id}`}>{p.name}</Link>
                        {p.code && <div className="code faint">{p.code}</div>}
                      </td>
                      <td>{p.client?.name ?? "—"}</td>
                      <td>
                        <span className="badge">{p.stage.replace("_", " ").toLowerCase()}</span>
                      </td>
                      <td className="num">{progress.percent}%</td>
                      <td>
                        <span className="row">
                          {p.tasks.length > 0 && <Badge value={`${p.tasks.length} blocked`} tone="bad" />}
                          {p.approvals.map((a) => (
                            <Badge key={a.gate} value={`${a.gate} waiting`} tone="warn" />
                          ))}
                          {p._count.changeRequests > 0 && <Badge value={`${p._count.changeRequests} CR open`} tone="info" />}
                          {!p.tasks.length && !p.approvals.length && !p._count.changeRequests && <Badge value="on track" tone="good" />}
                        </span>
                      </td>
                      <td className="faint">{ago(p.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
