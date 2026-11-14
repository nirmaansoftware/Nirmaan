"use client";

import { useSnapshot } from "../_components/Live";
import { compact, ModelChip } from "../_components/ui";
import { SampleNote } from "../_components/SampleNote";
import { modelFamily, modelLabel, type ModelFamily } from "@/lib/snapshot";

/** A share as a percentage; anything above zero shows as at least "<1%". */
function pct(n: number, total: number): string {
  const p = (n / total) * 100;
  return n > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`;
}

const FAMILIES: ModelFamily[] = ["fable", "opus", "sonnet", "haiku", "other"];
const FAMILY_LABEL: Record<ModelFamily, string> = { fable: "Fable", opus: "Opus", sonnet: "Sonnet", haiku: "Haiku", other: "Other" };
/** What each family is meant for (R8 routing), shown beside the numbers. */
const FAMILY_ROLE: Record<ModelFamily, string> = {
  fable: "planning, the hardest problems",
  opus: "RTL, runtime code, key 2, Proxy",
  sonnet: "docs, eval cases, fixes, key 1",
  haiku: "search, summaries, checks",
  other: "",
};

export function ModelsView() {
  const s = useSnapshot();
  const tokens = (u: { inputTokens: number; outputTokens: number }) => u.inputTokens + u.outputTokens;
  const byFamily = FAMILIES.map((f) => {
    const rows = s.models.filter((u) => modelFamily(u.model) === f);
    return { f, calls: rows.reduce((n, u) => n + u.calls, 0), tokens: rows.reduce((n, u) => n + tokens(u), 0) };
  }).filter((x) => x.calls > 0);
  // Share of responses: which model does the work. Token totals are dominated by cached
  // input (billions of cheap cache reads), so they would hide everything but the top model.
  const allCalls = byFamily.reduce((n, x) => n + x.calls, 0) || 1;
  const maxCalls = Math.max(1, ...byFamily.map((x) => x.calls));
  const rows = [...s.models].sort((a, b) => tokens(b) - tokens(a));

  return (
    <>
      <header className="page-head">
        <div>
          <span className="label">Which model does which work</span>
          <h1>Models</h1>
        </div>
      </header>
      <SampleNote />

      <section className="panel" aria-labelledby="share-h">
        <div className="panel-head">
          <h2 id="share-h">Share of responses</h2>
          <span className="label">last 7 days · every session, loop and eval</span>
        </div>
        <div className="strip" role="img" aria-label={byFamily.map((x) => `${FAMILY_LABEL[x.f]} ${pct(x.calls, allCalls)}`).join(", ")}>
          {byFamily.map((x) => (
            <span key={x.f} className={`bar-fill m-${x.f}`} style={{ width: `${(x.calls / allCalls) * 100}%` }} />
          ))}
        </div>
        <div className="bars">
          {byFamily.map((x) => (
            <div className="bar" key={x.f}>
              <span>
                <b>{FAMILY_LABEL[x.f]}</b>
                <br />
                <small className="faint">{FAMILY_ROLE[x.f]}</small>
              </span>
              <span className="bar-track">
                <span className={`bar-fill m-${x.f}`} style={{ width: `${(x.calls / maxCalls) * 100}%`, display: "block" }} />
              </span>
              <span className="num mono">
                {pct(x.calls, allCalls)} · {compact(x.calls)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel" aria-labelledby="roles-h">
        <div className="panel-head">
          <h2 id="roles-h">By role</h2>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Model</th>
                <th>Responses</th>
                <th>Input</th>
                <th>Output</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={`${u.role}-${u.model}`}>
                  <td>{u.role}</td>
                  <td>
                    <ModelChip model={u.model} />
                    <span className="visually-hidden"> {modelLabel(u.model)}</span>
                  </td>
                  <td className="num">{compact(u.calls)}</td>
                  <td className="num">{compact(u.inputTokens)}</td>
                  <td className="num">{compact(u.outputTokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
