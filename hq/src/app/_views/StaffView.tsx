"use client";

import { useSnapshot } from "../_components/Live";
import { Light, ModelChip } from "../_components/ui";
import { SampleNote } from "../_components/SampleNote";
import type { Org, SkillLevel } from "@/lib/snapshot";

const ORGS: { id: Org; label: string }[] = [
  { id: "ip", label: "IP Nirmaan" },
  { id: "nirmaan", label: "Nirmaan" },
];
const LEVEL_LIGHT: Record<SkillLevel, "ok" | "paused" | "none"> = { practised: "ok", knowledge: "paused", none: "none" };

export function StaffView() {
  const s = useSnapshot();
  return (
    <>
      <header className="page-head">
        <div>
          <span className="label">Roles, their skills, and how each level was earned</span>
          <h1>Staff</h1>
        </div>
        <span className="row">
          <span className="row">
            <Light status="ok" label="practised" /> <small>Practised</small>
          </span>
          <span className="row">
            <Light status="paused" label="knowledge" /> <small>Knowledge</small>
          </span>
          <span className="row">
            <Light status="none" label="not yet" /> <small>Not yet</small>
          </span>
        </span>
      </header>
      <SampleNote />

      {ORGS.map((org) => {
        const roles = s.staff.filter((r) => r.org === org.id);
        if (roles.length === 0) return null;
        return (
          <section key={org.id} className="stack" aria-labelledby={`org-${org.id}`}>
            <h2 id={`org-${org.id}`}>{org.label}</h2>
            <div className="grid-3">
              {roles.map((r) => {
                const practised = r.skills.filter((k) => k.level === "practised").length;
                return (
                  <article className="panel" key={r.id}>
                    <div className="panel-head">
                      <h3>{r.title}</h3>
                      <span className="label">{r.team}</span>
                    </div>
                    <span className="lane-meta">
                      {r.model && <ModelChip model={r.model} />}
                      <span className="mono">
                        {practised}/{r.skills.length} practised
                      </span>
                    </span>
                    <ul className="skills" role="list">
                      {r.skills.map((k) => (
                        <li key={k.id} className="skill" title={k.harness ? `harness ${k.harness}` : k.level}>
                          <Light status={LEVEL_LIGHT[k.level]} label={k.level} />
                          {k.id}
                        </li>
                      ))}
                    </ul>
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
