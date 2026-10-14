import type { AgentRun } from "@prisma/client";
import type { ArchitectureDoc } from "@/lib/factory/architecture";
import type { Plan } from "@/lib/factory/planner";
import { ActionForm } from "./ActionForm";
import { Badge, ago } from "./ui";
import {
  ciTokenAction,
  dispatchAction,
  reviewRunAction,
  runArchitectureAction,
  runPlannerAction,
  setBudgetAction,
} from "../os/actions/factory";

/**
 * AI software factory panel on the project page: architecture → plan →
 * dispatch, each step proposed by an agent and accepted by a person.
 */
export function FactoryPanel({
  projectId,
  runs,
  budgetUsd,
  spend,
  runnable,
  hasCiToken,
  can,
}: {
  projectId: string;
  runs: AgentRun[];
  budgetUsd: number | null;
  spend: { spentUsd: number; calls: number; unknownCostCalls: number };
  runnable: number;
  hasCiToken: boolean;
  can: { run: boolean; review: boolean; write: boolean };
}) {
  const arch = runs.find((r) => r.kind === "ARCHITECTURE");
  const plan = runs.find((r) => r.kind === "PLAN");
  const hidden = <input type="hidden" name="projectId" value={projectId} />;

  return (
    <section className="panel" aria-labelledby="factory">
      <div className="panel-head">
        <h2 id="factory">AI software factory</h2>
        <span className="label num">
          spent ${spend.spentUsd.toFixed(2)}
          {budgetUsd !== null ? ` of $${budgetUsd.toFixed(2)}` : " · no budget set"} · {spend.calls} calls
          {spend.unknownCostCalls ? ` (${spend.unknownCostCalls} without a cost)` : ""}
        </span>
      </div>
      <p className="muted" style={{ fontSize: "0.875rem" }}>
        Agents propose, people decide. The architect and planner produce proposals you review; accepting a plan creates the features and agent-owned
        tasks. Dispatch only runs within the budget, stops at the first failure, and critical agents always get a human review.
      </p>

      <div className="grid-2">
        <div className="stack">
          <h3>1 · Architecture</h3>
          {arch ? <RunCard run={arch} projectId={projectId} canReview={can.review} /> : <p className="empty">No architecture proposed yet.</p>}
          {can.run && (
            <ActionForm action={runArchitectureAction} submit={arch ? "Propose again" : "Ask the Solution Architect"} pendingLabel="Architect is working… (up to 3 minutes)" variant="ghost sm">
              {hidden}
            </ActionForm>
          )}
        </div>
        <div className="stack">
          <h3>2 · Plan</h3>
          {plan ? <RunCard run={plan} projectId={projectId} canReview={can.review} /> : <p className="empty">No plan proposed yet.</p>}
          {can.run && (
            <ActionForm action={runPlannerAction} submit={plan ? "Propose a new plan" : "Ask the Planner"} pendingLabel="Planner is working… (up to 3 minutes)" variant="ghost sm">
              {hidden}
            </ActionForm>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="stack">
          <h3>3 · Run agent tasks</h3>
          <p className="faint" style={{ fontSize: "0.8125rem" }}>
            {runnable} task{runnable === 1 ? "" : "s"} ready (assigned to an agent, dependencies met).
          </p>
          {can.review && (
            <ActionForm action={setBudgetAction} submit="Set budget" variant="ghost sm" className="row">
              {hidden}
              <input className="input" name="budget" inputMode="decimal" defaultValue={budgetUsd ?? ""} placeholder="AI budget, USD" aria-label="AI budget in US dollars" style={{ maxWidth: "10rem" }} />
            </ActionForm>
          )}
          {can.run && (
            <ActionForm action={dispatchAction} submit="Run ready tasks" pendingLabel="Agents are working… (minutes per task)" variant="sm" className="row">
              {hidden}
              <select className="input" name="maxTasks" defaultValue="3" aria-label="How many tasks" style={{ maxWidth: "8rem" }}>
                {[1, 3, 5, 10].map((n) => (
                  <option key={n} value={n}>
                    up to {n}
                  </option>
                ))}
              </select>
            </ActionForm>
          )}
        </div>
        <div className="stack">
          <h3>4 · Evidence from CI</h3>
          <p className="faint" style={{ fontSize: "0.8125rem" }}>
            Your pipeline posts results for TEST- codes to <code>/api/ci/evidence</code>; they appear under Tests and evidence automatically.
            {hasCiToken ? " A token is active." : " No token yet."}
          </p>
          {can.write && (
            <ActionForm action={ciTokenAction} submit={hasCiToken ? "Rotate CI token" : "Issue CI token"} variant="ghost sm">
              {hidden}
            </ActionForm>
          )}
        </div>
      </div>
    </section>
  );
}

function RunCard({ run, projectId, canReview }: { run: AgentRun; projectId: string; canReview: boolean }) {
  return (
    <div className="stack" style={{ gap: "0.5rem" }}>
      <div className="item-head">
        <span>{run.summary}</span>
        <Badge value={run.status} tone={run.status === "ACCEPTED" ? "good" : run.status === "REJECTED" ? "bad" : "warn"} />
      </div>
      <span className="faint" style={{ fontSize: "0.75rem" }}>
        {run.agentSlug} · {ago(run.createdAt)}
        {run.reviewedBy ? ` · ${run.status.toLowerCase()} by ${run.reviewedBy}` : ""}
        {run.reviewNote ? `: ${run.reviewNote}` : ""}
      </span>
      <details className="disclose">
        <summary>Read the {run.kind === "PLAN" ? "plan" : "architecture"}</summary>
        {run.kind === "PLAN" ? <PlanView plan={JSON.parse(run.output) as Plan} /> : <ArchitectureView doc={JSON.parse(run.output) as ArchitectureDoc} />}
      </details>
      {canReview && run.status === "PROPOSED" && (
        <div className="row">
          <ActionForm action={reviewRunAction} submit={run.kind === "PLAN" ? "Accept plan (creates tasks)" : "Accept"} variant="sm" className="">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="runId" value={run.id} />
            <input type="hidden" name="decision" value={run.kind === "PLAN" ? "ACCEPT_PLAN" : "ACCEPTED"} />
          </ActionForm>
          <ActionForm action={reviewRunAction} submit="Reject" variant="danger sm" className="row">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="runId" value={run.id} />
            <input type="hidden" name="decision" value="REJECTED" />
            <input className="input" name="note" placeholder="Why?" aria-label="Reason for rejecting" required style={{ maxWidth: "12rem" }} />
          </ActionForm>
        </div>
      )}
    </div>
  );
}

function ArchitectureView({ doc }: { doc: ArchitectureDoc }) {
  const list = (title: string, items: string[]) =>
    items.length > 0 && (
      <>
        <dt>{title}</dt>
        <dd>
          <ul style={{ paddingLeft: "1rem" }}>
            {items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </dd>
      </>
    );
  return (
    <dl className="dl" style={{ fontSize: "0.8125rem" }}>
      <dt>Recommendation</dt>
      <dd className="prewrap">{doc.recommendation}</dd>
      <dt>Complexity</dt>
      <dd>
        {doc.complexity.toLowerCase()}: {doc.complexityJustification}
      </dd>
      <dt>Components</dt>
      <dd>
        <ul style={{ paddingLeft: "1rem" }}>
          {doc.components.map((c) => (
            <li key={c.name}>
              <b>{c.name}</b>: {c.choice} <span className="faint">({c.why})</span>
            </li>
          ))}
        </ul>
      </dd>
      {doc.buildVsBuy.length > 0 && (
        <>
          <dt>Build vs buy</dt>
          <dd>
            <ul style={{ paddingLeft: "1rem" }}>
              {doc.buildVsBuy.map((b) => (
                <li key={b.option}>
                  <b>{b.verdict.toLowerCase()}</b> {b.option}: {b.why}
                </li>
              ))}
            </ul>
          </dd>
        </>
      )}
      {list("Tradeoffs", doc.tradeoffs)}
      {list("Risks", doc.risks)}
      {list("Security", doc.security)}
      {list("Open questions", doc.openQuestions)}
    </dl>
  );
}

function PlanView({ plan }: { plan: Plan }) {
  return (
    <div className="stack" style={{ fontSize: "0.8125rem", gap: "0.6rem" }}>
      {plan.uncovered.length > 0 && <p className="notice warn">No feature covers: {plan.uncovered.join(", ")}.</p>}
      {plan.features.map((f) => (
        <div key={f.title}>
          <b>{f.title}</b> <span className="faint mono">{f.satisfies.join(", ")}</span>
          <ul style={{ paddingLeft: "1rem" }}>
            {f.tasks.map((t) => (
              <li key={t.title}>
                {t.title} <span className="faint">· {t.agent}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
