#!/usr/bin/env node
// Org chart validator (agents/org-chart.yml), and the generator of the team
// table in agents/README.md.
//
// Each check below has a fixture that must fail in org-chart.test.mjs. Every
// problem starts with its check's code, so a fixture asserts the check that
// caught it.
//
//   schema           a position or unit is malformed (ids, fields, values)
//   legal-entity     legal_entity is missing
//   root             not exactly one root, the founder (human, layer 0)
//   reports-to       a reports_to or target_reports_to names no position, or
//                    an active position reports to a planned one
//   cycle            a reporting line loops (today's chart or the target)
//   depth            a chain is more than 6 layers below the founder
//   layer            a report's layer is not strictly below its manager's
//   no-reports       a staff or ic position has reports
//   staff-key        a staff position heads a unit that holds a key
//   span             an active manager has fewer than 3 line reports or more
//                    than 8 reports (staff count toward the maximum only),
//                    with no recorded exception
//   target-span      the same, for a manager in the target chart
//   exception        an exception is malformed or names no position
//   exception-expired  an exception's review_by date has passed
//   exception-unused   an exception on an active position excuses nothing
//   spec-position    an agents/<slug>/agent.md holds no position, or more
//                    than one, and is not on the `unplaced` list
//   unplaced         an unplaced entry has no reason, names no spec, or
//                    names a spec that also holds a position
//   occupant-spec    an occupant or target_occupant has no spec, or a
//                    target_occupant holds no position today
//   unit-status      a unit's status differs from its head's
//   unit-members     a unit's members differ from the positions under its
//                    head (today's line for an interim unit, the target line
//                    otherwise)
//   planned-owns     a planned unit owns a path, a review team or a stage
//   deputy           an active manager (layers 2 to 5) has no deputy and no
//                    exception, or the deputy is not an active ic of its unit,
//                    is a no-key role, or deputises for two units
//   teams            the teams in review-teams.yml differ from the active
//                    key-1 units (ids, names, leads equal to heads, members),
//                    or the key-2 team is not the apex
//   checklist        a checklists: role is not a head or member of the
//                    entry's units (staff need a declared allowance)
//   paths            a review-teams rule, named file, content rule or the
//                    catch-all names a team that is not an active unit
//   stages           a lead status or project stage is missing or listed
//                    twice, or its owner or client voice is not active
//   title            a title equals an OS role label, misuses VP, Head of or
//                    Lead for its layer, a legal title lacks "agent; not a
//                    lawyer", or a banned title is used
//   plannable        plannable is set on a manager, or is not a boolean
//   reviewed-by      a spec's reviewed_by names a role with no spec
//   member-sentence  a spec's "I am a member of X" names a unit other than
//                    the one the chart puts it in
//   readme           the team table in agents/README.md differs from the
//                    one generated from the chart
//
// Dependency-free: the chart uses the same YAML subset as review-teams.yml,
// parsed by review-teams.mjs.
//
// Usage: node .github/scripts/org-chart.mjs [--write]
// Run from the repository root. --write regenerates the README team table
// first. Exit 0 when every check passes, 1 when one fails, 2 on a usage,
// parse or git error.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseYaml, MAP_PATH } from './review-teams.mjs';

export const CHART_PATH = 'agents/org-chart.yml';
export const README_PATH = 'agents/README.md';
export const ENUMS_PATH = 'os/src/lib/db/enums.ts';
export const PERMISSIONS_PATH = 'os/src/lib/auth/permissions.ts';
export const TABLE_START = '<!-- org-chart:team-table:start (generated from agents/org-chart.yml by node .github/scripts/org-chart.mjs --write; do not edit by hand) -->';
export const TABLE_END = '<!-- org-chart:team-table:end -->';

const KINDS = ['manager', 'staff', 'ic'];
const HOLDERS = ['agent', 'human'];
const STATUSES = ['active', 'planned'];
const MAX_DEPTH = 6;
const SPAN_MIN = 3;
const SPAN_MAX = 8;
const list = (v) => (Array.isArray(v) ? v : []);
const sameSet = (a, b) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

// ---------------------------------------------------------------- inputs from the repository

// The string items of `export const <name> = [ ... ] as const` in a TS file.
export function constList(text, name) {
  const m = new RegExp(`export const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`).exec(text);
  if (!m) throw new Error(`no "export const ${name} = [...] as const"`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

// The labels of ROLE_LABELS in permissions.ts (the OS's human roles).
export function roleLabels(text) {
  const m = /export const ROLE_LABELS[^=]*=\s*\{([\s\S]*?)\};/.exec(text);
  if (!m) throw new Error('no "export const ROLE_LABELS = {...};"');
  return [...m[1].matchAll(/:\s*"([^"]+)"/g)].map((x) => x[1]);
}

// reviewed_by from a spec's frontmatter.
export function reviewedBy(specText) {
  const fm = /^---\n([\s\S]*?)\n---/.exec(specText);
  const line = fm && /^reviewed_by:\s*(.*)$/m.exec(fm[1]);
  return line ? line[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
}

// The X of "I am a member of X in [`.github/review-teams.yml`]", or null.
export function memberSentence(specText) {
  const m = /I am a member of (.+?) in \[`\.github\/review-teams\.yml`\]/.exec(specText);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------- the chart model

export function model(chart) {
  const positions = new Map(list(chart.positions).map((p) => [p.id, p]));
  const units = list(chart.units);
  const targetParent = (p) => (p.interim ? null : (p.target_reports_to ?? p.reports_to ?? null));
  // Positions under each manager, today and in the target chart.
  const children = new Map(), targetChildren = new Map();
  for (const p of positions.values()) {
    if (p.reports_to) (children.get(p.reports_to) ?? children.set(p.reports_to, []).get(p.reports_to)).push(p);
    const t = targetParent(p);
    if (t) (targetChildren.get(t) ?? targetChildren.set(t, []).get(t)).push(p);
  }
  // A unit's members: today's reports of an interim head, otherwise the
  // non-interim positions whose target line is the head.
  const derivedMembers = (u) => {
    const head = positions.get(u.head);
    const from = u.interim ? children.get(u.head) : targetChildren.get(u.head);
    return list(from).filter((p) => (u.interim ? true : !p.interim) && p.id !== head?.id).map((p) => p.id);
  };
  const activeUnits = units.filter((u) => u.status === 'active');
  const unitOfMember = new Map();
  for (const u of activeUnits) for (const id of list(u.members)) if (positions.get(id)?.status === 'active') unitOfMember.set(id, u);
  return { positions, units, activeUnits, children, targetChildren, targetParent, derivedMembers, unitOfMember };
}

// ---------------------------------------------------------------- checks

// ctx: {
//   specs: Map slug -> agent.md text (every tracked agents/<slug>/agent.md),
//   reviewTeams: parsed review-teams.yml,
//   osRoleLabels: string[], leadStatuses: string[], projectStages: string[],
//   today: "YYYY-MM-DD",
//   readme: agents/README.md text, or null to skip the drift check,
// }
export function checkChart(chart, ctx) {
  const problems = [];
  const p = (code, msg) => problems.push(`${code}: ${msg}`);
  if (!chart || typeof chart !== 'object') { p('schema', 'the chart is empty'); return problems; }
  const m = model(chart);
  const { positions, units, activeUnits, children, targetChildren, targetParent, derivedMembers, unitOfMember } = m;
  const rt = ctx.reviewTeams ?? {};
  const noKey = new Set(list(rt.no_key_roles));
  const isActive = (id) => positions.get(id)?.status === 'active';

  if (typeof chart.legal_entity !== 'string' || chart.legal_entity.trim() === '') p('legal-entity', 'legal_entity is missing (it is "undetermined" until the founder decides)');

  // Schema.
  const seen = new Set();
  for (const pos of list(chart.positions)) {
    const w = `position ${pos.id ?? JSON.stringify(pos)}`;
    if (typeof pos.id !== 'string' || !pos.id) { p('schema', `${w}: no id`); continue; }
    if (seen.has(pos.id)) p('schema', `${w}: duplicate id`);
    seen.add(pos.id);
    if (typeof pos.title !== 'string' || !pos.title) p('schema', `${w}: no title`);
    if (!Number.isInteger(pos.layer) || pos.layer < 0 || pos.layer > MAX_DEPTH) p('schema', `${w}: layer must be an integer 0 to ${MAX_DEPTH}`);
    if (!KINDS.includes(pos.kind)) p('schema', `${w}: kind must be one of ${KINDS.join(', ')}`);
    if (!HOLDERS.includes(pos.holder)) p('schema', `${w}: holder must be agent or human`);
    if (!STATUSES.includes(pos.status)) p('schema', `${w}: status must be active or planned`);
    if (pos.holder === 'human' && pos.occupant) p('schema', `${w}: a human position has no agent occupant`);
    if (pos.holder === 'agent' && pos.status === 'active' && !pos.occupant) p('schema', `${w}: an active agent position needs an occupant`);
    if (pos.status === 'planned' && pos.occupant) p('schema', `${w}: a planned position holds nothing (use target_occupant)`);
    if (pos.status !== 'planned' && pos.target_occupant) p('schema', `${w}: target_occupant is for planned positions`);
    if (pos.interim && pos.status !== 'active') p('schema', `${w}: an interim position is active`);
    if (pos.target_reports_to && (pos.status !== 'active' || pos.interim)) p('schema', `${w}: target_reports_to is for active, non-interim positions`);
  }
  const unitIds = new Set();
  for (const u of units) {
    const w = `unit ${u.id ?? JSON.stringify(u)}`;
    if (typeof u.id !== 'string' || !u.id) { p('schema', `${w}: no id`); continue; }
    if (unitIds.has(u.id)) p('schema', `${w}: duplicate id`);
    unitIds.add(u.id);
    if (typeof u.name !== 'string' || !u.name) p('schema', `${w}: no name`);
    if (!positions.has(u.head)) p('schema', `${w}: head ${u.head} is not a position`);
    if (!STATUSES.includes(u.status)) p('schema', `${w}: status must be active or planned`);
    if (u.key != null && u.key !== 1) p('schema', `${w}: key is 1 or absent (key 2 is the apex's)`);
    for (const id of list(u.members)) if (!positions.has(id)) p('schema', `${w}: member ${id} is not a position`);
    for (const s of list(u.serves)) if (!['nirmaan', 'ip-nirmaan'].includes(s)) p('schema', `${w}: serves ${s} is not an organisation`);
  }
  // Root.
  const roots = [...positions.values()].filter((x) => !x.reports_to);
  if (roots.length !== 1) p('root', `${roots.length} positions have no reports_to; the founder is the only root (${roots.map((r) => r.id).join(', ')})`);
  for (const r of roots) if (r.id !== 'founder' || r.holder !== 'human' || r.layer !== 0) p('root', `root ${r.id} must be the founder: id founder, holder human, layer 0`);

  // Reporting lines.
  for (const pos of positions.values()) {
    if (pos.reports_to && !positions.has(pos.reports_to)) p('reports-to', `${pos.id}: reports_to ${pos.reports_to} is not a position`);
    else if (pos.reports_to && pos.status === 'active' && !isActive(pos.reports_to)) p('reports-to', `${pos.id}: an active position reports to planned ${pos.reports_to} (record today's line; the target goes in target_reports_to)`);
    if (pos.target_reports_to) {
      const t = positions.get(pos.target_reports_to);
      if (!t) p('reports-to', `${pos.id}: target_reports_to ${pos.target_reports_to} is not a position`);
      else if (t.interim) p('reports-to', `${pos.id}: target_reports_to ${t.id} is interim`);
    }
  }

  // Cycles, depth and layers, in today's chart and in the target chart.
  const graphs = [
    ['today', (x) => x.reports_to, () => true],
    ['target', targetParent, (x) => !x.interim],
  ];
  for (const [name, parentOf, inGraph] of graphs) {
    for (const start of positions.values()) {
      if (!inGraph(start)) continue;
      const path = [start.id];
      let cur = start, looped = false;
      while (parentOf(cur) && positions.has(parentOf(cur))) {
        const next = positions.get(parentOf(cur));
        if (path.includes(next.id)) { looped = true; break; }
        path.push(next.id);
        cur = next;
      }
      if (looped) { p('cycle', `${name}: ${start.id} reports in a loop (${path.join(' > ')})`); continue; }
      if (path.length - 1 > MAX_DEPTH) p('depth', `${name}: ${start.id} is ${path.length - 1} layers below ${cur.id} (at most ${MAX_DEPTH})`);
      const parent = positions.get(parentOf(start));
      if (parent && Number.isInteger(parent.layer) && Number.isInteger(start.layer) && !(start.layer > parent.layer)) p('layer', `${name}: ${start.id} (layer ${start.layer}) is not below ${parent.id} (layer ${parent.layer})`);
    }
  }

  // Staff and ICs have no reports.
  for (const [mgr, kids] of [...children, ...targetChildren]) {
    const pos = positions.get(mgr);
    if (pos && pos.kind !== 'manager' && kids.length) p('no-reports', `${mgr} is ${pos.kind} and has reports (${[...new Set(kids.map((k) => k.id))].join(', ')})`);
  }

  // Exceptions.
  const exceptions = list(chart.exceptions);
  const excused = (id, rule) => exceptions.some((e) => e.position === id && e.rule === rule);
  const usedExceptions = new Set();
  for (const e of exceptions) {
    const w = `exception ${e.position}/${e.rule}`;
    if (!positions.has(e.position)) p('exception', `${w}: no such position`);
    if (!['span', 'deputy'].includes(e.rule)) p('exception', `${w}: rule must be span or deputy`);
    if (typeof e.reason !== 'string' || !e.reason.trim()) p('exception', `${w}: needs a reason`);
    if (typeof e.review_by !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.review_by) || Number.isNaN(Date.parse(e.review_by))) p('exception', `${w}: review_by must be a date YYYY-MM-DD`);
    else if (ctx.today > e.review_by) p('exception-expired', `${w}: review_by ${e.review_by} has passed; renew it with a reason or fix the chart`);
  }

  // Spans.
  const spanCheck = (code, mgr, kids) => {
    const line = kids.filter((k) => k.kind !== 'staff').length;
    if (line >= SPAN_MIN && kids.length <= SPAN_MAX) return;
    const key = `${mgr.id}/span`;
    if (excused(mgr.id, 'span')) { usedExceptions.add(key); return; }
    p(code, `${mgr.id} has ${line} line report(s) and ${kids.length} in all (needs ${SPAN_MIN} to ${SPAN_MAX}, staff counting toward the maximum only), and no span exception`);
  };
  for (const pos of positions.values()) {
    if (pos.kind !== 'manager' || pos.holder === 'human') continue;
    if (pos.status === 'active') spanCheck('span', pos, list(children.get(pos.id)).filter((k) => k.status === 'active'));
    if (!pos.interim) spanCheck('target-span', pos, list(targetChildren.get(pos.id)).filter((k) => !k.interim));
  }

  // Specs and occupants.
  const specs = ctx.specs ?? new Map();
  const held = new Map();
  for (const pos of positions.values()) if (pos.occupant) held.set(pos.occupant, [...(held.get(pos.occupant) ?? []), pos.id]);
  const unplaced = new Map(list(chart.unplaced).map((u) => [u.slug, u]));
  for (const u of list(chart.unplaced)) {
    if (typeof u.reason !== 'string' || !u.reason.trim()) p('unplaced', `${u.slug}: an unplaced spec needs a reason (the founder decision it waits for)`);
    if (!specs.has(u.slug)) p('unplaced', `${u.slug}: has no agents/${u.slug}/agent.md`);
    if (held.has(u.slug)) p('unplaced', `${u.slug}: is unplaced but holds ${held.get(u.slug).join(', ')}`);
  }
  for (const slug of specs.keys()) {
    const ids = held.get(slug) ?? [];
    if (unplaced.has(slug)) continue;
    if (ids.length !== 1) p('spec-position', `agents/${slug}/agent.md holds ${ids.length} positions (${ids.join(', ') || 'none'}); it must hold exactly one`);
  }
  for (const pos of positions.values()) {
    if (pos.occupant && !specs.has(pos.occupant)) p('occupant-spec', `${pos.id}: occupant ${pos.occupant} has no agents/${pos.occupant}/agent.md`);
    if (pos.target_occupant) {
      if (!specs.has(pos.target_occupant)) p('occupant-spec', `${pos.id}: target_occupant ${pos.target_occupant} has no agents/${pos.target_occupant}/agent.md`);
      else if (!held.has(pos.target_occupant)) p('occupant-spec', `${pos.id}: target_occupant ${pos.target_occupant} holds no position today`);
    }
  }

  // Units.
  for (const u of units) {
    const head = positions.get(u.head);
    if (head && head.status !== u.status) p('unit-status', `unit ${u.id} is ${u.status} but its head ${head.id} is ${head.status}`);
    if (head && head.kind !== 'manager') p('unit-status', `unit ${u.id}: head ${head.id} is ${head.kind}, not a manager`);
    if (u.interim && u.status !== 'active') p('unit-status', `unit ${u.id}: an interim unit is active`);
    if (head && !sameSet(list(u.members), derivedMembers(u))) p('unit-members', `unit ${u.id}: members [${list(u.members).join(', ')}] differ from the positions under ${u.head} [${derivedMembers(u).join(', ')}]`);
    if (head?.kind === 'staff' && u.key === 1) p('staff-key', `unit ${u.id}: staff position ${head.id} heads a key-1 unit`);
  }
  for (const pos of positions.values()) {
    if (pos.kind === 'staff' && list(rt.teams).some((t) => t.lead === pos.occupant)) p('staff-key', `${pos.id} is staff and its occupant ${pos.occupant} leads a review team`);
  }

  // Planned units own nothing.
  const plannedUnits = new Set(units.filter((u) => u.status === 'planned').map((u) => u.id));
  const activeIds = new Set(activeUnits.map((u) => u.id));
  const teamRefs = [];
  for (const r of list(rt.rules)) teamRefs.push([`rule ${r.id}`, list(r.teams), r]);
  for (const n of list(rt.named_files)) teamRefs.push([`named file ${n.id}`, list(n.teams), n]);
  for (const c of list(rt.content_rules)) teamRefs.push([`content rule ${c.id}`, list(c.adds_teams), c]);
  if (rt.catch_all) teamRefs.push(['catch_all', [rt.catch_all.team], rt.catch_all]);
  for (const t of list(rt.teams)) if (plannedUnits.has(t.id)) p('planned-owns', `review team ${t.id} is a planned unit`);
  for (const [w, ids] of teamRefs) for (const id of ids) if (plannedUnits.has(id)) p('planned-owns', `${w} gives a path to planned unit ${id}`);
  for (const s of list(chart.stages)) for (const k of ['owner', 'client_voice']) if (plannedUnits.has(s[k])) p('planned-owns', `stage ${s.id}: ${k} ${s[k]} is a planned unit`);

  // Deputies.
  const deputyOf = new Map();
  for (const pos of positions.values()) {
    if (pos.kind !== 'manager' || pos.layer < 2 || pos.layer > 5) continue;
    const kids = pos.status === 'active' ? list(children.get(pos.id)) : list(targetChildren.get(pos.id)).filter((k) => !k.interim);
    if (!pos.deputy) {
      if (pos.status !== 'active') continue;
      if (excused(pos.id, 'deputy')) usedExceptions.add(`${pos.id}/deputy`);
      else p('deputy', `${pos.id} has no deputy and no deputy exception`);
      continue;
    }
    const d = positions.get(pos.deputy);
    if (!d) { p('deputy', `${pos.id}: deputy ${pos.deputy} is not a position`); continue; }
    if (!kids.some((k) => k.id === d.id)) p('deputy', `${pos.id}: deputy ${d.id} is not in its unit`);
    if (d.kind !== 'ic') p('deputy', `${pos.id}: deputy ${d.id} is ${d.kind}, not an ic`);
    if (pos.status === 'active' && d.status !== 'active') p('deputy', `${pos.id}: deputy ${d.id} is planned`);
    const slug = d.occupant ?? d.target_occupant;
    if (slug && noKey.has(slug)) p('deputy', `${pos.id}: deputy ${d.id} (${slug}) is a no-key role`);
    if (deputyOf.has(d.id)) p('deputy', `${d.id} deputises for both ${deputyOf.get(d.id)} and ${pos.id}`);
    deputyOf.set(d.id, pos.id);
  }
  for (const e of exceptions) {
    if (!isActive(e.position)) continue;
    if (!usedExceptions.has(`${e.position}/${e.rule}`)) p('exception-unused', `exception ${e.position}/${e.rule} excuses nothing; remove it`);
  }

  // Review teams equal the active key-1 units.
  const apex = [...positions.values()].find((x) => x.layer === 1 && x.kind === 'manager' && x.status === 'active');
  const keyUnits = activeUnits.filter((u) => u.key === 1);
  const teams = list(rt.teams);
  const key1Teams = teams.filter((t) => t.key === 1);
  const key2Teams = teams.filter((t) => t.key === 2);
  if (!sameSet(key1Teams.map((t) => t.id), keyUnits.map((u) => u.id))) p('teams', `key-1 teams [${key1Teams.map((t) => t.id).join(', ')}] differ from the active key-1 units [${keyUnits.map((u) => u.id).join(', ')}]`);
  for (const u of keyUnits) {
    const t = key1Teams.find((x) => x.id === u.id);
    if (!t) continue;
    const head = positions.get(u.head);
    if (t.name !== u.name) p('teams', `team ${t.id}: name "${t.name}" differs from unit name "${u.name}"`);
    if (t.lead !== head?.occupant) p('teams', `team ${t.id}: lead ${t.lead} is not the unit head's occupant ${head?.occupant}`);
    const members = list(u.members).filter(isActive).map((id) => positions.get(id).occupant);
    if (!sameSet(list(t.members), members)) p('teams', `team ${t.id}: members [${list(t.members).join(', ')}] differ from the unit's active members [${members.join(', ')}]`);
  }
  if (key2Teams.length !== 1) p('teams', `review-teams.yml has ${key2Teams.length} key-2 teams; key 2 is one team, the apex`);
  for (const t of key2Teams) {
    if (!apex || t.lead !== apex.occupant) p('teams', `key-2 team ${t.id}: lead ${t.lead} is not the apex's occupant ${apex?.occupant}`);
    if (list(t.members).length) p('teams', `key-2 team ${t.id} has members`);
  }

  // Checklist roles belong to the entry's units; paths resolve to active units.
  const rolesOf = (unitId) => {
    const u = activeUnits.find((x) => x.id === unitId);
    if (!u) return [];
    return [positions.get(u.head)?.occupant, ...list(u.members).filter(isActive).map((id) => positions.get(id).occupant)].filter(Boolean);
  };
  const allowance = new Map();
  for (const pos of positions.values()) if (pos.kind === 'staff' && pos.occupant) allowance.set(pos.occupant, new Set(list(pos.checklist_allowance)));
  for (const [w, ids, entry] of teamRefs) {
    // A planned unit is reported by planned-owns above.
    for (const id of ids) if (!activeIds.has(id) && !plannedUnits.has(id)) p('paths', `${w} names team ${id}, which is not an active unit`);
    const roles = new Set(ids.flatMap(rolesOf));
    for (const c of list(entry.checklists)) {
      if (roles.has(c)) continue;
      if (allowance.get(c)?.has(entry.id)) continue;
      p('checklist', `${w}: checklist role ${c} is not a head or member of [${ids.join(', ')}]${allowance.has(c) ? ' and has no allowance for it' : ''}`);
    }
  }

  // Stage map.
  const stageChecks = [['lead', ctx.leadStatuses ?? []], ['project', ctx.projectStages ?? []]];
  for (const [kind, want] of stageChecks) {
    const count = new Map();
    for (const s of list(chart.stages).filter((x) => x.kind === kind)) for (const st of list(s.statuses)) count.set(st, (count.get(st) ?? 0) + 1);
    for (const st of want) if ((count.get(st) ?? 0) !== 1) p('stages', `${kind} ${st} is listed ${count.get(st) ?? 0} times (exactly once)`);
    for (const st of count.keys()) if (!want.includes(st)) p('stages', `${kind} ${st} is not a ${kind} status in ${ENUMS_PATH}`);
  }
  for (const s of list(chart.stages)) {
    if (!['lead', 'project'].includes(s.kind)) p('stages', `stage ${s.id}: kind must be lead or project`);
    for (const k of ['owner', 'client_voice']) if (!activeIds.has(s[k]) && !plannedUnits.has(s[k])) p('stages', `stage ${s.id}: ${k} ${s[k]} is not an active unit`);
    for (const k of ['target_owner', 'target_client_voice']) if (s[k] != null && !unitIds.has(s[k])) p('stages', `stage ${s.id}: ${k} ${s[k]} is not a unit`);
  }

  // Titles.
  const labels = new Set(list(ctx.osRoleLabels).map((l) => l.toLowerCase()));
  for (const pos of positions.values()) {
    const t = String(pos.title ?? '');
    const bare = t.replace(/\s*\([^)]*\)/g, '').replace(/,.*$/, '').trim().toLowerCase();
    if (labels.has(bare) || labels.has(t.toLowerCase())) p('title', `${pos.id}: title "${t}" is an OS role label (a human role)`);
    if (/\bVP\b/.test(t) && pos.layer !== 3) p('title', `${pos.id}: "VP" is for layer 3 only`);
    if (/^Head of\b/.test(t) && pos.layer !== 4) p('title', `${pos.id}: "Head of" is for layer 4 only`);
    if (/^Lead\b/.test(t) && pos.layer !== 5) p('title', `${pos.id}: "Lead" is for layer 5 only`);
    if (/\bCTO\b|General Counsel|\bCLO\b|\bDPO\b/.test(t)) p('title', `${pos.id}: title "${t}" is not used for an agent position`);
    if (/\b(legal|counsel)\b/i.test(t) && pos.holder === 'agent' && !t.includes('agent; not a lawyer')) p('title', `${pos.id}: a legal title carries "agent; not a lawyer"`);
  }

  // Plannable.
  for (const pos of positions.values()) {
    if (pos.plannable === undefined) continue;
    if (typeof pos.plannable !== 'boolean') p('plannable', `${pos.id}: plannable must be true or false`);
    if (pos.kind === 'manager') p('plannable', `${pos.id}: managers never own tasks; plannable is for ic and staff positions`);
  }

  // Specs: reviewed_by targets and the membership sentence.
  for (const [slug, text] of specs) {
    for (const r of reviewedBy(text)) if (r !== 'human' && !specs.has(r)) p('reviewed-by', `agents/${slug}/agent.md: reviewed_by ${r} has no spec`);
    const said = memberSentence(text);
    if (said === null) continue;
    const posId = held.get(slug)?.[0];
    const u = posId ? unitOfMember.get(posId) : null;
    if (!u || u.name !== said) p('member-sentence', `agents/${slug}/agent.md says it is a member of ${said}; the chart puts it in ${u ? u.name : 'no active unit'}`);
  }

  // README drift.
  if (ctx.readme != null) {
    const want = teamTable(chart, rt);
    const got = readmeTable(ctx.readme);
    if (got === null) p('readme', `${README_PATH} has no generated team table between the org-chart markers`);
    else if (got !== want) p('readme', `${README_PATH}: the team table differs from the chart; run node .github/scripts/org-chart.mjs --write`);
  }
  return problems;
}

// ---------------------------------------------------------------- generated team table

const link = (slug, anchor = '') => `[\`${slug}\`](${slug}/agent.md${anchor})`;
const titled = (pos, anchor) => `${pos.title} (${link(pos.occupant, anchor)})`;

export function teamTable(chart, reviewTeams) {
  const { positions, activeUnits } = model(chart);
  const apex = [...positions.values()].find((x) => x.layer === 1 && x.kind === 'manager' && x.status === 'active');
  const exceptions = list(chart.exceptions);
  const rows = ['| Unit | Head (key 1) | Members | Deputy |', '|---|---|---|---|'];
  rows.push(`| Executive | ${apex ? titled(apex, '#key-2-review') : 'none'}: key 2 on every PR, never key 1 | none | none |`);
  const order = list(reviewTeams?.teams).map((t) => t.id);
  const units = activeUnits.filter((u) => u.key === 1).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  for (const u of units) {
    const head = positions.get(u.head);
    const members = list(u.members).map((id) => positions.get(id)).filter((x) => x?.status === 'active');
    const deputy = head?.deputy ? positions.get(head.deputy)?.occupant : null;
    const noDeputy = exceptions.some((e) => e.position === head?.id && e.rule === 'deputy') ? 'none (recorded exception)' : 'none';
    const name = u.interim ? `${u.name} (interim)` : u.name;
    rows.push(`| ${name} | ${head ? titled(head, '#key-1-review') : 'none'} | ${members.map((x) => titled(x, '')).join(', ') || 'none'} | ${deputy ? `\`${deputy}\`` : noDeputy} |`);
  }
  return rows.join('\n');
}

export function readmeTable(readme) {
  const a = readme.indexOf(TABLE_START), b = readme.indexOf(TABLE_END);
  if (a < 0 || b < a) return null;
  return readme.slice(a + TABLE_START.length, b).trim();
}

export function writeReadmeTable(readme, table) {
  const a = readme.indexOf(TABLE_START), b = readme.indexOf(TABLE_END);
  if (a < 0 || b < a) throw new Error(`${README_PATH} has no org-chart markers`);
  return `${readme.slice(0, a + TABLE_START.length)}\n${table}\n${readme.slice(b)}`;
}

// ---------------------------------------------------------------- CLI

export function repositoryContext(read, files) {
  const specs = new Map();
  for (const f of files) {
    const m = /^agents\/([^/]+)\/agent\.md$/.exec(f);
    if (m) specs.set(m[1], read(f));
  }
  const enums = read(ENUMS_PATH);
  return {
    specs,
    reviewTeams: parseYaml(read(MAP_PATH)),
    osRoleLabels: roleLabels(read(PERMISSIONS_PATH)),
    leadStatuses: constList(enums, 'LEAD_STATUSES'),
    projectStages: constList(enums, 'PROJECT_STAGES'),
    today: new Date().toISOString().slice(0, 10),
    readme: read(README_PATH),
  };
}

function main(argv) {
  let chart, ctx;
  const read = (path) => readFileSync(path, 'utf8');
  try {
    const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
    chart = parseYaml(read(CHART_PATH));
    ctx = repositoryContext(read, files);
    if (argv.includes('--write')) {
      writeFileSync(README_PATH, writeReadmeTable(ctx.readme, teamTable(chart, ctx.reviewTeams)));
      ctx.readme = read(README_PATH);
      console.log(`org-chart: wrote the team table in ${README_PATH}`);
    }
  } catch (e) {
    console.error(`org-chart: ${e.message}`);
    return 2;
  }
  const problems = checkChart(chart, ctx);
  const pos = list(chart.positions);
  console.log(`${pos.length} positions (${pos.filter((x) => x.status === 'active').length} active, ${pos.filter((x) => x.status === 'planned').length} planned), ${list(chart.units).length} units, ${ctx.specs.size} specs.`);
  if (problems.length) {
    console.error(`org-chart: ${problems.length} problem(s):`);
    for (const m of problems) console.error(`  - ${m}`);
    return 1;
  }
  console.log('org-chart: every check passed.');
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
