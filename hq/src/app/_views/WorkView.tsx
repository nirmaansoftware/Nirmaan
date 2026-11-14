"use client";

import { Ago, useNow, useSnapshot } from "../_components/Live";
import { Brain, Who } from "../_components/people";
import { SampleNote } from "../_components/SampleNote";
import { laneOwner, ORG_NAME, short, stageText } from "@/lib/plain";

const GH = "https://github.com/nirmaansoftware";
const repoOrg = (repo: string) => (repo.includes("ip") ? ORG_NAME.ip : ORG_NAME.nirmaan);

/** A task board anyone can read: what is moving, what waits for review, what is paused, what is done. */
export function WorkView() {
  const s = useSnapshot();
  const now = useNow(60_000);
  const people = s.people ?? [];
  const working = s.lanes.filter((l) => l.status === "working");
  const waitingLanes = s.lanes.filter((l) => l.status === "waiting");
  const paused = s.lanes.filter((l) => l.status === "paused" || l.status === "failed");
  const reviews = s.reviews.filter((r) => r.stage !== "merged");
  const done = s.events.filter((e) => e.kind === "merged" && now - Date.parse(e.at) < 48 * 3600_000);

  const columns = [
    { id: "doing", title: "In progress", count: working.length },
    { id: "review", title: "Waiting for review", count: reviews.length + waitingLanes.length },
    { id: "paused", title: "Paused", count: paused.length },
    { id: "done", title: "Done recently", count: done.length },
  ];

  return (
    <>
      <header className="page-head">
        <div>
          <span className="label">Who is working on what</span>
          <h1>Work</h1>
        </div>
      </header>
      <SampleNote />

      <div className="board">
        {columns.map((c) => (
          <section key={c.id} className={`col col-${c.id}`} aria-labelledby={`col-${c.id}`}>
            <h2 id={`col-${c.id}`}>
              {c.title} <span className="col-count">{c.count}</span>
            </h2>
            <ul role="list">
              {c.id === "doing" &&
                working.map((l) => (
                  <li key={l.id} className="card">
                    <p className="card-title">{short(l.task, 120)}</p>
                    <Who person={laneOwner(l, people)} />
                    <div className="card-meta">
                      <Brain model={l.model} />
                      <span className="faint">
                        <Ago at={l.lastActivityAt} />
                      </span>
                    </div>
                  </li>
                ))}
              {c.id === "review" && (
                <>
                  {reviews.map((r) => (
                    <li key={`${r.repo}#${r.pr}`} className={`card${r.stage === "needs-founder" ? " card-you" : ""}`}>
                      <p className="card-title">{short(r.title, 120)}</p>
                      <span className={`stage-chip s-${r.stage}`}>{stageText(r.stage)}</span>
                      <div className="card-meta">
                        <span className="faint">{repoOrg(r.repo)}</span>
                        <a href={`${GH}/${r.repo}/pull/${r.pr}`} target="_blank" rel="noreferrer">
                          view
                        </a>
                      </div>
                    </li>
                  ))}
                  {waitingLanes.map((l) => (
                    <li key={l.id} className="card">
                      <p className="card-title">{short(l.task, 120)}</p>
                      <Who person={laneOwner(l, people)} busy={false} />
                      {l.note && <small className="faint">{l.note}</small>}
                    </li>
                  ))}
                </>
              )}
              {c.id === "paused" &&
                paused.map((l) => (
                  <li key={l.id} className="card card-paused">
                    <p className="card-title">{short(l.task, 120)}</p>
                    <Who person={laneOwner(l, people)} busy={false} />
                    <small className="faint">{l.status === "failed" ? "Stopped with a problem" : "Paused"}</small>
                  </li>
                ))}
              {c.id === "done" &&
                done.map((e, i) => (
                  <li key={`${e.at}-${i}`} className="card card-done">
                    <p className="card-title">{short(e.text, 120)}</p>
                    <div className="card-meta">
                      <span className="faint">
                        {e.repo ? `${repoOrg(e.repo)} · ` : ""}
                        <Ago at={e.at} />
                      </span>
                      {e.repo && e.pr ? (
                        <a href={`${GH}/${e.repo}/pull/${e.pr}`} target="_blank" rel="noreferrer">
                          view
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              {c.count === 0 && <li className="col-empty">Nothing here</li>}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
