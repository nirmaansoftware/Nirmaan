"use client";

import { useSnapshot } from "../_components/Live";
import { Blocks } from "../_components/ui";
import { SampleNote } from "../_components/SampleNote";
import { ORG_NAME } from "@/lib/plain";
import type { Org } from "@/lib/snapshot";

export function GoalsView() {
  const s = useSnapshot();
  const orgs: Org[] = ["ip", "nirmaan"];
  return (
    <>
      <header className="page-head">
        <div>
          <span className="label">Where each plan stands</span>
          <h1>Goals</h1>
          <p className="muted">Black is done, blue is being worked on, grey is still to do.</p>
        </div>
      </header>
      <SampleNote />
      {orgs.map((org) => {
        const goals = s.progress.filter((p) => p.org === org);
        if (goals.length === 0) return null;
        return (
          <section key={org} className="stack" aria-labelledby={`g-${org}`}>
            <h2 id={`g-${org}`}>{ORG_NAME[org]}</h2>
            <div className="goal-cards">
              {goals.map((g) => {
                const pct = Math.round((g.done / Math.max(g.total, 1)) * 100);
                return (
                  <article className="panel goal-card" key={g.id}>
                    <div className="goal-top">
                      <h3>{g.label}</h3>
                      <b className="goal-pct num">{pct}%</b>
                    </div>
                    <Blocks done={g.done} active={g.active} total={g.total} label={g.label} />
                    <p className="muted">
                      {g.done} of {g.total} {g.unit} done{g.active ? `, ${g.active} in progress` : ""}
                    </p>
                    {g.note && <small className="faint">{g.note}</small>}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
