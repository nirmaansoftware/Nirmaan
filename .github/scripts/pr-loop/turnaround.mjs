#!/usr/bin/env node
// Turnaround report for the review loop (docs/operations/pr-loop-runbook.md).
// Reads the loop's records (calls.jsonl in the state directory: the `loop`
// event lines and the per-phase `phase` lines) and reports, per merged PR,
// the time from required CI going green on the merged head to the merge,
// with founder wait taken out and reported apart, plus the stops per head by
// class. It reads only the local records and writes only to the state
// directory (reports/turnaround.json); nothing goes to GitHub.
//
// Founder wait: from a stop of class `needs-founder` to the next resume,
// merge or close of that PR.
//
// Run: node .github/scripts/pr-loop/turnaround.mjs [--state-dir <dir>] [--repo <owner/name>] [--since <ISO date>] [--no-write]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_STATE_DIR = join(homedir(), '.nirmaan', 'pr-review');

// Every JSON line of calls.jsonl; a line that does not parse is skipped.
export function readRecords(stateDir) {
  const file = join(stateDir, 'calls.jsonl');
  if (!existsSync(file)) return [];
  const out = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (r && typeof r === 'object') out.push(r); } catch { /* a torn or foreign line */ }
  }
  return out;
}

const ms = (t) => { const v = Date.parse(t ?? ''); return Number.isFinite(v) ? v : null; };
const ENDS_WAIT = new Set(['resumed', 'merged', 'closed']);

// The loop and phase records of each PR, oldest first, keyed "repo#pr".
export function byPr(records, { repo = null } = {}) {
  const map = new Map();
  for (const r of records) {
    if ((r.kind !== 'loop' && r.kind !== 'phase') || !r.repo || !Number.isInteger(r.pr) || ms(r.time) === null) continue;
    if (repo && r.repo !== repo) continue;
    const key = `${r.repo}#${r.pr}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  for (const list of map.values()) list.sort((a, b) => ms(a.time) - ms(b.time));
  return map;
}

// Founder-wait intervals of one PR's records: [{from, to}] in ms; `to` is
// null while the wait is still open.
export function founderWaits(recs) {
  const waits = [];
  let open = null;
  for (const r of recs) {
    if (r.kind !== 'loop') continue;
    if (r.event === 'stopped' && r.class === 'needs-founder' && open === null) open = ms(r.time);
    else if (open !== null && ENDS_WAIT.has(r.event)) { waits.push({ from: open, to: ms(r.time) }); open = null; }
  }
  if (open !== null) waits.push({ from: open, to: null });
  return waits;
}

const overlap = (w, from, to) => Math.max(0, Math.min(w.to ?? to, to) - Math.max(w.from, from));

function quantile(sorted, q) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
}

export function turnaroundReport(records, { repo = null, since = null, now = Date.now() } = {}) {
  const sinceMs = since ? ms(since) : null;
  const merged = [], stops = new Map(), openWaits = [], noGreen = [];
  for (const [key, recs] of byPr(records, { repo })) {
    const [prRepo, prNum] = [recs[0].repo, recs[0].pr];
    for (const r of recs) {
      if (r.kind !== 'loop' || r.event !== 'stopped') continue;
      const k = `${key}@${String(r.head ?? '').slice(0, 7)}`;
      if (!stops.has(k)) stops.set(k, { repo: prRepo, pr: prNum, head: r.head ?? null, classes: {} });
      const c = r.class ?? 'unknown';
      stops.get(k).classes[c] = (stops.get(k).classes[c] ?? 0) + 1;
    }
    const waits = founderWaits(recs);
    const open = waits.find((w) => w.to === null);
    if (open) openWaits.push({ repo: prRepo, pr: prNum, since: new Date(open.from).toISOString(), wait_ms: now - open.from });
    const m = [...recs].reverse().find((r) => r.kind === 'loop' && r.event === 'merged' && r.merged !== false);
    if (!m) continue;
    const head = m.merged_head ?? m.head;
    const end = ms(m.merged_at) ?? ms(m.time);
    if (sinceMs !== null && end < sinceMs) continue;
    const greens = recs.filter((r) => r.kind === 'phase' && r.head === head).map((r) => ms(r.ci_green_at)).filter((v) => v !== null);
    if (!greens.length) { noGreen.push({ repo: prRepo, pr: prNum, head }); continue; }
    const green = Math.min(...greens);
    const founder = waits.reduce((s, w) => s + overlap(w, green, end), 0);
    merged.push({ repo: prRepo, pr: prNum, head, ci_green_at: new Date(green).toISOString(), merged_at: new Date(end).toISOString(), turnaround_ms: Math.max(0, end - green - founder), founder_wait_ms: founder });
  }
  merged.sort((a, b) => ms(a.merged_at) - ms(b.merged_at));
  const t = merged.map((x) => x.turnaround_ms).sort((a, b) => a - b);
  const f = merged.map((x) => x.founder_wait_ms).filter((x) => x > 0).sort((a, b) => a - b);
  const byClass = {};
  for (const s of stops.values()) for (const [c, n] of Object.entries(s.classes)) byClass[c] = (byClass[c] ?? 0) + n;
  return {
    generated_at: new Date(now).toISOString(),
    filter: { repo, since },
    summary: {
      merged: merged.length,
      turnaround_median_ms: quantile(t, 0.5), turnaround_p90_ms: quantile(t, 0.9),
      founder_waits: f.length, founder_wait_median_ms: quantile(f, 0.5),
      stops_by_class: byClass, heads_with_stops: stops.size,
    },
    merged,
    stops_per_head: [...stops.values()],
    founder_waits_open: openWaits,
    merged_without_green_time: noGreen,
  };
}

export const fmt = (v) => {
  if (v === null || v === undefined) return 'n/a';
  const m = Math.round(v / 60000);
  return m < 120 ? `${m} min` : `${(m / 60).toFixed(1)} h`;
};

export function renderReport(r) {
  const s = r.summary;
  const lines = [
    `Turnaround (required CI green on the merged head to merge, founder wait taken out), ${s.merged} merged PR(s): median ${fmt(s.turnaround_median_ms)}, p90 ${fmt(s.turnaround_p90_ms)}.`,
    `Founder wait, reported apart: ${s.founder_waits} PR(s) waited, median ${fmt(s.founder_wait_median_ms)}; ${r.founder_waits_open.length} wait(s) still open.`,
    `Stops by class: ${Object.entries(s.stops_by_class).map(([c, n]) => `${c} ${n}`).join(', ') || 'none'} (${s.heads_with_stops} head(s)).`,
  ];
  for (const m of r.merged.slice(-20)) lines.push(`  ${m.repo}#${m.pr} ${String(m.head).slice(0, 7)}: ${fmt(m.turnaround_ms)}${m.founder_wait_ms ? ` (+ founder wait ${fmt(m.founder_wait_ms)})` : ''}`);
  return lines.join('\n');
}

function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const stateDir = arg('--state-dir') ?? DEFAULT_STATE_DIR;
  const report = turnaroundReport(readRecords(stateDir), { repo: arg('--repo'), since: arg('--since') });
  console.log(renderReport(report));
  if (!argv.includes('--no-write')) {
    mkdirSync(join(stateDir, 'reports'), { recursive: true });
    writeFileSync(join(stateDir, 'reports', 'turnaround.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
