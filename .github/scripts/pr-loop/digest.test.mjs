// Tests for digest.mjs (the needs-founder digest and the loop's health
// alerts), on fixture records and a fixture state directory.
// Run: node --test .github/scripts/pr-loop/digest.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alerts, digest, heartbeatName, openStops, renderDigest } from './digest.mjs';
import { writeHeartbeat } from './pr-loop.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OPS = JSON.parse(readFileSync(join(HERE, 'config.json'), 'utf8')).ops;
const R = 'nirmaansoftware/Nirmaan';
const NOW = Date.UTC(2026, 9, 20, 12, 0);
const ago = (h) => new Date(NOW - h * 3600 * 1000).toISOString();
const ev = (pr, h, event, extra = {}) => ({ time: ago(h), kind: 'loop', repo: R, pr, head: 'a'.repeat(40), event, ...extra });

test('the ops thresholds are in the loop config', () => {
  for (const k of ['needs_founder_digest_hours', 'founder_wait_escalate_days', 'alert_no_pass_minutes', 'alert_lock_held_minutes']) assert.ok(Number.isFinite(OPS[k]) && OPS[k] > 0, k);
});

test('digest: stopped PRs older than the digest age, and founder waits older than the escalation age', () => {
  const ops = { ...OPS, needs_founder_digest_hours: 48, founder_wait_escalate_days: 7 };
  const recs = [
    ev(1, 50, 'stopped', { class: 'merge-conflict', reason: 'conflict' }), // listed
    ev(2, 10, 'stopped', { class: 'needs-founder', reason: 'proxy' }), // too young
    ev(3, 8 * 24, 'stopped', { class: 'needs-founder', reason: 'spending' }), // listed and escalated
    ev(4, 100, 'stopped', { class: 'needs-founder' }), ev(4, 90, 'resumed'), // resumed: not listed
    ev(5, 9 * 24, 'stopped', { class: 'rate-limit' }), // old, but not a founder wait
  ];
  const d = digest(recs, { ops, now: NOW });
  assert.equal(d.open_stops, 4);
  assert.deepEqual(d.needs_founder.map((s) => s.pr), [5, 3, 1]);
  assert.deepEqual(d.founder_waits.map((s) => s.pr), [3]);
  assert.match(renderDigest(d), /Founder waits past the escalation age: 1\n- nirmaansoftware\/Nirmaan#3 \(aaaaaaa\), needs-founder/);
  assert.deepEqual(openStops([ev(6, 5, 'stopped'), ev(6, 4, 'merged')], NOW), []);
});

test('alerts: no pass within the set minutes, from the heartbeat or the newest record; a lock held too long', () => {
  const dir = mkdtempSync(join(tmpdir(), 'digest-'));
  const ops = { ...OPS, alert_no_pass_minutes: 10, alert_lock_held_minutes: 30 };
  try {
    // No heartbeat and no record: alert.
    assert.deepEqual(alerts({ stateDir: dir, repos: [R], ops, now: NOW }).map((a) => a.kind), ['no-pass']);
    // A heartbeat 5 minutes old: fine; 15 minutes old: alert.
    writeHeartbeat(dir, R, 'pass', new Date(NOW - 5 * 60000));
    assert.deepEqual(alerts({ stateDir: dir, repos: [R], ops, now: NOW }), []);
    writeHeartbeat(dir, R, 'pass', new Date(NOW - 15 * 60000));
    assert.match(alerts({ stateDir: dir, repos: [R], ops, now: NOW })[0].text, /no loop pass for 15 min/);
    // A model call recorded 2 minutes ago during a long step counts as alive.
    assert.deepEqual(alerts({ stateDir: dir, repos: [R], ops, now: NOW, records: [{ time: new Date(NOW - 2 * 60000).toISOString(), repo: R, kind: 'loop' }] }), []);
    writeHeartbeat(dir, R, 'pass', new Date(NOW));
    // A lock with an owner started 40 minutes ago, one 5 minutes ago, and an
    // ownerless folder last changed 31 minutes ago.
    for (const [name, min] of [['review.lock', 40], ['model-slot-1.lock', 5]]) {
      mkdirSync(join(dir, name));
      writeFileSync(join(dir, name, 'owner.json'), JSON.stringify({ repo: R, pr: 7, pid: 1, started: new Date(NOW - min * 60000).toISOString() }));
    }
    mkdirSync(join(dir, 'review-x.lock'));
    utimesSync(join(dir, 'review-x.lock'), (NOW - 31 * 60000) / 1000, (NOW - 31 * 60000) / 1000);
    const a = alerts({ stateDir: dir, repos: [R], ops, now: NOW });
    assert.deepEqual(a.map((x) => x.kind), ['lock-held', 'lock-held']);
    assert.match(a[0].text, /review-x\.lock held for 31 min/);
    assert.match(a[1].text, /review\.lock held by nirmaansoftware\/Nirmaan#7 \(pid 1\) for 40 min/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the heartbeat file name is per repository', () => {
  assert.equal(heartbeatName(R), 'heartbeat-nirmaansoftware_Nirmaan.json');
});
