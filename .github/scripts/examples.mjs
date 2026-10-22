#!/usr/bin/env node
// Runs the worked examples under examples/<skill-id>/ (examples/README.md),
// for the Examples workflow (.github/workflows/examples.yml).
//
// Each example is one folder with its own lockfile:
//   - Node: package.json and package-lock.json. Runs `npm ci --ignore-scripts`
//     then `npm test --ignore-scripts` (the test script runs; install hooks
//     and pre- or post-scripts do not).
//   - Python: requirements.txt with every requirement pinned by hash. Runs
//     `python -m pip install --require-hashes --no-deps -r requirements.txt`
//     then `python -m pytest -q`.
// Every command runs with a clean environment (PATH, HOME, CI only: no
// token or secret) and a time budget per example.
//
// Usage (from the repository root):
//   node .github/scripts/examples.mjs --changed <base-ref>   examples changed since <base-ref>
//   node .github/scripts/examples.mjs --all                  every example
// It always prints one line per example (pass, fail or skipped) and exits 0
// when nothing failed, 1 when an example failed or is malformed, 2 on a usage
// or git error.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXAMPLES_DIR = 'examples';
export const BUDGET_MS = 10 * 60 * 1000;

// Example ids among repository paths: examples/<id>/... (not examples/README.md).
export function exampleIds(paths) {
  const ids = new Set();
  for (const p of paths) {
    const m = /^examples\/([^/]+)\/./.exec(p);
    if (m) ids.add(m[1]);
  }
  return [...ids].sort();
}

// The commands for one example, from the files in its folder (names relative
// to the folder) and the text of requirements.txt when present. Returns
// { kind, commands } or { problem }.
export function plan(files, requirements = null) {
  const has = (f) => files.includes(f);
  if (has('package.json')) {
    if (!has('package-lock.json')) return { problem: 'a Node example needs its own package-lock.json' };
    return { kind: 'node', commands: [['npm', 'ci', '--ignore-scripts'], ['npm', 'test', '--ignore-scripts']] };
  }
  if (has('requirements.txt')) {
    const reqs = String(requirements ?? '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    const joined = String(requirements ?? '').replace(/\\\n/g, ' ').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('--hash'));
    if (reqs.length === 0) return { problem: 'requirements.txt is empty' };
    if (joined.some((l) => !/--hash=sha256:[0-9a-f]{64}/.test(l))) return { problem: 'every requirement in requirements.txt is pinned with --hash=sha256:...' };
    return { kind: 'python', commands: [['python', '-m', 'pip', 'install', '--require-hashes', '--no-deps', '-r', 'requirements.txt'], ['python', '-m', 'pytest', '-q']] };
  }
  return { problem: 'no package.json or requirements.txt' };
}

// The environment examples run in: no tokens, no secrets.
export function cleanEnv(env = process.env) {
  return { PATH: env.PATH ?? '/usr/bin:/bin', HOME: env.HOME ?? '/tmp', CI: 'true' };
}

// Run one example folder. Returns { status: 'pass' | 'fail', detail }.
export function runExample(dir, files, { budgetMs = BUDGET_MS, env = cleanEnv() } = {}) {
  const req = files.includes('requirements.txt') ? readFileSync(join(dir, 'requirements.txt'), 'utf8') : null;
  const p = plan(files, req);
  if (p.problem) return { status: 'fail', detail: p.problem };
  const started = Date.now();
  for (const [cmd, ...args] of p.commands) {
    const left = budgetMs - (Date.now() - started);
    if (left <= 0) return { status: 'fail', detail: `over the time budget of ${budgetMs / 1000} s` };
    const r = spawnSync(cmd, args, { cwd: dir, env, encoding: 'utf8', timeout: left });
    if (r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGTERM') return { status: 'fail', detail: `\`${[cmd, ...args].join(' ')}\` went over the time budget` };
    if (r.status !== 0) return { status: 'fail', detail: `\`${[cmd, ...args].join(' ')}\` exited ${r.status ?? r.error?.code}\n${(r.stdout ?? '').slice(-2000)}${(r.stderr ?? '').slice(-2000)}` };
  }
  return { status: 'pass', detail: p.kind };
}

// Decide what runs: every example, or only the changed ones (the others are
// reported as skipped, so the job always reports).
export function select(all, changed, mode) {
  return all.map((id) => ({ id, run: mode === 'all' || changed.includes(id) }));
}

function git(args) { return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1e8 }); }

function main(argv) {
  const all = argv.includes('--all');
  const ci = argv.indexOf('--changed');
  const base = ci >= 0 ? argv[ci + 1] : null;
  if (all === (ci >= 0) || (ci >= 0 && !base)) { console.error('usage: examples.mjs --all | --changed <base-ref>'); return 2; }
  let tracked, changed = [];
  try {
    tracked = git(['ls-files', '-z', EXAMPLES_DIR]).split('\0').filter(Boolean);
    if (base) changed = exampleIds(git(['diff', '--name-only', `${base}...HEAD`, '--', EXAMPLES_DIR]).split('\n').filter(Boolean));
  } catch (e) {
    console.error(`examples: ${e.message}`);
    return 2;
  }
  const ids = exampleIds(tracked);
  // A changed example that was deleted is not run.
  const plan = select(ids, changed.filter((id) => ids.includes(id)), all ? 'all' : 'changed');
  let failed = 0;
  if (plan.length === 0) console.log('examples: no example exists yet; nothing to run.');
  for (const { id, run } of plan) {
    if (!run) { console.log(`examples: ${id}: skipped (unchanged)`); continue; }
    const dir = join(EXAMPLES_DIR, id);
    const files = tracked.filter((f) => f.startsWith(`${dir}/`)).map((f) => f.slice(dir.length + 1));
    const r = existsSync(dir) ? runExample(dir, files) : { status: 'fail', detail: 'folder missing' };
    console.log(`examples: ${id}: ${r.status}${r.status === 'fail' ? `: ${r.detail}` : ''}`);
    if (r.status === 'fail') failed++;
  }
  console.log(failed ? `examples: ${failed} failed.` : 'examples: every example that ran passed.');
  return failed ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
