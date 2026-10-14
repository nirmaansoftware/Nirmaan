import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { userActor } from "@/lib/auth/actor";
import { productizationSignals, MIN_PROJECTS, type Check } from "@/lib/productization/signals";
import { formatInr } from "@/lib/proposals/model";
import { ActionForm } from "../../_components/ActionForm";
import { Badge, NoAccess, PageHead, when } from "../../_components/ui";
import { recordDecisionAction } from "../actions/patterns";

export const metadata: Metadata = { title: "Patterns" };

const TONE: Record<Check, "good" | "bad" | ""> = { PASS: "good", FAIL: "bad", UNKNOWN: "" };
const VERDICT_TONE = { CANDIDATE: "good", WATCH: "warn", NOT_YET: "" } as const;
const label = (t: string) => t.replace("_", " ").toLowerCase();

export default async function PatternsPage() {
  const user = await requireUser();
  if (!can(user.role, "finance:read")) return <NoAccess capability="finance:read" />;
  const canDecide = can(user.role, "knowledge:write");
  const [groups, decisions] = await Promise.all([
    productizationSignals(userActor(user)),
    prisma.knowledge.findMany({ where: { tags: { contains: '"productization"' } }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const candidates = groups.filter((g) => g.verdict === "CANDIDATE").length;

  return (
    <>
      <PageHead title="Patterns" eyebrow="Knowledge & IP" />
      <p className="muted" style={{ maxWidth: "46rem" }}>
        Build a product only when the evidence says so. Each kind of work is checked against four signals from won projects: repeat demand ({MIN_PROJECTS}+
        projects), shared components from the IP library, clients paying for care, and costs running over estimate. Missing data shows as unknown, never as
        a pass. A candidate still needs a recorded decision.
      </p>

      <div className="stats">
        <Stat label="Kinds of work" value={String(groups.length)} note="with at least one won project" />
        <Stat label="Candidates" value={String(candidates)} note="all four signals pass" />
        <Stat label="Decisions" value={String(decisions.length)} note="recorded in the knowledge base" />
      </div>

      {groups.length === 0 ? (
        <section className="panel">
          <p className="empty">No won projects yet. Signals appear once proposals are approved and projects have a kind of work set.</p>
        </section>
      ) : (
        groups.map((g) => (
          <section key={g.serviceType} className="panel" aria-labelledby={`g-${g.serviceType}`}>
            <div className="panel-head">
              <h2 id={`g-${g.serviceType}`}>{g.serviceType === "UNSET" ? "Kind of work not set" : label(g.serviceType)}</h2>
              <span className="row">
                <span className="label num">
                  {g.projects} project{g.projects === 1 ? "" : "s"} · {g.clients} client{g.clients === 1 ? "" : "s"} · {formatInr(g.contract)}
                </span>
                <Badge value={g.verdict} tone={VERDICT_TONE[g.verdict]} />
              </span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {(
                    [
                      ["Repeat demand", g.demand],
                      ["Shared components", g.shared],
                      ["Recurring willingness", g.recurring],
                      ["Underpriced or rebuilt", g.underpriced],
                    ] as const
                  ).map(([name, c]) => (
                    <tr key={name}>
                      <td style={{ width: "13rem" }}>{name}</td>
                      <td style={{ width: "7rem" }}>
                        <Badge value={c.check} tone={TONE[c.check]} />
                      </td>
                      <td className="muted">{c.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {g.sharedAssets.length > 0 && (
              <p className="faint" style={{ fontSize: "0.8125rem" }}>
                Shared: {g.sharedAssets.join(", ")}. <Link href="/os/library">IP library</Link>
              </p>
            )}
            {g.serviceType === "UNSET" && (
              <p className="faint" style={{ fontSize: "0.8125rem" }}>
                Set the kind of work on each project page so it can be grouped.
              </p>
            )}
            {canDecide && g.serviceType !== "UNSET" && g.verdict !== "NOT_YET" && (
              <details className="disclose">
                <summary>Record a decision</summary>
                <ActionForm action={recordDecisionAction} submit="Record decision" variant="sm">
                  <input type="hidden" name="serviceType" value={g.serviceType} />
                  <div className="form-row">
                    <select className="input" name="decision" aria-label="Decision" defaultValue={g.verdict === "CANDIDATE" ? "PURSUE" : "NOT_NOW"}>
                      <option value="PURSUE">Pursue a configurable starter</option>
                      <option value="NOT_NOW">Not now</option>
                    </select>
                  </div>
                  <textarea className="input" name="note" rows={3} required placeholder="Why, and what would change your mind" aria-label="Reasoning" />
                </ActionForm>
              </details>
            )}
          </section>
        ))
      )}

      <section className="panel" aria-labelledby="decisions">
        <h2 id="decisions">Decisions</h2>
        {decisions.length === 0 ? (
          <p className="empty">None yet. The path when you do: extract components into the IP library → a configurable template → a starter on the next similar client → only then a self-serve product.</p>
        ) : (
          <ul className="list" role="list">
            {decisions.map((d) => (
              <li key={d.id} className="item-head">
                <Link href={`/os/knowledge/${d.id}`}>{d.title}</Link>
                <span className="faint">
                  {d.author} · {when(d.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <b>{value}</b>
      <small>{note}</small>
    </div>
  );
}
