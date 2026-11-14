"use client";

import { Ago, useSnapshot } from "../_components/Live";
import { LaneBadge, ModelChip } from "../_components/ui";
import { SampleNote } from "../_components/SampleNote";
import type { LaneStatus } from "@/lib/snapshot";

const ORDER: LaneStatus[] = ["working", "waiting", "paused", "failed", "done"];
const GH = "https://github.com/nirmaansoftware";

export function AgentsView() {
  const s = useSnapshot();
  const lanes = [...s.lanes].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || b.lastActivityAt.localeCompare(a.lastActivityAt));
  return (
    <>
      <header className="page-head">
        <div>
          <span className="label">Who is doing what, on which model</span>
          <h1>Live agents</h1>
        </div>
      </header>
      <SampleNote />

      <div className="split">
        <section className="panel" aria-labelledby="lanes-h">
          <div className="panel-head">
            <h2 id="lanes-h">Lanes</h2>
            <span className="label">{lanes.length}</span>
          </div>
          {lanes.length === 0 ? (
            <p className="empty">No lanes.</p>
          ) : (
            <ul className="list" role="list">
              {lanes.map((l) => (
                <li key={l.id}>
                  <div className="item-head">
                    <span className="row">
                      <b className="mono">{l.id}</b>
                      <span className="label">{l.org}</span>
                    </span>
                    <LaneBadge status={l.status} />
                  </div>
                  <span>{l.task}</span>
                  <span className="lane-meta">
                    <ModelChip model={l.model} />
                    {l.repo && l.pr ? (
                      <a href={`${GH}/${l.repo}/pull/${l.pr}`} rel="noreferrer" target="_blank">
                        {l.repo}#{l.pr}
                      </a>
                    ) : l.branch ? (
                      <code>{l.branch}</code>
                    ) : null}
                    <span>
                      started <Ago at={l.startedAt} />
                    </span>
                    <span>
                      active <Ago at={l.lastActivityAt} />
                    </span>
                  </span>
                  {l.note && <small className="faint">{l.note}</small>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel" aria-labelledby="feed-h">
          <div className="panel-head">
            <h2 id="feed-h">Feed</h2>
            <span className="label">newest first</span>
          </div>
          {s.events.length === 0 ? (
            <p className="empty">Nothing yet.</p>
          ) : (
            <ol className="list feed" role="list">
              {[...s.events]
                .sort((a, b) => b.at.localeCompare(a.at))
                .map((e, i) => (
                  <li key={`${e.at}-${i}`}>
                    <Ago at={e.at} />
                    <span>
                      <span className="label">{e.kind}</span> {e.text}
                      {e.lane && <span className="faint mono"> · {e.lane}</span>}
                    </span>
                  </li>
                ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
