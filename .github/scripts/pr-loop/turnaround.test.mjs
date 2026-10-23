// Tests for turnaround.mjs (the loop's turnaround report), on fixture records.
// Run: node --test .github/scripts/pr-loop/turnaround.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { founderWaits, readRecords, renderReport, turnaroundReport } from './turnaround.mjs';

const R = 'nirmaansoftware/Nirmaan';
const T = (min) => new Date(Date.UTC(2026, 9, 20, 0, 0) + min * 60000).toISOString();
const loop = (pr, min, event, extra = {}) => ({ time: T(min), kind: 'loop', repo: R, pr, head: 'h'.repeat(40), round: 0, event, ...extra });
const phase = (pr, min, green, extra = {}) => ({ time: T(min), kind: 'phase', repo: R, pr, head: 'h'.repeat(40), ci_green_at: T(green), outcome: 'auto-merge', ...extra });
const merged = (pr, min) => loop(pr, min + 1, 'merged', { merged: true, merged_at: T(min), merged_head: 'h'.repeat(40) });

const FIXTURE = [
  // #1: green at 0, merged at 30: 30 min, no founder wait.
  phase(1, 20, 0), loop(1, 20, 'auto-merge'), merged(1, 30),
  // #2: green at 0, a needs-founder stop at 10, resumed at 250, merged at 260:
  // 20 min of turnaround, 240 min of founder wait reported apart.
  phase(2, 10, 0), loop(2, 10, 'stopped', { class: 'needs-founder', reason: 'proxy' }), loop(2, 250, 'resumed'), phase(2, 255, 0), merged(2, 260),
  // #3: a merge-conflict stop (not founder wait) stays in the turnaround.
  phase(3, 5, 0), loop(3, 5, 'stopped', { class: 'merge-conflict' }), loop(3, 60, 'resumed'), phase(3, 65, 0), merged(3, 70),
  // #4: still waiting for the founder.
  loop(4, 0, 'stopped', { class: 'needs-founder' }),
  // Another repository, and a torn record.
  { ...merged(9, 5), repo: 'nirmaansoftware/ip-nirmaan' },
  { kind: 'loop', repo: R, pr: 5 },
];

test('turnaround runs from green CI on the merged head to the merge, with founder wait taken out and reported apart', () => {
  const r = turnaroundReport(FIXTURE, { repo: R, now: Date.parse(T(300)) });
  const by = Object.fromEntries(r.merged.map((m) => [m.pr, m]));
  assert.deepEqual(Object.keys(by).map(Number).sort(), [1, 2, 3]);
  assert.equal(by[1].turnaround_ms, 30 * 60000);
  assert.equal(by[1].founder_wait_ms, 0);
  assert.equal(by[2].turnaround_ms, 20 * 60000);
  assert.equal(by[2].founder_wait_ms, 240 * 60000);
  assert.equal(by[3].turnaround_ms, 70 * 60000, 'a merge-conflict wait is not founder wait');
  assert.equal(r.summary.founder_waits, 1);
  assert.equal(r.summary.turnaround_median_ms, 30 * 60000);
  assert.deepEqual(r.founder_waits_open.map((w) => w.pr), [4]);
  assert.equal(r.founder_waits_open[0].wait_ms, 300 * 60000);
});

test('stops are counted per head by class', () => {
  const r = turnaroundReport(FIXTURE, { repo: R });
  assert.deepEqual(r.summary.stops_by_class, { 'needs-founder': 2, 'merge-conflict': 1 });
  assert.deepEqual(r.stops_per_head.find((s) => s.pr === 3).classes, { 'merge-conflict': 1 });
  assert.match(renderReport(r), /Stops by class: needs-founder 2, merge-conflict 1/);
});

test('--since keeps merges from then on; a merged head without a green time is listed apart', () => {
  assert.deepEqual(turnaroundReport(FIXTURE, { repo: R, since: T(100) }).merged.map((m) => m.pr), [2]);
  const r = turnaroundReport([merged(7, 10)], {});
  assert.equal(r.merged.length, 0);
  assert.deepEqual(r.merged_without_green_time.map((m) => m.pr), [7]);
});

test('founder wait ends at a resume, merge or close; an open one has no end', () => {
  assert.deepEqual(founderWaits([loop(1, 0, 'stopped', { class: 'needs-founder' }), loop(1, 5, 'closed')]), [{ from: Date.parse(T(0)), to: Date.parse(T(5)) }]);
  assert.deepEqual(founderWaits([loop(1, 0, 'stopped', { class: 'rate-limit' }), loop(1, 5, 'resumed')]), []);
  assert.equal(founderWaits([loop(1, 0, 'stopped', { class: 'needs-founder' })])[0].to, null);
});

test('the CLI reads calls.jsonl, skips torn lines and writes only reports/turnaround.json in the state directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'turnaround-'));
  try {
    writeFileSync(join(dir, 'calls.jsonl'), `${FIXTURE.map((r) => JSON.stringify(r)).join('\n')}\n{"torn\n`);
    assert.equal(readRecords(dir).length, FIXTURE.length);
    const out = execFileSync(process.execPath, [fileURLToPath(new URL('./turnaround.mjs', import.meta.url)), '--state-dir', dir, '--repo', R], { encoding: 'utf8' });
    assert.match(out, /3 merged PR\(s\)/);
    const written = JSON.parse(readFileSync(join(dir, 'reports', 'turnaround.json'), 'utf8'));
    assert.equal(written.summary.merged, 3);
    assert.ok(!existsSync(join(dir, 'loop')), 'nothing else written');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
