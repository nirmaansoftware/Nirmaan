import type { Lane, Person } from "@/lib/snapshot";
import { modelPersona, ORG_NAME, short } from "@/lib/plain";

/**
 * A staff member's face: a 5x5 pixel mark from the logo's grid, mirrored like
 * a face, unique per role. Ink at rest; blue while they are working (the
 * "being laid" colour).
 */
export function Avatar({ id, busy = false, size = "md" }: { id: string; busy?: boolean; size?: "sm" | "md" | "lg" }) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const cells: [number, number][] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      if ((h >>> (row * 3 + col)) & 1) {
        cells.push([col, row]);
        if (col < 2) cells.push([4 - col, row]);
      }
    }
  }
  if (cells.length < 6) cells.push([2, 1], [1, 3], [3, 3], [2, 4]); // never a near-empty face
  return (
    <span className={`avatar avatar-${size}${busy ? " busy" : ""}`} aria-hidden="true">
      <svg viewBox="-1 -1 7 7" shapeRendering="crispEdges">
        {cells.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />
        ))}
      </svg>
    </span>
  );
}

/** "Opus 5.5 · expert" with its colour swatch. */
export function Brain({ model }: { model: string }) {
  const m = modelPersona(model);
  return (
    <span className={`brain m-${m.family}`} title={model}>
      {m.name} <span className="faint">· {m.persona}</span>
    </span>
  );
}

/** One member of staff: who they are, and what they are doing now. */
export function PersonCard({ person, lanes }: { person: Person; lanes: Lane[] }) {
  const busy = lanes.length > 0;
  return (
    <article className={`person${busy ? " is-busy" : ""}`}>
      <Avatar id={person.id} busy={busy} />
      <div className="person-body">
        <h3>{person.title}</h3>
        <p className="person-team">
          {person.head ? "Leads " : ""}
          {person.team}
        </p>
        {busy ? (
          lanes.map((l) => (
            <p className="person-now" key={l.id}>
              <span className="now-dot" aria-hidden="true" />
              <span>{short(l.task, 70)}</span>
            </p>
          ))
        ) : (
          <p className="person-free">{person.about ? short(person.about, 70) : "Available"}</p>
        )}
        {busy && <Brain model={lanes[0].model} />}
      </div>
    </article>
  );
}

/** Compact "who" line for a task card. */
export function Who({ person, busy = true }: { person: Person; busy?: boolean }) {
  return (
    <span className="who">
      <Avatar id={person.id} busy={busy} size="sm" />
      <span>
        <b>{person.title}</b>
        <small className="faint"> · {ORG_NAME[person.org]}</small>
      </span>
    </span>
  );
}
