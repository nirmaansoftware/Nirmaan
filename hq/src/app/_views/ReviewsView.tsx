"use client";

import { Ago, useSnapshot } from "../_components/Live";
import { StagePipe } from "../_components/ui";
import { SampleNote } from "../_components/SampleNote";

const GH = "https://github.com/nirmaansoftware";

export function ReviewsView() {
  const s = useSnapshot();
  const open = s.reviews.filter((r) => r.stage !== "merged").sort((a, b) => a.since.localeCompare(b.since));
  const founder = open.filter((r) => r.stage === "needs-founder").length;
  return (
    <>
      <header className="page-head">
        <div>
          <span className="label">Two keys, then the Founder Proxy</span>
          <h1>Reviews</h1>
        </div>
      </header>
      <SampleNote />

      <section className="stats" aria-label="Review totals">
        <div className="stat">
          <span className="label">Open</span>
          <b>{open.length}</b>
        </div>
        <div className="stat">
          <span className="label">Needs you</span>
          <b>{founder}</b>
        </div>
        <div className="stat">
          <span className="label">In fix rounds</span>
          <b>{open.filter((r) => r.fixRounds > 0).length}</b>
        </div>
      </section>

      <section className="panel" aria-labelledby="open-h">
        <div className="panel-head">
          <h2 id="open-h">Open PRs</h2>
          <span className="label">oldest first</span>
        </div>
        {open.length === 0 ? (
          <p className="empty">No open PRs.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>PR</th>
                  <th>Title</th>
                  <th>Stage</th>
                  <th>In stage</th>
                  <th>Fix rounds</th>
                </tr>
              </thead>
              <tbody>
                {open.map((r) => (
                  <tr key={`${r.repo}#${r.pr}`}>
                    <td className="code">
                      <a href={`${GH}/${r.repo}/pull/${r.pr}`} rel="noreferrer" target="_blank">
                        {r.repo}#{r.pr}
                      </a>
                    </td>
                    <td>{r.title}</td>
                    <td>
                      <StagePipe stage={r.stage} fixRounds={r.fixRounds} />
                    </td>
                    <td className="num">
                      <Ago at={r.since} />
                    </td>
                    <td className="num">{r.fixRounds}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
