"use client";

import Link from "next/link";
import { Ago, useNow, useSnapshot } from "@/app/_components/Live";
import { Avatar } from "@/app/_components/people";
import { SampleNote } from "@/app/_components/SampleNote";
import { busyMap, greeting, laneOwner, ORG_NAME, overallStatus, plural, short } from "@/lib/plain";

export default function Today() {
  const s = useSnapshot();
  const now = useNow(60_000);
  const people = s.people ?? [];
  const busy = busyMap(s);
  const working = s.lanes.filter((l) => l.status === "working");
  const inReview = s.reviews.filter((r) => r.stage !== "merged");
  const status = overallStatus(s.health);
  const goals = [...s.progress].sort((a, b) => b.done / Math.max(b.total, 1) - a.done / Math.max(a.total, 1)).slice(0, 5);
  const finished = s.events.filter((e) => e.kind === "merged" && now - Date.parse(e.at) < 48 * 3600_000).slice(0, 5);

  return (
    <>
      <section className="hero">
        <p className="hero-hello" suppressHydrationWarning>
          {greeting(new Date(now))}
        </p>
        <h1>
          {busy.size > 0 ? plural(busy.size, "person is", "people are") : "Nobody is"} working
          {working.length ? ` on ${plural(working.length, "task")}` : ""}.
        </h1>
        <p className="hero-sub">
          {plural(inReview.length, "piece", "pieces")} of work in review · {plural(s.waiting.length, "thing")} waiting for you · {plural(people.length, "person", "people")} on staff
        </p>
        <p className={`status-pill ${status.tone}`}>
          <span className="status-dot" aria-hidden="true" />
          <b>{status.headline}</b>
          <span className="status-detail">{status.detail}</span>
        </p>
      </section>
      <SampleNote />

      <section className="panel" aria-labelledby="now-h">
        <div className="panel-head">
          <h2 id="now-h">Working right now</h2>
          <Link href="/work" className="more">
            See all work →
          </Link>
        </div>
        {working.length === 0 ? (
          <p className="empty">Nobody is working right now.</p>
        ) : (
          <ul className="now-list" role="list">
            {working.map((l) => {
              const who = laneOwner(l, people);
              return (
                <li key={l.id}>
                  <Avatar id={who.id} busy size="lg" />
                  <div>
                    <b>{who.title}</b>
                    <span className="faint"> · {ORG_NAME[l.org]}</span>
                    <p>{short(l.task, 110)}</p>
                    <small className="faint">
                      started <Ago at={l.startedAt} />
                    </small>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid-2">
        <section className="panel" aria-labelledby="you-h">
          <div className="panel-head">
            <h2 id="you-h">Needs you</h2>
            <Link href="/needs-you" className="more">
              All {s.waiting.length} →
            </Link>
          </div>
          {s.waiting.length === 0 ? (
            <p className="empty">Nothing needs you. Enjoy the quiet.</p>
          ) : (
            <ol className="todo" role="list">
              {s.waiting.slice(0, 4).map((w) => (
                <li key={w.id}>
                  <span className={`todo-kind k-${w.kind}`}>{w.kind === "approval" ? "Approve" : w.kind === "usage" ? "Decide" : w.kind === "decision" ? "Decide" : "Set up"}</span>
                  <span>{short(w.title, 100)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="panel" aria-labelledby="goals-h">
          <div className="panel-head">
            <h2 id="goals-h">Goals</h2>
            <Link href="/goals" className="more">
              All goals →
            </Link>
          </div>
          {goals.map((g) => {
            const pct = Math.round((g.done / Math.max(g.total, 1)) * 100);
            return (
              <div className="goal" key={g.id}>
                <div className="goal-head">
                  <span>{g.label}</span>
                  <b className="num">{pct}%</b>
                </div>
                <div className="meter" role="progressbar" aria-label={g.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                  <span style={{ width: `${pct}%` }} />
                  {g.active > 0 && <span className="meter-active" style={{ width: `${Math.min(100 - pct, Math.round((g.active / Math.max(g.total, 1)) * 100))}%` }} />}
                </div>
              </div>
            );
          })}
        </section>
      </div>

      <section className="panel" aria-labelledby="done-h">
        <div className="panel-head">
          <h2 id="done-h">Just finished</h2>
          <span className="faint">last 2 days</span>
        </div>
        {finished.length === 0 ? (
          <p className="empty">Nothing finished in the last two days.</p>
        ) : (
          <ul className="done-list" role="list">
            {finished.map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <span className="done-tick" aria-hidden="true" />
                <span>
                  {short(e.text, 120)}
                  {e.repo && <span className="faint"> · {e.repo.includes("ip") ? ORG_NAME.ip : ORG_NAME.nirmaan}</span>}
                </span>
                <small className="faint">
                  <Ago at={e.at} />
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
