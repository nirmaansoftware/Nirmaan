#!/usr/bin/env node
// The needs-founder digest and the loop's health alerts
// (docs/operations/pr-loop-runbook.md). Reads only local files in the state
// directory: calls.jsonl (the loop's records), the loop's heartbeat files and
// the lock folders. It writes nothing and posts nothing; with --notify it
// shows a desktop notification on this Mac for each alert.
//
// Digest: every PR whose last loop event is a stop (the loop labels it
// needs-founder) and that has waited longer than ops.needs_founder_digest_hours,
// and, among them, the founder waits (stop class needs-founder) older than
// ops.founder_wait_escalate_days.
// Alerts: no loop pass for ops.alert_no_pass_minutes (from the heartbeat the
// loop writes during every pass), or a lock held for over
// ops.alert_lock_held_minutes. The thresholds are in
// .github/scripts/pr-loop/config.json ("ops").
//
// Run: node .github/scripts/pr-loop/digest.mjs [--state-dir <dir>] [--alerts] [--notify]
// Exit code: 0, or 1 when --alerts found an alert.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { byPr, DEFAULT_STATE_DIR, fmt, readRecords } from './turnaround.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOUR = 3600 * 1000;

// The heartbeat file the loop writes during each pass.
export const heartbeatName = (repo) => `heartbeat-${repo.replace('/', '_')}.json`;

// PRs whose last loop event is a stop: [{repo, pr, head, class, reason, since, age_ms}].
export function openStops(records, now = Date.now()) {
  const out = [];
  for (const recs of byPr(records).values()) {
    const last = [...recs].reverse().find((r) => r.kind === 'loop');
    if (!last || last.event !== 'stopped') continue;
    const since = Date.parse(last.time);
    out.push({ repo: last.repo, pr: last.pr, head: last.head ?? null, class: last.class ?? 'unknown', reason: String(last.reason ?? ''), since: new Date(since).toISOString(), age_ms: now - since });
  }
  return out.sort((a, b) => b.age_ms - a.age_ms);
}

export function digest(records, { ops, now = Date.now() }) {
  const stops = openStops(records, now);
  const needsFounder = stops.filter((s) => s.age_ms > ops.needs_founder_digest_hours * HOUR);
  const founderWaits = needsFounder.filter((s) => s.class === 'needs-founder' && s.age_ms > ops.founder_wait_escalate_days * 24 * HOUR);
  return { generated_at: new Date(now).toISOString(), open_stops: stops.length, needs_founder: needsFounder, founder_waits: founderWaits };
}

export function renderDigest(d) {
  const line = (s) => `- ${s.repo}#${s.pr} (${String(s.head ?? '').slice(0, 7)}), ${s.class}, waiting ${fmt(s.age_ms)}: ${s.reason.replace(/\s+/g, ' ').slice(0, 200)}`;
  const lines = [`needs-founder digest (${d.generated_at}): ${d.open_stops} PR(s) stopped.`];
  lines.push('', `Waiting past the digest age: ${d.needs_founder.length}`, ...d.needs_founder.map(line));
  lines.push('', `Founder waits past the escalation age: ${d.founder_waits.length}`, ...d.founder_waits.map(line));
  return lines.join('\n');
}

// Health alerts: [{kind: 'no-pass' | 'lock-held', text}]. The loop is alive
// when its heartbeat, or its newest record in calls.jsonl (every model call
// writes one, so a long review step still counts), is recent enough.
export function alerts({ stateDir, repos, ops, records = [], now = Date.now() }) {
  const out = [];
  for (const repo of repos) {
    const file = join(stateDir, 'loop', heartbeatName(repo));
    let at = null;
    try { at = Date.parse(JSON.parse(readFileSync(file, 'utf8')).at); } catch { /* none yet */ }
    const lastRecord = Math.max(-Infinity, ...records.filter((r) => r.repo === repo).map((r) => Date.parse(r.time)).filter(Number.isFinite));
    if (Number.isFinite(lastRecord) && (!Number.isFinite(at) || lastRecord > at)) at = lastRecord;
    if (!Number.isFinite(at)) out.push({ kind: 'no-pass', text: `${repo}: no loop pass recorded (no heartbeat in ${join(stateDir, 'loop')})` });
    else if (now - at > ops.alert_no_pass_minutes * 60000) out.push({ kind: 'no-pass', text: `${repo}: no loop pass for ${fmt(now - at)} (last ${new Date(at).toISOString()})` });
  }
  let entries = [];
  try { entries = readdirSync(stateDir); } catch { /* no state dir */ }
  for (const name of entries.filter((n) => n.endsWith('.lock')).sort()) {
    const dir = join(stateDir, name);
    let started = null, holder = '';
    try { const o = JSON.parse(readFileSync(join(dir, 'owner.json'), 'utf8')); started = Date.parse(o.started); holder = ` by ${o.repo ?? '?'}#${o.pr ?? '?'} (pid ${o.pid ?? '?'})`; } catch { /* ownerless */ }
    if (!Number.isFinite(started)) { try { started = statSync(dir).mtimeMs; } catch { continue; } }
    if (now - started > ops.alert_lock_held_minutes * 60000) out.push({ kind: 'lock-held', text: `${name} held${holder} for ${fmt(now - started)}` });
  }
  return out;
}

function notify(text) {
  if (process.platform !== 'darwin') return;
  const s = text.replace(/[\r\n]+/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  try { execFileSync('osascript', ['-e', `display notification "${s}" with title "Nirmaan review loop"`], { stdio: 'ignore' }); } catch { /* best effort */ }
}

function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const stateDir = arg('--state-dir') ?? DEFAULT_STATE_DIR;
  const ops = JSON.parse(readFileSync(join(HERE, 'config.json'), 'utf8')).ops;
  const repo = JSON.parse(readFileSync(join(HERE, '..', 'pr-review', 'config.json'), 'utf8')).repo;
  const records = readRecords(stateDir);
  console.log(renderDigest(digest(records, { ops })));
  if (!argv.includes('--alerts')) return 0;
  const found = alerts({ stateDir, repos: [repo], ops, records });
  console.log('', `Alerts: ${found.length}`, ...found.map((a) => `- ${a.kind}: ${a.text}`));
  if (argv.includes('--notify')) for (const a of found) notify(a.text);
  return found.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url) && existsSync(join(HERE, 'config.json'))) process.exit(main(process.argv.slice(2)));
