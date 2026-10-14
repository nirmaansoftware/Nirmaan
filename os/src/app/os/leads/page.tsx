import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { LEAD_STATUSES, OPEN_LEAD_STATUSES, isOneOf } from "@/lib/db/enums";
import { Badge, NoAccess, PageHead, ago } from "../../_components/ui";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: PageProps<"/os/leads">) {
  const user = await requireUser();
  if (!can(user.role, "lead:read")) return <NoAccess capability="lead:read" />;
  const status = (await searchParams).status;
  const filter = isOneOf(LEAD_STATUSES, status) ? [status] : status === "all" ? [...LEAD_STATUSES] : [...OPEN_LEAD_STATUSES];

  const [leads, counts] = await Promise.all([
    prisma.lead.findMany({
      where: { status: { in: filter } },
      orderBy: [{ lastActivityAt: "desc" }],
      take: 200,
      include: { _count: { select: { discovery: true, requirements: true } } },
    }),
    prisma.lead.groupBy({ by: ["status"], _count: true }),
  ]);
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <>
      <PageHead title="Leads" eyebrow="Pipeline">
        {can(user.role, "lead:write") && (
          <Link className="btn" href="/os/leads/new">
            Add a lead
          </Link>
        )}
      </PageHead>
      <nav className="row" aria-label="Filter by status">
        <Link className={`btn sm ${status ? "ghost" : ""}`} href="/os/leads">
          Open
        </Link>
        {LEAD_STATUSES.map((s) => (
          <Link key={s} className={`btn sm ${status === s ? "" : "ghost"}`} href={`/os/leads?status=${s}`}>
            {s.toLowerCase()} <span className="faint num">{countOf(s)}</span>
          </Link>
        ))}
        <Link className={`btn sm ${status === "all" ? "" : "ghost"}`} href="/os/leads?status=all">
          all
        </Link>
      </nav>
      <div className="panel">
        {leads.length === 0 ? (
          <p className="empty">
            No leads here yet. Leads arrive from the website&apos;s &ldquo;Tell us your problem&rdquo; form, or add one by hand after a call.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Problem</th>
                  <th>Status</th>
                  <th>Discovery</th>
                  <th>Last activity</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link className="code" href={`/os/leads/${l.id}`}>
                        {l.code}
                      </Link>
                      <div>{l.company ?? l.contactName}</div>
                      <div className="faint">{l.source.toLowerCase()}</div>
                    </td>
                    <td style={{ maxWidth: "32rem" }}>{l.problem.length > 180 ? `${l.problem.slice(0, 180)}…` : l.problem}</td>
                    <td>
                      <Badge value={l.status} />
                    </td>
                    <td className="num faint">
                      {l._count.discovery} items · {l._count.requirements} reqs
                    </td>
                    <td className="faint">{ago(l.lastActivityAt)}</td>
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
