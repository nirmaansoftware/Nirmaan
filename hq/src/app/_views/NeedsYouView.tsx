"use client";

import { Ago, useSnapshot } from "../_components/Live";
import { SampleNote } from "../_components/SampleNote";
import type { WaitingKind } from "@/lib/snapshot";

const KIND: Record<WaitingKind, { label: string; hint: string }> = {
  approval: { label: "Approve", hint: "Your yes lets the work go live." },
  usage: { label: "Decide", hint: "Your call on how much to spend from the plan." },
  decision: { label: "Decide", hint: "A choice only you can make." },
  setup: { label: "Set up", hint: "A one-time step in one of your accounts." },
};
const ORDER: WaitingKind[] = ["approval", "decision", "usage", "setup"];

export function NeedsYouView() {
  const s = useSnapshot();
  const items = [...s.waiting].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.since.localeCompare(b.since));
  return (
    <>
      <header className="page-head">
        <div>
          <span className="label">Only you can do these</span>
          <h1>Needs you</h1>
          <p className="muted">{items.length === 0 ? "Nothing right now." : `${items.length} things, most important first.`}</p>
        </div>
      </header>
      <SampleNote />
      <ol className="needs" role="list">
        {items.map((w, i) => (
          <li key={w.id} className={`need k-${w.kind}`}>
            <span className="need-n">{i + 1}</span>
            <div>
              <span className={`todo-kind k-${w.kind}`}>{KIND[w.kind].label}</span>
              <h2>{w.title}</h2>
              <p className="muted">
                Where: {w.where} · waiting <Ago at={w.since} />
              </p>
              <small className="faint">{KIND[w.kind].hint}</small>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
