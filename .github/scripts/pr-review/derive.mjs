// Key derivation from the org chart (agents/org-chart.yml), in SHADOW mode:
// review.mjs computes who would hold the keys under the chart and logs it
// beside who actually holds them. Posting does not change: key 2 stays
// config.json key2_role until a later switch PR. Rule (capability hierarchy
// decision D4.2):
//   - key 1: the head of each active unit that owns a changed path (the
//     review map's team ids are the chart's key-1 unit ids); a vacant
//     (planned) head rolls up to its nearest active manager;
//   - key 2: the lowest active manager strictly above every key-1 holder,
//     never a key-1 holder; planned positions are skipped; never the human
//     founder (the agent apex stands in);
//   - apex floor: the agent apex holds key 2 for founder classes A and B and
//     for any PR touching the review machinery (APEX_FLOOR_PATHS); no
//     manager reviews a change to its own authority.
// Deputies (decision D4.4) are computed for the record only: a unit head's
// named deputy; for key 2 the next active manager up, never an IC; Legal has
// none (a unit listed in `no_deputy_units`, today the legal teams). Nothing
// here is used to post.

import { globMatch } from '../review-teams.mjs';

const list = (v) => (Array.isArray(v) ? v : []);

export const APEX_FLOOR_CLASSES = ['A', 'B'];
export const APEX_FLOOR_PATHS = [
  'agents/**', '.github/**', '.claude/**', 'AGENTS.md', 'CLAUDE.md',
];

// The chart's positions as a map, and helpers over today's line.
function lines(chart) {
  const pos = new Map(list(chart?.positions).map((p) => [p.id, p]));
  const active = (id) => pos.get(id)?.status === 'active';
  // The chain of managers above `id` (today's reports_to), nearest first.
  const ancestors = (id) => {
    const out = [];
    const seen = new Set([id]);
    for (let cur = pos.get(id)?.reports_to; cur && !seen.has(cur); cur = pos.get(cur)?.reports_to) { seen.add(cur); out.push(cur); }
    return out;
  };
  // The nearest active position at or above `id`.
  const activeAtOrAbove = (id) => (active(id) ? id : ancestors(id).find(active) ?? null);
  // The agent apex: the active agent manager with no agent above it.
  const apex = [...pos.values()].find((p) => p.status === 'active' && p.kind === 'manager' && p.holder !== 'human' && pos.get(p.reports_to)?.holder === 'human')?.id ?? null;
  return { pos, active, ancestors, activeAtOrAbove, apex };
}

const holder = (pos, id) => (id ? { position: id, occupant: pos.get(id)?.occupant ?? null, title: pos.get(id)?.title ?? id } : null);

// Derive the keys for one PR. `teams`: the owning team ids (from main's
// map); `founderClasses`: the class ids found; `files`: changed paths;
// `opts.noDeputyUnits`: unit ids with no deputy. Returns
// { ok: true, key1: [{team, ...holder, deputy}], key2: {...holder, deputy},
//   reason } or { ok: false, error } (shadow only: an error is logged, never
// a deferral).
export function deriveKeys(chart, { teams, founderClasses = [], files = [] }, { noDeputyUnits = [] } = {}) {
  if (!chart || !Array.isArray(chart.positions)) return { ok: false, error: 'no org chart' };
  const L = lines(chart);
  const units = new Map(list(chart.units).map((u) => [u.id, u]));
  if (!teams.length) return { ok: false, error: 'no owning team' };
  if (!L.apex) return { ok: false, error: 'the chart has no active agent apex' };
  const key1 = [];
  for (const t of teams) {
    const u = units.get(t);
    if (!u) return { ok: false, error: `owning team ${t} is not a unit in the chart` };
    if (u.status !== 'active') return { ok: false, error: `unit ${t} is not active` };
    const id = L.activeAtOrAbove(u.head);
    if (!id) return { ok: false, error: `unit ${t} has no active head or manager above it` };
    const dep = noDeputyUnits.includes(t) ? null : L.pos.get(u.head)?.status === 'active' ? L.pos.get(u.head)?.deputy ?? null : null;
    key1.push({ team: t, ...holder(L.pos, id), rolledUp: id !== u.head, deputy: dep && L.active(dep) ? holder(L.pos, dep) : null });
  }
  const holders = new Set(key1.map((k) => k.position));
  // Lowest common active manager strictly above every key-1 holder.
  const chains = key1.map((k) => L.ancestors(k.position).filter(L.active));
  let k2 = chains[0].find((id) => chains.every((c) => c.includes(id)) && !holders.has(id)) ?? null;
  let reason = 'lowest active manager above every key-1 holder';
  if (k2 && L.pos.get(k2)?.holder === 'human') { k2 = L.apex; reason = 'the line reaches the founder; the agent apex holds key 2'; }
  if (!k2) { k2 = L.apex; reason = 'no common agent manager; the agent apex holds key 2'; }
  const floorClass = founderClasses.filter((c) => APEX_FLOOR_CLASSES.includes(c));
  const floorPath = files.find((f) => APEX_FLOOR_PATHS.some((g) => globMatch(g, f)));
  if ((floorClass.length || floorPath) && k2 !== L.apex) {
    k2 = L.apex;
    reason = `apex floor (${floorClass.length ? `founder class ${floorClass.join(', ')}` : `control-plane path ${floorPath}`})`;
  } else if (floorClass.length || floorPath) reason += `; apex floor applies (${floorClass.length ? `founder class ${floorClass.join(', ')}` : `control-plane path ${floorPath}`})`;
  if (holders.has(k2)) return { ok: false, error: `key 2 (${k2}) would be a key-1 holder` };
  // Key 2's deputy: the next active manager up, never an IC or the founder.
  const up = L.ancestors(k2).find((id) => L.active(id) && L.pos.get(id)?.kind === 'manager' && L.pos.get(id)?.holder !== 'human') ?? null;
  return { ok: true, key1, key2: { ...holder(L.pos, k2), deputy: holder(L.pos, up) }, reason };
}

// The one line the key-2 comment carries in shadow mode.
export function shadowNote(d, actualRole) {
  if (!d.ok) return `Key 2 derived (shadow): not available (${d.error}). Posting is unchanged: ${actualRole} holds key 2.`;
  const k1 = d.key1.map((k) => `${k.team}: ${k.occupant ?? k.position}${k.rolledUp ? ' (head vacant, rolled up)' : ''}`).join('; ');
  const same = d.key2.occupant === actualRole ? 'the same as' : 'not';
  return `Key 2 derived (shadow): ${d.key2.occupant ?? d.key2.position} (${d.key2.title}; ${d.reason}); key 1 derived: ${k1}. That is ${same} today's key 2 (${actualRole}); posting is unchanged.`;
}
