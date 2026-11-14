"use client";

import Link from "next/link";
import { Ago, useSnapshot } from "./_components/Live";
import { Blocks, LaneBadge, Light, ModelChip, StagePipe } from "./_components/ui";
import { SampleNote } from "./_components/SampleNote";

const KIND_LABEL = { approval: "approve", usage: "usage", setup: "set up", decision: "decide" } as const;

export default function Overview() {
  const s = useSnapshot();
  const working = s.lanes.filter((l) => l.status === "working");
  const open = s.reviews.filter((r) => r.stage !== "merged");
  return (
    <>
      <header className="page-head">
        <div>
          <span className="label">Nirmaan ecosystem</span>
          <h1>Overview</h1>
        </div>
      </header>
      <SampleNote />

      <section className="health" aria-label="Health">
        {s.health.map((h) => (
          <div key={h.id}>
            <span className="row">
              <Light status={h.status} />
              <b>{h.label}</b>
            </span>
            <small className="muted">{h.detail}</small>
            <small className="faint">
              since <Ago at={h.since} />
            </small>
          </div>
        ))}
      </section>

      <div className="split">
        <section className="panel" aria-labelledby="progress-h">
          <div className="panel-head">
            <h2 id="progress-h">Progress</h2>
            <span className="label">done · in progress · to do</span>
          </div>
          {s.progress.map((p) => (
            <div className="track" key={p.id}>
              <div className="track-head">
                <span>
                  <b>{p.label}</b> <span className="faint label">{p.org}</span>
                </span>
                <span className="mono num muted">
                  {p.done}/{p.total} {p.unit}
                  {p.active ? ` · ${p.active} active` : ""}
                </span>
              </div>
              <Blocks done={p.done} active={p.active} total={p.total} label={p.label} />
              {p.note && <small className="faint">{p.note}</small>}
            </div>
          ))}
        </section>

        <div className="stack">
          <section className="panel" aria-labelledby="waiting-h">
            <div className="panel-head">
              <h2 id="waiting-h">Waiting on you</h2>
              <span className="label">{s.waiting.length}</span>
            </div>
            {s.waiting.length === 0 ? (
              <p className="empty">Nothing needs you right now.</p>
            ) : (
              <ul className="list" role="list">
                {s.waiting.map((w) => (
                  <li key={w.id}>
                    <div className="item-head">
                      <b>{w.title}</b>
                      <span className="badge warn">{KIND_LABEL[w.kind]}</span>
                    </div>
                    <small className="muted">
                      {w.where} · <Ago at={w.since} />
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel" aria-labelledby="now-h">
            <div className="panel-head">
              <h2 id="now-h">Working now</h2>
              <Link href="/agents" className="label">
                all agents
              </Link>
            </div>
            {working.length === 0 ? (
              <p className="empty">No lane is working.</p>
            ) : (
              <ul className="list" role="list">
                {working.map((l) => (
                  <li key={l.id}>
                    <div className="item-head">
                      <b className="mono">{l.id}</b>
                      <LaneBadge status={l.status} />
                    </div>
                    <span>{l.task}</span>
                    <span className="lane-meta">
                      <ModelChip model={l.model} />
                      <span>
                        active <Ago at={l.lastActivityAt} />
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel" aria-labelledby="rev-h">
            <div className="panel-head">
              <h2 id="rev-h">In review</h2>
              <Link href="/reviews" className="label">
                all reviews
              </Link>
            </div>
            {open.length === 0 ? (
              <p className="empty">No open PRs.</p>
            ) : (
              <ul className="list" role="list">
                {open.map((r) => (
                  <li key={`${r.repo}#${r.pr}`}>
                    <span>
                      <span className="mono faint">
                        {r.repo}#{r.pr}
                      </span>{" "}
                      {r.title}
                    </span>
                    <StagePipe stage={r.stage} fixRounds={r.fixRounds} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
