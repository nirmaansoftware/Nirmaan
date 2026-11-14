"use client";

import { useSnapshot } from "../_components/Live";
import { compact, ModelChip } from "../_components/ui";
import { SampleNote } from "../_components/SampleNote";
import { modelFamily, modelLabel, type ModelFamily } from "@/lib/snapshot";

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
  const allTokens = byFamily.reduce((n, x) => n + x.tokens, 0) || 1;
  const maxTokens = Math.max(1, ...byFamily.map((x) => x.tokens));
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
          <h2 id="share-h">Share of tokens</h2>
          <span className="label">input + output</span>
        </div>
        <div className="strip" role="img" aria-label={byFamily.map((x) => `${FAMILY_LABEL[x.f]} ${Math.round((x.tokens / allTokens) * 100)}%`).join(", ")}>
          {byFamily.map((x) => (
            <span key={x.f} className={`bar-fill m-${x.f}`} style={{ width: `${(x.tokens / allTokens) * 100}%` }} />
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
                <span className={`bar-fill m-${x.f}`} style={{ width: `${(x.tokens / maxTokens) * 100}%`, display: "block" }} />
              </span>
              <span className="num mono">
                {Math.round((x.tokens / allTokens) * 100)}% · {compact(x.calls)} calls
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
                <th>Calls</th>
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
