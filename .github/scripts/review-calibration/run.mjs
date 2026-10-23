#!/usr/bin/env node
// Review calibration runner: replays a blinded corpus of planted-defect seeds
// and clean controls through the production review (runReview from
// ../pr-review/review.mjs, its prompts, checklists and reviewer arguments,
// imported read-only) and scores each key holder per checklist. Decision:
// R6 of docs/operations/2026-10-18-review-loop-decisions.md.
//
// What it guarantees:
//   - Nothing is posted. The review runs with post 'none' against a fake
//     GitHub client whose every write throws, so a slip fails the run.
//   - No GitHub token. GH_TOKEN, GITHUB_TOKEN and the review App variables are
//     removed from this process's environment before anything runs, and the
//     reviewers get the production allowlist environment (claude.mjs).
//   - Nothing is written under the repository. The corpus and the results
//     must be outside it (the run refuses otherwise); the sandbox repository,
//     worktrees and call log live in a temporary folder that is removed after
//     the run (the call log is copied into the results first).
//   - Seeds stay blind. A seed whose title, body, commit message or branch
//     names a seed, a calibration, a planted defect or its own id is refused.
//   - One review at a time with the loop. Each seed's review takes the
//     production review lock (~/.nirmaan/pr-review/review.lock), waiting while
//     the loop holds it.
//
// Modes: production (key 1 per owning team, then key 2, then the Founder
// Proxy, as on a real PR), key1-alone (key 2 and the proxy answered by a stub
// pass, so only key 1 is called and scored), key2-alone (key 1 answered by a
// stub pass, so key 2 runs on every seed) and proxy-alone (key 1 and key 2
// stubbed; the proxy runs on founder-class seeds). Stubbed keys are never
// scored. --key1-mode overrides `key1_mode` in pr-review/config.json for the
// run (the A/B of the composite key 1 against per-team key 1, gate R-G2).
//
// Corpus: <corpus>/seeds/*.json, one seed or control per file:
//   { "id": "s01", "kind": "seed" | "control", "checklist": "key1-base",
//     "title": "...", "body": "...", "commit_message": "...", "branch": "docs/x",
//     "changes": [ { "path": "a/b.md", "content": "..." }
//                | { "path": "a/b.md", "replace": ["old text", "new text"] }
//                | { "path": "a/b.md", "delete": true } ],
//     "expect": { "verdict": "fail" | "needs-founder", "file": "a/b.md",
//                 "line": 12, "window": 3, "terms": ["unsupported"] } }
// A control has no "expect" and may name "checklists": [...] it guards.
//
// CI is reported green for every required job, because the seeds are not run
// through CI; seeds target checklist items, not test failures.
//
// Usage: node .github/scripts/review-calibration/run.mjs [--corpus <dir>]
//   [--results <dir>] [--mode production|key1-alone|key2-alone|proxy-alone]
//   [--key1-mode per-team|composite] [--runs <n>]
//   [--only <id,id>] [--base <ref>] [--lock-dir <dir>] [--claude <bin>]
//   [--lock-wait-minutes <n>]
// Exit: 0 ran (whatever the scores), 2 setup error or refusal.

import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaults, runReview } from '../pr-review/review.mjs';
import { acquireLock, NEEDS_FOUNDER } from '../pr-review/lib.mjs';
import { APP_ENV } from '../pr-review/github.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const MODES = ['production', 'key1-alone', 'key2-alone', 'proxy-alone'];
export const KEY1_MODES = ['per-team', 'composite'];
export const STUB_MODEL = 'calibration-stub';
export const TOKEN_ENV = ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN', ...Object.values(APP_ENV)];
const MARKER = /\bseeds?\b|calibrat|planted|\bdefects?\b/i;
const DEFAULT_ROOT = join(homedir(), 'Nirmaan-internal', 'review-calibration');

function git(cwd, args, opts = {}) {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

// Drops every GitHub token and review App variable from `env` (in place).
export function stripTokens(env = process.env) {
  for (const k of TOKEN_ENV) delete env[k];
  return env;
}

// The real path of `p`, also for a folder that does not exist yet: its
// nearest existing ancestor resolved, plus the rest (so a symlinked /tmp or
// /var still compares equal).
function real(p) {
  let head = resolve(p);
  const rest = [];
  for (;;) {
    try { return join(realpathSync(head), ...rest); } catch { /* not there yet */ }
    const up = dirname(head);
    if (up === head) return resolve(p);
    rest.unshift(head.slice(up.length).replace(/^[/\\]/, ''));
    head = up;
  }
}
export function isInside(child, parent) {
  const rel = relative(real(parent), real(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

// Reads and checks the corpus. Throws with every problem found.
export function loadCorpus(dir, { only = null } = {}) {
  const seedsDir = join(dir, 'seeds');
  if (!existsSync(seedsDir)) throw new Error(`no seeds folder at ${seedsDir}`);
  const problems = [];
  const seeds = [];
  for (const f of readdirSync(seedsDir).filter((n) => n.endsWith('.json')).sort()) {
    let s;
    try { s = JSON.parse(readFileSync(join(seedsDir, f), 'utf8')); } catch (e) { problems.push(`${f}: not JSON (${e.message})`); continue; }
    const where = `${f} (${s.id ?? 'no id'})`;
    if (typeof s.id !== 'string' || !s.id) problems.push(`${where}: id missing`);
    if (!['seed', 'control'].includes(s.kind)) problems.push(`${where}: kind must be "seed" or "control"`);
    if (typeof s.title !== 'string' || !s.title.trim()) problems.push(`${where}: title missing`);
    if (!Array.isArray(s.changes) || !s.changes.length) problems.push(`${where}: changes missing`);
    for (const [i, c] of (s.changes ?? []).entries()) {
      if (!c || typeof c.path !== 'string' || !c.path || c.path.startsWith('/') || c.path.split('/').includes('..')) problems.push(`${where}: change ${i + 1} needs a repository-relative path`);
      else if (!('content' in c) && !Array.isArray(c.replace) && c.delete !== true) problems.push(`${where}: change ${i + 1} needs content, replace or delete`);
    }
    if (s.kind === 'seed') {
      const e = s.expect;
      if (!e || ![`fail`, NEEDS_FOUNDER].includes(e.verdict ?? 'fail')) problems.push(`${where}: a seed needs expect.verdict "fail" or "${NEEDS_FOUNDER}"`);
      if (typeof s.checklist !== 'string' || !s.checklist) problems.push(`${where}: a seed names the checklist it tests`);
    } else if (s.expect) problems.push(`${where}: a control has no expect`);
    // Blind: nothing the reviewer reads as PR text may give the seed away.
    for (const field of ['title', 'body', 'commit_message', 'branch']) {
      const t = s[field];
      if (typeof t !== 'string') continue;
      if (MARKER.test(t)) problems.push(`${where}: ${field} gives the seed away (${MARKER.exec(t)[0]})`);
      if (s.id && t.toLowerCase().includes(String(s.id).toLowerCase())) problems.push(`${where}: ${field} contains the seed id`);
    }
    seeds.push(s);
  }
  const ids = seeds.map((s) => s.id);
  for (const id of new Set(ids)) if (ids.filter((x) => x === id).length > 1) problems.push(`duplicate id ${id}`);
  if (problems.length) throw new Error(`corpus refused:\n  ${problems.join('\n  ')}`);
  const picked = only ? seeds.filter((s) => only.includes(s.id)) : seeds;
  if (only) for (const id of only) if (!ids.includes(id)) throw new Error(`--only names ${id}, which is not in the corpus`);
  if (!picked.length) throw new Error('the corpus has no seeds to run');
  return picked;
}

// A fake GitHub for one seed: reads only; every write throws.
export function fakeGithub({ pr, seed, headSha, config }) {
  const never = (what) => async () => { throw new Error(`calibration never posts (${what} was called)`); };
  return {
    async getPull() {
      return { number: pr, state: 'open', draft: false, title: seed.title, body: seed.body ?? '', author: config.allowed_authors[0], labels: [], headSha, headRef: seed.branch ?? `change/${pr}`, headRepo: config.repo, baseRef: config.base_branch, baseRepo: config.repo };
    },
    async listCheckRuns() {
      return config.required_ci.map((name, i) => ({ id: i + 1, name, status: 'completed', conclusion: 'success', url: `https://ci.invalid/${name}`, startedAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-01T00:05:00Z', app: 'github-actions' }));
    },
    async listComments() { return []; },
    async listReviews() { return []; },
    createComment: never('createComment'),
    createCheckRun: never('createCheckRun'),
    createStatus: never('createStatus'),
    updatePullBody: never('updatePullBody'),
  };
}

// The stub `claude`: a pass for the stub model, the real binary for anything
// else (same arguments, same stdin, same allowlist environment).
const SHIM = `#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const cfg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'shim.json'), 'utf8'));
const argv = process.argv.slice(2);
const model = argv[argv.indexOf('--model') + 1];
if (model !== cfg.stubModel) {
  const child = spawn(cfg.realBin, argv, { stdio: 'inherit' });
  child.on('error', (e) => { process.stdout.write(JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'shim: ' + e.message })); process.exit(1); });
  child.on('exit', (code) => process.exit(code ?? 1));
} else {
  let stdin = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { stdin += d; });
  process.stdin.on('end', () => {
    const sha = /Head SHA: ([0-9a-f]{40})/.exec(stdin)?.[1] ?? '';
    const verdict = { verdict: 'pass', sha, findings: [], checks_run: ['read the diff'], not_run: [], summary: 'No blocking finding.' };
    process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify(verdict), modelUsage: { [cfg.stubModel]: {} } }));
  });
}
`;

export function modelsFor(mode, models) {
  if (!MODES.includes(mode)) throw new Error(`mode must be one of ${MODES.join(', ')}`);
  if (mode === 'key1-alone') return { ...models, key2: STUB_MODEL, proxy: STUB_MODEL };
  if (mode === 'key2-alone') return { ...models, key1: STUB_MODEL };
  if (mode === 'proxy-alone') return { ...models, key1: STUB_MODEL, key2: STUB_MODEL };
  return { ...models };
}

// Scores one key holder's result on one seed or control.
export function scoreResult(seed, r) {
  const row = { outcome: null, citation: null };
  if (!r || r.status === undefined) return { ...row, outcome: 'not-run' };
  if (r.status === 'deferred') {
    const reason = String(r.reason ?? '');
    return { ...row, outcome: 'deferral', citation: /does not exist/.test(reason) ? 'invalid' : null, reason };
  }
  row.citation = 'valid';
  const flagged = r.status === 'fail' || r.status === NEEDS_FOUNDER;
  if (seed.kind === 'control') return { ...row, outcome: flagged ? 'false-fail' : 'clean' };
  if (!flagged) return { ...row, outcome: 'miss' };
  const e = seed.expect;
  if ((e.verdict ?? 'fail') === NEEDS_FOUNDER && r.status !== NEEDS_FOUNDER) return { ...row, outcome: 'wrong-reason' };
  const terms = (e.terms ?? []).map((t) => String(t).toLowerCase());
  const hasTerms = (text) => !terms.length || terms.some((t) => String(text).toLowerCase().includes(t));
  const window = Number.isInteger(e.window) ? e.window : 3;
  const findings = r.verdict?.findings ?? [];
  const blocking = (f) => r.status === NEEDS_FOUNDER || f.severity === 'blocker' || f.severity === 'critical';
  const near = (f) => (!e.file || f.file === e.file) && (!Number.isInteger(e.line) || Math.abs(f.line - e.line) <= window);
  let hit = findings.some((f) => blocking(f) && near(f) && hasTerms(f.text));
  if (!hit && r.status === NEEDS_FOUNDER) {
    hit = (r.verdict?.founder_reasons ?? []).some((s) => (!e.file || String(s).includes(e.file)) && hasTerms(s));
  }
  return { ...row, outcome: hit ? 'catch' : 'wrong-reason' };
}

// The key holders a run measured: [{holder, result}]. Stubbed keys are left out.
export function measured(mode, review) {
  const out = [];
  if (mode === 'production' || mode === 'key1-alone') for (const r of review.key1 ?? []) out.push({ holder: `key1:${r.team}`, result: r });
  if (mode === 'key1-alone') return out;
  if (mode !== 'proxy-alone' && review.key2) out.push({ holder: 'key2', result: review.key2 });
  if (review.proxy) out.push({ holder: 'proxy', result: review.proxy });
  return out;
}

const COUNTS = ['catch', 'wrong-reason', 'miss', 'false-fail', 'clean', 'deferral'];
export function summarize(rows) {
  const groups = new Map();
  const add = (checklist, holder, row) => {
    const k = `${checklist}\u0000${holder}`;
    if (!groups.has(k)) groups.set(k, { checklist, holder, runs: 0, ...Object.fromEntries(COUNTS.map((c) => [c, 0])), citation_valid: 0, citation_invalid: 0 });
    const g = groups.get(k);
    g.runs++;
    if (COUNTS.includes(row.outcome)) g[row.outcome]++;
    if (row.citation === 'valid') g.citation_valid++;
    if (row.citation === 'invalid') g.citation_invalid++;
  };
  for (const row of rows) if (row.outcome !== 'not-run') add(row.checklist, row.holder, row);
  // The pipeline as a whole, per seed run: caught when any measured key caught it.
  const runs = new Map();
  for (const row of rows) {
    const k = `${row.id}\u0000${row.run}`;
    if (!runs.has(k)) runs.set(k, []);
    runs.get(k).push(row);
  }
  for (const list of runs.values()) {
    const scored = list.filter((r) => r.outcome !== 'not-run');
    if (!scored.length) continue;
    const pick = (o) => scored.some((r) => r.outcome === o);
    const outcome = pick('catch') ? 'catch' : pick('false-fail') ? 'false-fail' : pick('wrong-reason') ? 'wrong-reason' : pick('deferral') ? 'deferral' : list[0].kind === 'control' ? 'clean' : 'miss';
    add(list[0].checklist, 'any key', { outcome, citation: null });
  }
  return [...groups.values()].sort((a, b) => a.checklist.localeCompare(b.checklist) || a.holder.localeCompare(b.holder));
}

export function formatSummary(groups) {
  const head = ['checklist', 'holder', 'runs', 'catch', 'wrong reason', 'miss', 'false fail', 'clean', 'deferral', 'citation valid'];
  const lines = groups.map((g) => [g.checklist, g.holder, g.runs, g.catch, g['wrong-reason'], g.miss, g['false-fail'], g.clean, g.deferral, `${g.citation_valid}/${g.citation_valid + g.citation_invalid}`].map(String));
  const widths = head.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
  const fmt = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
  return [fmt(head), fmt(widths.map((w) => '-'.repeat(w))), ...lines.map(fmt)].join('\n');
}

function applyChanges(work, changes) {
  for (const c of changes) {
    const file = join(work, c.path);
    if (c.delete) { rmSync(file, { force: true }); continue; }
    mkdirSync(dirname(file), { recursive: true });
    if ('content' in c) { writeFileSync(file, String(c.content)); continue; }
    const [from, to] = c.replace;
    const text = readFileSync(file, 'utf8');
    if (!text.includes(from)) throw new Error(`replace: "${String(from).slice(0, 60)}" is not in ${c.path} at the base`);
    writeFileSync(file, text.replace(from, to));
  }
}

async function withProductionLock(lockDir, owner, { waitMs, sleep, out }, fn) {
  const until = Date.now() + waitMs;
  for (;;) {
    const lock = acquireLock(lockDir, owner);
    if (lock.ok) { try { return await fn(); } finally { lock.release(); } }
    if (Date.now() > until) throw new Error(`the review lock in ${lockDir} stayed busy (${lock.holder ? `${lock.holder.repo} #${lock.holder.pr}` : 'unknown holder'})`);
    out(`calibration: the review lock is busy (${lock.holder ? `${lock.holder.repo} #${lock.holder.pr}` : 'unknown holder'}); waiting.`);
    await sleep(20000);
  }
}

// Runs the corpus. o = { repoRoot, corpus, results, mode, runs, only, base,
// lockDir, claudeBin, models, timeoutMs, backoffMs, config, lockWaitMs,
// sleep, out, now }.
export async function runCalibration(o) {
  const out = o.out ?? ((s) => console.log(s));
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  stripTokens(process.env);
  for (const [name, dir] of [['corpus', o.corpus], ['results', o.results]]) {
    if (isInside(dir, o.repoRoot)) throw new Error(`the ${name} folder ${dir} is inside the repository; it must stay outside it`);
  }
  const seeds = loadCorpus(o.corpus, { only: o.only });
  const models = modelsFor(o.mode, o.models);
  if (o.key1Mode !== undefined && !KEY1_MODES.includes(o.key1Mode)) throw new Error(`--key1-mode must be one of ${KEY1_MODES.join(', ')}`);
  const config = o.key1Mode ? { ...o.config, key1_mode: o.key1Mode } : o.config;
  const key1Mode = config.key1_mode ?? 'per-team';
  const runs = Math.max(1, Number(o.runs) || 1);
  const baseSha = git(o.repoRoot, ['rev-parse', '--verify', `${o.base}^{commit}`]).trim();
  const stamp = (o.now ?? (() => new Date()))().toISOString().replace(/[:.]/g, '-');
  const resultsDir = join(o.results, `${stamp}-${o.mode}-${key1Mode}`);

  const tmp = mkdtempSync(join(tmpdir(), 'nirmaan-calibration-'));
  try {
    const stateDir = join(tmp, 'state');
    const origin = join(tmp, 'origin.git'), work = join(tmp, 'work');
    git(tmp, ['clone', '--quiet', '--bare', '--no-tags', o.repoRoot, origin]);
    git(origin, ['update-ref', `refs/heads/${o.config.base_branch}`, baseSha]);
    git(tmp, ['clone', '--quiet', '--no-checkout', origin, work]);
    git(work, ['config', 'user.name', o.config.company]);
    git(work, ['config', 'user.email', 'noreply@example.invalid']);
    let claudeBin = o.claudeBin;
    if (o.mode !== 'production') {
      const shimDir = join(tmp, 'shim');
      mkdirSync(shimDir);
      writeFileSync(join(shimDir, 'shim.json'), JSON.stringify({ stubModel: STUB_MODEL, realBin: o.claudeBin }));
      claudeBin = join(shimDir, 'claude.mjs');
      writeFileSync(claudeBin, SHIM);
      chmodSync(claudeBin, 0o755);
    }

    const rows = [];
    let pr = 0;
    for (let run = 1; run <= runs; run++) {
      for (const seed of seeds) {
        pr++;
        git(work, ['checkout', '--quiet', '--force', '--detach', baseSha]);
        git(work, ['clean', '-fdxq']);
        applyChanges(work, seed.changes);
        git(work, ['add', '-A']);
        git(work, ['commit', '--quiet', '--allow-empty', '-m', seed.commit_message ?? seed.title]);
        const headSha = git(work, ['rev-parse', 'HEAD']).trim();
        git(work, ['push', '--quiet', '--force', 'origin', `HEAD:refs/pull/${pr}/head`]);
        git(work, ['checkout', '--quiet', '--force', '--detach', baseSha]);
        out(`calibration: run ${run}/${runs}, ${seed.id} (${seed.kind}, ${seed.checklist ?? (seed.checklists ?? []).join(', ') ?? ''})...`);
        const review = await withProductionLock(o.lockDir, { repo: 'calibration', pr, by: 'review-calibration' }, { waitMs: o.lockWaitMs ?? 2 * 60 * 60 * 1000, sleep, out }, () => runReview({
          repoRoot: work, pr, config, github: fakeGithub({ pr, seed, headSha, config }), post: 'none',
          claudeBin, stateDir, models, timeoutMs: o.timeoutMs, backoffMs: o.backoffMs, sleep, fresh: true, heldLock: true, out: () => {},
        }));
        const checklist = seed.kind === 'seed' ? seed.checklist : (seed.checklists ?? ['control']).join('+');
        const holders = measured(o.mode, review);
        if (!holders.length) rows.push({ run, id: seed.id, kind: seed.kind, checklist, holder: 'none', outcome: 'not-run', exit: review.exit, note: review.waiting ?? review.ciFailed ?? review.deferred ?? review.reason ?? null });
        for (const { holder, result } of holders) {
          const s = scoreResult(seed, result);
          rows.push({ run, id: seed.id, kind: seed.kind, checklist, holder, status: result.status, ...s, findings: (result.verdict?.findings ?? []).map((f) => ({ file: f.file, line: f.line, severity: f.severity })) });
        }
      }
    }

    const groups = summarize(rows);
    mkdirSync(resultsDir, { recursive: true });
    writeFileSync(join(resultsDir, 'results.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
    const text = formatSummary(groups);
    writeFileSync(join(resultsDir, 'summary.json'), JSON.stringify({ mode: o.mode, key1_mode: key1Mode, runs, base: baseSha, seeds: seeds.map((s) => s.id), groups }, null, 2));
    writeFileSync(join(resultsDir, 'summary.txt'), `${text}\n`);
    if (existsSync(join(stateDir, 'calls.jsonl'))) cpSync(join(stateDir, 'calls.jsonl'), join(resultsDir, 'calls.jsonl'));
    out(`calibration: mode ${o.mode}, key 1 ${key1Mode}, base ${baseSha.slice(0, 7)}, ${seeds.length} seeds x ${runs} runs; nothing posted.`);
    out(text);
    out(`calibration: results in ${resultsDir}`);
    return { rows, groups, resultsDir, baseSha };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v; };
    if (a === '--corpus') o.corpus = resolve(val());
    else if (a === '--results') o.results = resolve(val());
    else if (a === '--mode') o.mode = val();
    else if (a === '--key1-mode') o.key1Mode = val();
    else if (a === '--runs') o.runs = Number(val());
    else if (a === '--only') o.only = val().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--base') o.base = val();
    else if (a === '--lock-dir') o.lockDir = resolve(val());
    else if (a === '--claude') o.claudeBin = val();
    else if (a === '--lock-wait-minutes') o.lockWaitMs = Number(val()) * 60 * 1000;
    else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

async function main(argv) {
  stripTokens(process.env);
  let args;
  try { args = parseArgs(argv); } catch (e) { console.error(`calibration: ${e.message}`); return 2; }
  const d = defaults();
  const repoRoot = resolve(HERE, '..', '..', '..');
  const o = {
    repoRoot,
    corpus: join(DEFAULT_ROOT, 'corpus'),
    results: join(DEFAULT_ROOT, 'results'),
    mode: 'production',
    runs: 1,
    only: null,
    base: 'origin/main',
    lockDir: d.stateDir,
    claudeBin: d.claudeBin,
    models: d.models,
    timeoutMs: d.timeoutMs,
    backoffMs: d.backoffMs,
    config: JSON.parse(readFileSync(join(HERE, '..', 'pr-review', 'config.json'), 'utf8')),
    ...args,
  };
  try { await runCalibration(o); return 0; } catch (e) { console.error(`calibration: ${e.message}`); return 2; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(`calibration: ${e.stack || e.message}`); process.exit(2); });
}
