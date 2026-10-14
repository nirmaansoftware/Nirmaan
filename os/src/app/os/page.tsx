import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { getToday } from "@/lib/dashboard/today";
import { formatInr } from "@/lib/proposals/model";
import { PageHead } from "../_components/ui";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const user = await requireUser();
  if (!can(user.role, "dashboard:read")) redirect("/os/projects");
  const t = await getToday(new Date(), { includeMoney: can(user.role, "finance:read") });
  const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

  return (
    <>
      <PageHead
        title="Nirmaan today"
        eyebrow={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
      >
        {can(user.role, "lead:write") && (
          <Link className="btn" href="/os/leads/new">
            Add a lead
          </Link>
        )}
      </PageHead>

      <section className="panel" aria-labelledby="exceptions">
        <div className="panel-head">
          <h2 id="exceptions">Needs attention</h2>
          <span className="label">{t.exceptions.length ? `${t.exceptions.length} items` : "all clear"}</span>
        </div>
        {t.exceptions.length === 0 ? (
          <p className="empty">Nothing is overdue, blocked or waiting on you.</p>
        ) : (
          <ul className="list" role="list">
            {t.exceptions.map((e, i) => (
              <li key={i} className="item-head">
                <Link href={e.href}>{e.label}</Link>
                <span className={`badge ${e.severity === "high" ? "bad" : "warn"}`}>{e.severity}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="sales">
        <h2 id="sales" className="label" style={{ marginBottom: "0.6rem" }}>
          Sales
        </h2>
        <div className="stats">
          <Stat label="New leads" value={t.newLeads7d} note="last 7 days" />
          <Stat label="Open leads" value={t.openLeads} note="new → proposal" />
          <Stat label="Pipeline" value={formatInr(t.pipelineValue)} note={`${t.proposalsOut} proposals with clients`} />
          <Stat label="Conversion" value={pct(t.conversionRate)} note="won ÷ decided, 90 days" />
        </div>
      </section>

      <section aria-labelledby="delivery">
        <h2 id="delivery" className="label" style={{ marginBottom: "0.6rem" }}>
          Delivery
        </h2>
        <div className="stats">
          <Stat label="Active projects" value={t.activeProjects} note="planning → deployment" />
          <Stat label="At risk" value={t.projectsAtRisk} note="with blocked tasks" />
          <Stat label="Approvals waiting" value={t.pendingApprovals} note="quality gates" />
          <Stat label="Change requests" value={t.openChangeRequests} note="open or assessed" />
        </div>
      </section>

      <section aria-labelledby="money">
        <h2 id="money" className="label" style={{ marginBottom: "0.6rem" }}>
          Money
        </h2>
        <div className="stats">
          <Stat
            label="AI cost"
            value={t.aiCost30dUsd === null ? "—" : `$${t.aiCost30dUsd.toFixed(2)}`}
            note={`${t.aiCalls30d} calls, 30 days${t.aiUnknownCost30d ? ` · ${t.aiUnknownCost30d} without a cost` : ""}`}
          />
          {t.money ? (
            <>
              <Stat label="Collected" value={formatInr(t.money.collected30d)} note="last 30 days" />
              <Stat
                label="Outstanding"
                value={formatInr(t.money.outstanding)}
                note={t.money.overdueCount ? `${formatInr(t.money.overdue)} overdue on ${t.money.overdueCount} invoice(s)` : "none overdue"}
              />
              <Stat label="MRR" value={formatInr(t.money.mrr)} note="active care plans" />
              <Stat label="Gross margin" value={pct(t.money.grossMarginActual)} note="actual, projects with costs recorded" />
            </>
          ) : (
            <div className="stat pending">
              <span className="label">Revenue and margins</span>
              <b>Finance only</b>
              <small>Visible to roles with finance access</small>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <b>{value}</b>
      <small>{note}</small>
    </div>
  );
}
