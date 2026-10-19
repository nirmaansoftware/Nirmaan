// Tests for the review calibration runner, against the review script's fake
// `claude` (../pr-review/fixtures/fake-claude.mjs) and a throwaway repository.
// No model is called, nothing is posted and nothing touches the network.
// Run: node --test .github/scripts/review-calibration/run.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatSummary, isInside, loadCorpus, measured, modelsFor, runCalibration, scoreResult, STUB_MODEL, stripTokens, summarize } from './run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(readFileSync(join(HERE, '..', 'pr-review', 'config.json'), 'utf8'));

const MAP = `version: 1
teams:
  - id: executive
    name: Executive
    lead: orchestrator
    key: 2
    members: []
  - id: engineering
    name: Engineering
    lead: principal-architect
    key: 1
    members: []
catch_all:
  team: engineering
  allowlist: []
rules:
  - id: os
    globs: ["os/**"]
    teams: [engineering]
founder_classes:
  - id: A
    name: Control plane
    paths: [".github/**"]
content_rules: []
`;
const ROLES = ['orchestrator', 'principal-architect', 'founder-proxy'];

function sh(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function write(root, rel, text) { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); }

const SEED_A = { id: 'a1', kind: 'seed', checklist: 'key1-base', title: 'Tidy the app wording', body: 'Rewords line two.', commit_message: 'Tidy the app wording', branch: 'os/tidy',
  changes: [{ path: 'os/app.js', replace: ['line two', 'line two, now always correct'] }], expect: { verdict: 'fail', file: 'os/app.js', line: 2, window: 1 } };
const SEED_B = { id: 'b2', kind: 'seed', checklist: 'engineering', title: 'Add line four', body: 'Adds a line.', changes: [{ path: 'os/app.js', content: 'line one\nline two\nline three\nline four\n' }], expect: { verdict: 'fail', file: 'os/app.js', line: 4 } };
const CONTROL = { id: 'c3', kind: 'control', checklists: ['key1-base'], title: 'Fix a typo in the notes', body: 'Typo only.', changes: [{ path: 'os/notes.md', content: 'Notes, spelled right.\n' }] };

// A repository (the "repo root"), a corpus and results folder outside it, a
// lock folder, and the fake claude with `responses`.
function setup({ seeds = [SEED_A, SEED_B, CONTROL], responses = [{ type: 'verdict', verdict: 'pass' }] } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'calibration-test-'));
  const repo = join(tmp, 'repo');
  sh(tmp, 'init', '-q', '-b', 'main', repo);
  sh(repo, 'config', 'user.email', 't@example.com'); sh(repo, 'config', 'user.name', 'T');
  write(repo, '.github/review-teams.yml', MAP);
  for (const r of ROLES) write(repo, `agents/${r}/agent.md`, `# ${r}\nSPEC-MARKER-${r}\n`);
  for (const c of ['key1-base', 'key2', 'engineering']) write(repo, `${CONFIG.checklist_dir}/${c}.md`, `# ${c}\nCHECKLIST-MARKER-${c}\n`);
  write(repo, 'os/app.js', 'line one\nline two\nline three\n');
  write(repo, 'os/notes.md', 'Notes, speled wrong.\n');
  sh(repo, 'add', '-A'); sh(repo, 'commit', '-qm', 'main');
  const corpus = join(tmp, 'corpus'), results = join(tmp, 'results'), lockDir = join(tmp, 'lock');
  mkdirSync(join(corpus, 'seeds'), { recursive: true });
  for (const s of seeds) writeFileSync(join(corpus, 'seeds', `${s.id}.json`), JSON.stringify(s));
  const fakeDir = join(tmp, 'fake'); mkdirSync(fakeDir);
  const bin = join(fakeDir, 'claude.mjs');
  copyFileSync(join(HERE, '..', 'pr-review', 'fixtures', 'fake-claude.mjs'), bin); chmodSync(bin, 0o755);
  writeFileSync(join(fakeDir, 'scenario.json'), JSON.stringify({ responses }));
  const lines = [];
  const run = (extra = {}) => runCalibration({
    repoRoot: repo, corpus, results, mode: 'production', runs: 1, only: null, base: 'main', lockDir, claudeBin: bin,
    models: { key1: 'k1-model', key2: 'k2-model', proxy: 'proxy-model' }, timeoutMs: 20000, backoffMs: 0, config: CONFIG,
    sleep: async () => {}, out: (s) => lines.push(s), now: () => new Date('2026-10-19T00:00:00Z'), ...extra,
  });
  const calls = () => (existsSync(join(fakeDir, 'calls.jsonl')) ? readFileSync(join(fakeDir, 'calls.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  return { tmp, repo, corpus, results, lockDir, run, calls, lines, cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

const group = (groups, checklist, holder) => groups.find((g) => g.checklist === checklist && g.holder === holder);

test('production mode: two seeds and one control give catch, miss, false fail, deferral and citation-valid per checklist; nothing posted, no token, nothing in the repo', async () => {
  process.env.GH_TOKEN = 'must-not-leak';
  process.env.NIRMAAN_REVIEW_APP_ID = 'must-not-leak';
  const t = setup({ responses: [
    { type: 'verdict', verdict: 'fail', findings: [{ file: 'os/app.js', line: 2, severity: 'blocker', text: 'Unsupported claim: "always correct" has no test.' }] }, // a1 key 1: catch
    { type: 'verdict', verdict: 'pass' }, // b2 key 1: miss
    { type: 'verdict', verdict: 'pass' }, // b2 key 2: miss
    { type: 'verdict', verdict: 'fail', findings: [{ file: 'os/notes.md', line: 1, severity: 'critical', text: 'Spelling claim untested.' }] }, // c3 key 1: false fail
  ] });
  try {
    const before = sh(t.repo, 'for-each-ref', '--format=%(refname) %(objectname)');
    const r = await t.run();
    assert.equal(process.env.GH_TOKEN, undefined, 'the runner drops GH_TOKEN');
    assert.equal(process.env.NIRMAAN_REVIEW_APP_ID, undefined, 'the runner drops the review App variables');
    const g = r.groups;
    // a1 (seed) and c3 (control) both count for key1-base: one catch, one false fail.
    const base = group(g, 'key1-base', 'key1:engineering');
    assert.deepEqual([base.runs, base.catch, base['false-fail'], base.miss, base.deferral, base.citation_valid, base.citation_invalid], [2, 1, 1, 0, 0, 2, 0]);
    assert.equal(group(g, 'engineering', 'key1:engineering').miss, 1);
    assert.equal(group(g, 'engineering', 'key2').miss, 1);
    assert.deepEqual(r.rows.filter((x) => x.id === 'c3').map((x) => [x.holder, x.outcome]), [['key1:engineering', 'false-fail']], 'key 2 does not run after a key-1 fail');
    const any = group(g, 'key1-base', 'any key');
    assert.deepEqual([any.runs, any.catch, any['false-fail']], [2, 1, 1]);
    assert.equal(group(g, 'engineering', 'any key').miss, 1);

    const calls = t.calls();
    assert.equal(calls.length, 4, 'one call per key that ran; key 2 only after a key-1 pass');
    for (const c of calls) {
      assert.ok(!c.env.includes('GH_TOKEN') && !c.env.includes('GITHUB_TOKEN'), 'no token in the reviewer env');
      assert.equal(c.argv[c.argv.indexOf('--tools') + 1], 'Read,Grep,Glob', 'production reviewer arguments');
      assert.ok(!/\ba1\b|\bb2\b|\bc3\b/.test(c.stdin), 'the seed id never reaches the reviewer');
    }
    assert.match(calls[0].stdin, /Tidy the app wording/);
    assert.equal(calls[0].argv[calls[0].argv.indexOf('--model') + 1], 'k1-model');
    assert.equal(calls[2].argv[calls[2].argv.indexOf('--model') + 1], 'k2-model');

    assert.equal(sh(t.repo, 'status', '--porcelain'), '', 'nothing written under the repository');
    assert.equal(sh(t.repo, 'for-each-ref', '--format=%(refname) %(objectname)'), before, 'the repository refs are untouched');
    assert.ok(!existsSync(join(t.lockDir, 'review.lock')), 'the review lock is released');
    const dir = r.resultsDir;
    assert.ok(dir.startsWith(t.results));
    for (const f of ['results.jsonl', 'summary.json', 'summary.txt', 'calls.jsonl']) assert.ok(existsSync(join(dir, f)), f);
    const text = t.lines.join('\n');
    assert.match(text, /catch\s+wrong reason\s+miss\s+false fail\s+clean\s+deferral\s+citation valid/);
    assert.match(text, /nothing posted/);
  } finally { t.cleanup(); delete process.env.GH_TOKEN; delete process.env.NIRMAAN_REVIEW_APP_ID; }
});

test('key2-alone mode: key 1 is a stub pass (no model call, not scored), so key 2 runs on every seed', async () => {
  const t = setup({ seeds: [SEED_A], responses: [{ type: 'verdict', verdict: 'fail', findings: [{ file: 'os/app.js', line: 2, severity: 'blocker', text: 'Claim with nothing behind it.' }] }] });
  try {
    const r = await t.run({ mode: 'key2-alone' });
    const calls = t.calls();
    assert.equal(calls.length, 1, 'only key 2 reached the real binary');
    assert.equal(calls[0].argv[calls[0].argv.indexOf('--model') + 1], 'k2-model');
    assert.deepEqual(r.rows.map((x) => [x.holder, x.outcome]), [['key2', 'catch']]);
  } finally { t.cleanup(); }
});

test('the review lock: the runner waits while another review holds it, then runs', async () => {
  const t = setup({ seeds: [CONTROL] });
  try {
    const lock = join(t.lockDir, 'review.lock');
    mkdirSync(lock, { recursive: true });
    writeFileSync(join(lock, 'owner.json'), JSON.stringify({ repo: 'nirmaansoftware/Nirmaan', pr: 7, pid: process.pid }));
    let waits = 0;
    const r = await t.run({ sleep: async () => { waits++; rmSync(lock, { recursive: true, force: true }); } });
    assert.equal(waits, 1);
    assert.ok(t.lines.some((l) => /review lock is busy \(nirmaansoftware\/Nirmaan #7\); waiting/.test(l)));
    assert.deepEqual(r.rows.map((x) => x.outcome), ['clean', 'clean']);
  } finally { t.cleanup(); }
});

test('refusals: corpus or results inside the repository, a seed that gives itself away, a control with an expectation', async () => {
  const t = setup();
  try {
    await assert.rejects(t.run({ results: join(t.repo, 'out') }), /results folder .* is inside the repository/);
    await assert.rejects(t.run({ corpus: join(t.repo, 'corpus') }), /corpus folder .* is inside the repository/);
    const bad = (s) => { writeFileSync(join(t.corpus, 'seeds', 'zz.json'), JSON.stringify(s)); return () => loadCorpus(t.corpus); };
    assert.throws(bad({ ...SEED_A, id: 'zz', title: 'Seed: tidy' }), /title gives the seed away/);
    assert.throws(bad({ ...SEED_A, id: 'zz', body: 'A planted change.' }), /body gives the seed away/);
    assert.throws(bad({ ...SEED_A, id: 'zz', commit_message: 'calibration run' }), /commit_message gives the seed away/);
    assert.throws(bad({ ...SEED_A, id: 'zz9', body: 'see zz9' }), /body contains the seed id/);
    assert.throws(bad({ ...CONTROL, id: 'zz', expect: { verdict: 'fail' } }), /a control has no expect/);
    assert.throws(bad({ ...SEED_A, id: 'zz', checklist: undefined }), /names the checklist/);
    rmSync(join(t.corpus, 'seeds', 'zz.json'));
    assert.throws(() => loadCorpus(t.corpus, { only: ['nope'] }), /not in the corpus/);
    assert.equal(loadCorpus(t.corpus, { only: ['b2'] }).length, 1);
  } finally { t.cleanup(); }
});

test('scoring: catch needs a blocking finding near the planted line (and the terms); far, wrong verdict and deferrals are told apart', () => {
  const seed = { kind: 'seed', expect: { verdict: 'fail', file: 'x.md', line: 10, window: 2, terms: ['source'] } };
  const fail = (findings) => ({ status: 'fail', verdict: { findings } });
  assert.equal(scoreResult(seed, fail([{ file: 'x.md', line: 11, severity: 'blocker', text: 'No source.' }])).outcome, 'catch');
  assert.equal(scoreResult(seed, fail([{ file: 'x.md', line: 20, severity: 'blocker', text: 'No source.' }])).outcome, 'wrong-reason', 'too far from the line');
  assert.equal(scoreResult(seed, fail([{ file: 'x.md', line: 10, severity: 'blocker', text: 'Bad tone.' }])).outcome, 'wrong-reason', 'wrong reason');
  assert.equal(scoreResult(seed, fail([{ file: 'x.md', line: 10, severity: 'minor', text: 'No source.' }, { file: 'y', line: 1, severity: 'blocker', text: 'other' }])).outcome, 'wrong-reason', 'a minor at the line is not the catch');
  assert.equal(scoreResult(seed, { status: 'pass', verdict: { findings: [] } }).outcome, 'miss');
  const nf = { kind: 'seed', expect: { verdict: 'needs-founder', file: 'LICENSE' } };
  assert.equal(scoreResult(nf, fail([{ file: 'LICENSE', line: 1, severity: 'blocker', text: 'x' }])).outcome, 'wrong-reason', 'fail where needs-founder was expected');
  assert.equal(scoreResult(nf, { status: 'needs-founder', verdict: { findings: [], founder_reasons: ['LICENSE:1 changes the licence'] } }).outcome, 'catch');
  const d = scoreResult(seed, { status: 'deferred', reason: 'the verdict failed validation: finding 1: cited x.md:99 does not exist at the head' });
  assert.deepEqual([d.outcome, d.citation], ['deferral', 'invalid']);
  assert.equal(scoreResult(seed, { status: 'deferred', reason: 'rate_limit: 429' }).citation, null);
  assert.equal(scoreResult({ kind: 'control' }, { status: 'needs-founder', verdict: { findings: [] } }).outcome, 'false-fail');
  assert.equal(scoreResult({ kind: 'control' }, { status: 'pass', verdict: { findings: [] } }).outcome, 'clean');
});

test('modes, measured holders, token stripping, summary and paths', () => {
  assert.deepEqual(modelsFor('key2-alone', { key1: 'a', key2: 'b', proxy: 'c' }), { key1: STUB_MODEL, key2: 'b', proxy: 'c' });
  assert.deepEqual(modelsFor('proxy-alone', { key1: 'a', key2: 'b', proxy: 'c' }), { key1: STUB_MODEL, key2: STUB_MODEL, proxy: 'c' });
  assert.throws(() => modelsFor('fast', {}), /mode must be one of/);
  const review = { key1: [{ team: 'web', status: 'pass' }], key2: { status: 'pass' }, proxy: { status: 'pass' } };
  assert.deepEqual(measured('production', review).map((m) => m.holder), ['key1:web', 'key2', 'proxy']);
  assert.deepEqual(measured('key2-alone', review).map((m) => m.holder), ['key2', 'proxy']);
  assert.deepEqual(measured('proxy-alone', review).map((m) => m.holder), ['proxy']);
  const env = { GH_TOKEN: 'x', GITHUB_TOKEN: 'y', NIRMAAN_REVIEW_APP_PRIVATE_KEY_FILE: 'z', PATH: '/bin' };
  assert.deepEqual(stripTokens(env), { PATH: '/bin' });
  const groups = summarize([{ id: 's', run: 1, kind: 'seed', checklist: 'c', holder: 'key2', outcome: 'catch', citation: 'valid' }]);
  assert.deepEqual(groups.map((x) => [x.holder, x.catch]), [['any key', 1], ['key2', 1]]);
  assert.match(formatSummary(groups), /^checklist\s+holder\s+runs/);
  const base = mkdtempSync(join(tmpdir(), 'calibration-paths-'));
  try {
    mkdirSync(join(base, 'a', 'b'), { recursive: true });
    assert.ok(isInside(join(base, 'a', 'b'), join(base, 'a')));
    assert.ok(!isInside(join(base, 'ab'), join(base, 'a')));
    assert.ok(!isInside(base, join(base, 'a')));
  } finally { rmSync(base, { recursive: true, force: true }); }
  assert.ok(readdirSync(HERE).every((f) => !/corpus|results/.test(f)), 'no corpus or results in the repository folder');
});
