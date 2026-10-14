import type { Metadata } from "next";
import { aiUsageSummary } from "@/lib/ai/summary";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { resolveModel, type TaskType } from "@/lib/ai/router";
import { NoAccess, PageHead } from "../../_components/ui";

export const metadata: Metadata = { title: "AI usage" };

const TASK_TYPES: TaskType[] = ["classification", "requirements", "content", "research", "code", "architecture"];

export default async function AiPage() {
  const user = await requireUser();
  if (!can(user.role, "ai:read")) return <NoAccess capability="ai:read" />;
  const { byTask, byModel, recent } = await aiUsageSummary();
  const usd = (n: number | null | undefined) => (n == null ? "—" : `$${n.toFixed(4)}`);

  return (
    <>
      <PageHead title="AI usage" eyebrow="Cost governance" />
      <p className="muted">
        Every metered model call is recorded with model, tokens, cost and latency. Costs are reported by the provider where it gives one, estimated from real token counts
        where it doesn&apos;t, and left blank rather than guessed otherwise. Agent task dispatch (<code>dispatchTask</code>) still logs cost to project activity; moving it
        here is Phase 2.
      </p>
      <div className="grid-2">
        <section className="panel">
          <h2>By task (30 days)</h2>
          {byTask.length === 0 ? (
            <p className="empty">No calls yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Calls</th>
                    <th>Cost</th>
                    <th>Avg latency</th>
                  </tr>
                </thead>
                <tbody>
                  {byTask.map((r) => (
                    <tr key={r.task}>
                      <td className="code">{r.task}</td>
                      <td className="num">{r._count}</td>
                      <td className="num">{usd(r._sum.costUsd)}</td>
                      <td className="num">{Math.round((r._avg.latencyMs ?? 0) / 1000)} s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="panel">
          <h2>By model (30 days)</h2>
          {byModel.length === 0 ? (
            <p className="empty">No calls yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Calls</th>
                    <th>Tokens in / out</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {byModel.map((r) => (
                    <tr key={`${r.provider}-${r.model}`}>
                      <td className="code">
                        {r.model} <span className="faint">{r.provider}</span>
                      </td>
                      <td className="num">{r._count}</td>
                      <td className="num">
                        {r._sum.inputTokens ?? "—"} / {r._sum.outputTokens ?? "—"}
                      </td>
                      <td className="num">{usd(r._sum.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      <section className="panel">
        <h2>Current model routing</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Task type</th>
                <th>Provider</th>
                <th>Model</th>
              </tr>
            </thead>
            <tbody>
              {TASK_TYPES.map((t) => {
                const m = resolveModel(t);
                return (
                  <tr key={t}>
                    <td className="code">{t}</td>
                    <td>{m.provider}</td>
                    <td className="code">{m.model}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>Recent calls</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Task</th>
                <th>Model</th>
                <th>Result</th>
                <th>Cost</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td className="faint">{r.createdAt.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="code">{r.task}</td>
                  <td className="code">{r.model}</td>
                  <td>{r.success ? <span className="badge good">ok</span> : <span className="badge bad" title={r.error ?? ""}>failed</span>}</td>
                  <td className="num">
                    {usd(r.costUsd)} <span className="faint">{r.costSource.toLowerCase()}</span>
                  </td>
                  <td className="num">{(r.latencyMs / 1000).toFixed(1)} s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
