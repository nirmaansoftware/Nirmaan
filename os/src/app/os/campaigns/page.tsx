import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { decodeStringList } from "@/lib/db/json";
import { workerStatus } from "@/lib/prospecting/worker";
import { segmentLabel } from "@/lib/prospecting/service";
import { ActionForm } from "../../_components/ActionForm";
import { Badge, NoAccess, PageHead, ago } from "../../_components/ui";
import { planCampaignAction, runTickAction } from "../actions/campaigns";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const user = await requireUser();
  if (!can(user.role, "prospect:read")) return <NoAccess capability="prospect:read" />;
  const canRun = can(user.role, "prospect:run");
  const [campaigns, worker, counts] = await Promise.all([
    prisma.campaign.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }] }),
    workerStatus(),
    prisma.prospect.groupBy({ by: ["campaignId", "status"], where: { campaignId: { not: null } }, _count: true }),
  ]);
  const count = (id: string, statuses?: string[]) => counts.filter((c) => c.campaignId === id && (!statuses || statuses.includes(c.status))).reduce((n, c) => n + c._count, 0);
  const stale = worker.stale;
  const anyActive = campaigns.some((c) => c.status === "ACTIVE");

  return (
    <>
      <PageHead title="Campaigns" eyebrow="Pipeline">
        <Link className="btn ghost" href="/os/outreach">
          Outreach queue
        </Link>
      </PageHead>

      <div className={`notice ${anyActive && stale ? "error" : ""}`} role="status">
        <p>
          <b>Worker:</b> {worker.lastRunAt ? `last ran ${ago(worker.lastRunAt)}` : "hasn't run yet"}
          {worker.running && " · working now"}
          {worker.inboxCheckedAt ? ` · inbox checked ${ago(worker.inboxCheckedAt)}` : " · inbox not connected (IMAP_URL)"}
        </p>
        {anyActive && stale && (
          <p>
            Active campaigns only move while the worker runs. Start it with <code>npm run campaigns:worker</code> in <code>app/</code> and leave it running.
          </p>
        )}
        {canRun && (
          <ActionForm action={runTickAction} submit="Run one tick now" pendingLabel="Working… (a web search can take a few minutes)" variant="ghost sm" className="">
            {null}
          </ActionForm>
        )}
      </div>

      {canRun && (
        <section className="panel" aria-labelledby="new">
          <h2 id="new">New campaign</h2>
          <p className="muted">
            Say who you want to reach and why, in your own words. Claude turns it into a search plan you can check and edit before anything runs.
          </p>
          <ActionForm action={planCampaignAction} submit="Plan it" pendingLabel="Planning… (under a minute)">
            <textarea
              className="input"
              name="goal"
              aria-label="Campaign goal"
              rows={3}
              required
              minLength={15}
              placeholder="e.g. Dental and skin clinics in Ahmedabad, Surat, Vadodara and Rajkot that still take appointments only by phone"
            />
          </ActionForm>
        </section>
      )}

      <div className="panel">
        {campaigns.length === 0 ? (
          <p className="empty">No campaigns yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Plan</th>
                  <th>Found</th>
                  <th>Contacted</th>
                  <th>Replied</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link className="code" href={`/os/campaigns/${c.id}`}>
                        {c.code}
                      </Link>
                      <div>{c.name}</div>
                      <div className="faint">{segmentLabel(c.segment)}</div>
                    </td>
                    <td className="faint">
                      {decodeStringList(c.queries).length} searches × {decodeStringList(c.locations).length} places · {c.emailShare}% email / {100 - c.emailShare}% WhatsApp
                    </td>
                    <td className="num">{count(c.id)}</td>
                    <td className="num">{count(c.id, ["CONTACTED", "REPLIED", "CONVERTED"])}</td>
                    <td className="num">{count(c.id, ["REPLIED", "CONVERTED"])}</td>
                    <td>
                      <Badge value={c.status} />
                      {c.lastRunAt && <div className="faint">{ago(c.lastRunAt)}</div>}
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
