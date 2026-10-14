import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { economicsOf, formatInr } from "@/lib/proposals/model";
import { Badge, NoAccess, PageHead, when } from "../../_components/ui";

export const metadata: Metadata = { title: "Proposals" };

export default async function ProposalsPage() {
  const user = await requireUser();
  if (!can(user.role, "proposal:read")) return <NoAccess capability="proposal:read" />;
  const showEconomics = can(user.role, "economics:read");
  const proposals = await prisma.proposal.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: { lead: { select: { code: true, company: true, contactName: true } } },
  });

  return (
    <>
      <PageHead title="Proposals" eyebrow="Pipeline" />
      <div className="panel">
        {proposals.length === 0 ? (
          <p className="empty">No proposals yet. Draft one from a lead once discovery has produced requirements.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Proposal</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Price</th>
                  {showEconomics && <th style={{ textAlign: "right" }}>Est. margin</th>}
                  <th>Sent</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => {
                  const e = economicsOf(p);
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link className="code" href={`/os/proposals/${p.id}`}>
                          {p.code}
                        </Link>{" "}
                        <span className="faint">v{p.version}</span>
                        <div>{p.title}</div>
                      </td>
                      <td>
                        {p.lead.company ?? p.lead.contactName} <span className="faint mono">{p.lead.code}</span>
                      </td>
                      <td>
                        <Badge value={p.status} />
                      </td>
                      <td className="num" style={{ textAlign: "right" }}>{p.priceTotal ? formatInr(p.priceTotal) : "—"}</td>
                      {showEconomics && (
                        <td className="num" style={{ textAlign: "right" }}>
                          {e.grossMargin === null ? "—" : `${Math.round(e.grossMargin * 100)}%`}
                        </td>
                      )}
                      <td className="faint">{when(p.sentAt)}</td>
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
