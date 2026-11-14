"use client";

import { useSnapshot } from "../_components/Live";
import { Blocks, ModelChip } from "../_components/ui";
import { SampleNote } from "../_components/SampleNote";

const CAUSE = { model: "model mistake", harness: "harness problem", case: "broken case" } as const;
const CAUSE_TONE = { model: "warn", harness: "bad", case: "info" } as const;

export function EvalsView() {
  const s = useSnapshot();
  return (
    <>
      <header className="page-head">
        <div>
          <span className="label">Live batches, judged by real tool runs</span>
          <h1>Evals</h1>
        </div>
      </header>
      <SampleNote />

      {s.evals.length === 0 && <p className="empty">No batches.</p>}
      {s.evals.map((e) => {
        const failed = e.trials - e.passed;
        return (
          <section className="panel" key={e.id} aria-labelledby={`ev-${e.id}`}>
            <div className="panel-head">
              <h2 id={`ev-${e.id}`}>{e.label}</h2>
              <span className={`badge ${e.status === "running" ? "info" : e.status === "done" ? "good" : ""}`.trim()}>{e.status}</span>
            </div>
            <dl className="dl">
              <dt>Model</dt>
              <dd>
                <ModelChip model={e.model} />
              </dd>
              <dt>Harness</dt>
              <dd>
                <code>{e.harness}</code>
              </dd>
            </dl>
            <div className="track">
              <div className="track-head">
                <b>Cases</b>
                <span className="mono num muted">
                  {e.casesDone}/{e.casesTotal}
                </span>
              </div>
              <Blocks done={e.casesDone} active={e.status === "running" ? 1 : 0} total={e.casesTotal} label={`${e.label} cases`} />
            </div>
            <section className="stats" aria-label="Trials">
              <div className="stat">
                <span className="label">Trials</span>
                <b>{e.trials}</b>
              </div>
              <div className="stat">
                <span className="label">Passed</span>
                <b>{e.passed}</b>
              </div>
              <div className="stat">
                <span className="label">Failed</span>
                <b>{failed}</b>
              </div>
            </section>
            {e.failures.length > 0 && (
              <div className="row" aria-label="Why trials failed">
                <span className="label">why they failed</span>
                {e.failures.map((f) => (
                  <span key={f.cause} className={`badge ${CAUSE_TONE[f.cause]}`}>
                    {CAUSE[f.cause]}: {f.n}
                  </span>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
