"use client";

import { useState } from "react";
import { useSnapshot } from "../_components/Live";
import { PersonCard } from "../_components/people";
import { SampleNote } from "../_components/SampleNote";
import { busyMap, ORG_KIND, ORG_NAME, plural } from "@/lib/plain";
import type { Org, Person } from "@/lib/snapshot";

const ORGS: Org[] = ["ip", "nirmaan"];

export function TeamView() {
  const s = useSnapshot();
  const people = s.people ?? [];
  const busy = busyMap(s);
  const [onlyBusy, setOnlyBusy] = useState(false);
  const shown = onlyBusy ? people.filter((p) => busy.has(p.id)) : people;

  return (
    <>
      <header className="page-head">
        <div>
          <span className="label">Your staff</span>
          <h1>Team</h1>
          <p className="muted">
            {plural(people.length, "person", "people")} across two companies · {plural(busy.size, "is", "are")} working now
          </p>
        </div>
        <div className="seg" role="group" aria-label="Show">
          <button type="button" aria-pressed={!onlyBusy} onClick={() => setOnlyBusy(false)}>
            Everyone
          </button>
          <button type="button" aria-pressed={onlyBusy} onClick={() => setOnlyBusy(true)}>
            Working now
          </button>
        </div>
      </header>
      <SampleNote />

      {ORGS.map((org) => {
        const inOrg = shown.filter((p) => p.org === org);
        if (inOrg.length === 0) return null;
        const teams = new Map<string, Person[]>();
        for (const p of inOrg) teams.set(p.team, [...(teams.get(p.team) ?? []), p]);
        return (
          <section key={org} className="org" aria-labelledby={`org-${org}`}>
            <div className="org-head">
              <h2 id={`org-${org}`}>{ORG_NAME[org]}</h2>
              <span className="faint">
                {ORG_KIND[org]} · {plural(inOrg.length, "person", "people")}
              </span>
            </div>
            {[...teams.entries()].map(([team, members]) => (
              <div className="team" key={team}>
                <h3 className="team-name">
                  {team} <span className="faint">{members.length}</span>
                </h3>
                <div className="people">
                  {[...members]
                    .sort((a, b) => Number(b.head) - Number(a.head) || Number(busy.has(b.id)) - Number(busy.has(a.id)))
                    .map((p) => (
                      <PersonCard key={p.id} person={p} lanes={busy.get(p.id) ?? []} />
                    ))}
                </div>
              </div>
            ))}
          </section>
        );
      })}
      {shown.length === 0 && <p className="empty">Nobody is working right now.</p>}
    </>
  );
}
