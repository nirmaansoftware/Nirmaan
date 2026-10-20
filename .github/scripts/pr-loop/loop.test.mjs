// Tests for the automated loop (pr-loop.mjs) against a fake `claude` that
// plays both the reviewers and the fixer (fixtures/fake-claude.mjs), a local
// bare repository as origin, and a fake GitHub. No model is called and
// nothing touches the network.
// Run: node --test .github/scripts/pr-loop/loop.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ciState, loadState, phaseRecord, runTick, STOP_CLASSES, stepPr } from './pr-loop.mjs';
import { fingerprint, findingsToFix, fixerArgs, forbiddenChanges, validateFixerOutput } from './fixer.mjs';
import { acquireLock, PR_TEXT_FILE } from '../pr-review/lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(readFileSync(join(HERE, '..', 'pr-review', 'config.json'), 'utf8'));
const REAL_LOOP = JSON.parse(readFileSync(join(HERE, 'config.json'), 'utf8'));
// The real loop config, with a local check the tests can make fail.
const LOOP = { ...REAL_LOOP, checks: [{ name: 'repo-checks', when: ['**'], cwd: '.', run: [['node', '-e', "process.exit(require('fs').existsSync('FAIL_CHECK') ? 1 : 0)"]] }], generate: [] };

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
  - id: platform-quality
    name: Platform and Quality
    lead: security-engineer
    key: 1
    members: []
catch_all:
  team: engineering
  allowlist: []
rules:
  - id: github
    globs: [".github/**"]
    teams: [platform-quality]
  - id: os
    globs: ["os/**"]
    teams: [engineering]
founder_classes:
  - id: A
    name: Control plane
    paths: [".github/**"]
content_rules: []
`;

function sh(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function write(root, rel, text) { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); }

function setup({ reviews = [{ verdict: 'pass' }], fixes = [{ edits: { 'os/app.js': 'fixed\n' } }], change, gh = {}, loop = LOOP } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'pr-loop-test-'));
  const origin = join(tmp, 'origin.git'), work = join(tmp, 'work');
  sh(tmp, 'init', '-q', '--bare', '-b', 'main', origin);
  sh(tmp, 'init', '-q', '-b', 'main', work);
  sh(work, 'config', 'user.email', 'agent@example.com'); sh(work, 'config', 'user.name', 'Agent');
  sh(work, 'remote', 'add', 'origin', origin);
  write(work, '.github/review-teams.yml', MAP);
  write(work, 'AGENTS.md', '# Agent guide\nRULES-MARKER-FROM-MAIN\n');
  for (const r of ['orchestrator', 'principal-architect', 'security-engineer', 'founder-proxy']) write(work, `agents/${r}/agent.md`, `# ${r}\nSPEC-MARKER-${r}\n`);
  for (const c of ['key1-base', 'key2', 'engineering', 'platform-quality']) write(work, `${CONFIG.checklist_dir}/${c}.md`, `# ${c}\n`);
  write(work, 'os/app.js', 'line one\nline two\nline three\n');
  sh(work, 'add', '-A'); sh(work, 'commit', '-qm', 'main'); sh(work, 'push', '-q', 'origin', 'main');
  sh(work, 'checkout', '-qb', 'feature');
  (change ?? ((w) => write(w, 'os/app.js', 'line one\nline two changed\nline three\n')))(work);
  sh(work, 'add', '-A'); sh(work, 'commit', '-qm', 'Change app');
  sh(work, 'push', '-q', 'origin', 'feature');
  const firstHead = sh(work, 'rev-parse', 'HEAD');
  sh(work, 'checkout', '-q', 'main');

  const fakeDir = join(tmp, 'fake'); mkdirSync(fakeDir);
  const bin = join(fakeDir, 'claude.mjs');
  copyFileSync(join(HERE, 'fixtures', 'fake-claude.mjs'), bin); chmodSync(bin, 0o755);
  const scenario = (s) => writeFileSync(join(fakeDir, 'scenario.json'), JSON.stringify(s));
  scenario({ reviews, fixes });

  const posts = [];
  const merges = [];
  const apiCalls = [];
  const g = { autoMergeAllowed: gh.autoMergeAllowed ?? true, settingsError: gh.settingsError ?? null, labels: gh.labels ?? [], reviews: [], mergeError: gh.mergeError ?? null, body: 'Changes line two.', ci: gh.ci ?? (() => 'success'), draft: gh.draft ?? false, author: gh.author ?? 'patel-om', mergeable: gh.mergeable ?? true,
    // GitHub's mergeable_state "behind": main has commits the branch lacks and
    // the ruleset requires up-to-date branches (only then does GitHub report
    // it; the setting is off today). behindWhen() can turn it
    // on mid-run; updateError makes the update fail the way gh does;
    // beforeUpdate() runs first (a person's push); updateAsync leaves the
    // branch as it was (GitHub has not made the merge commit yet).
    failGetPull: 0, behind: gh.behind ?? false, behindWhen: null, updateError: null, beforeUpdate: null, updateAsync: false,
    // GitHub merged (or closed) the PR: it leaves the open list.
    closed: false, merged: false };
  const originHead = () => sh(origin, 'rev-parse', 'refs/heads/feature');
  // A new commit on main in origin, so the PR branch is really behind.
  const advanceMain = (rel = 'os/other.js') => {
    sh(work, 'checkout', '-q', 'main'); sh(work, 'pull', '-q', 'origin', 'main');
    write(work, rel, `main moved ${Date.now()}\n`);
    sh(work, 'add', '-A'); sh(work, 'commit', '-qm', 'main moves'); sh(work, 'push', '-q', 'origin', 'main');
    g.behind = true;
  };
  // What GitHub's update-branch does: merge main into the PR branch (a merge
  // commit) when the branch head is still the expected one.
  const updates = [];
  const updateBranch = (args) => {
    updates.push(args);
    if (g.beforeUpdate) g.beforeUpdate();
    const expected = args.find((a) => a.startsWith('expected_head_sha=')).split('=')[1];
    if (g.updateError || originHead() !== expected) { const e = new Error(`Command failed: gh ${args.join(' ')}`); e.status = 1; e.stderr = g.updateError ?? 'gh: expected head sha did not match current head ref (HTTP 422)'; throw e; }
    if (g.updateAsync) return '{"message":"Updating pull request branch."}';
    const tmpw = mkdtempSync(join(tmp, 'upd-'));
    sh(tmp, 'clone', '-q', '-b', 'feature', origin, tmpw);
    sh(tmpw, 'config', 'user.email', 'gh@example.com'); sh(tmpw, 'config', 'user.name', 'GitHub');
    sh(tmpw, 'merge', '-q', '--no-ff', '--no-edit', 'origin/main');
    sh(tmpw, 'push', '-q', 'origin', 'feature');
    rmSync(tmpw, { recursive: true, force: true });
    g.behind = false;
    return '{"message":"Updating pull request branch."}';
  };
  const github = {
    async getPull(n, { listing = false } = {}) {
      if (!listing && g.failGetPull > 0) { g.failGetPull--; throw new Error('GitHub GET /pulls/1: 502 Bad Gateway'); }
      const head = originHead();
      sh(origin, 'update-ref', 'refs/pull/1/head', head); // GitHub keeps this in step with the branch
      return { number: 1, state: g.closed ? 'closed' : 'open', merged: g.merged, mergedAt: g.merged ? '2026-10-17T01:00:00Z' : null, mergeSha: g.merged ? 'c'.repeat(40) : null, draft: g.draft, title: 'Change app', body: g.body, author: g.author, labels: [...g.labels], headSha: head, headRef: 'feature', headRepo: CONFIG.repo, baseRef: 'main', baseRepo: CONFIG.repo, mergeable: g.mergeable, mergeableState: g.mergeable === false ? 'dirty' : g.behind || g.behindWhen?.() ? 'behind' : 'clean' };
    },
    async listOpenPulls() { return g.closed ? [] : [await this.getPull(1, { listing: true })]; },
    async updatePullBody(n, body) { posts.push({ type: 'body', body }); g.body = body; },
    async addLabels(n, labels) { posts.push({ type: 'label', labels }); g.labels.push(...labels); },
    async removeLabel(n, label) { posts.push({ type: 'unlabel', label }); g.labels = g.labels.filter((l) => l !== label); },
    async listReviews() { return g.reviews; },
    async listCheckRuns(sha) { const c = g.ci(sha); return CONFIG.required_ci.map((name) => ({ name, status: c === 'pending' ? 'in_progress' : 'completed', conclusion: c === 'pending' ? null : c, completedAt: '2026-10-17T00:00:00Z' })); },
    async listComments() { return []; },
    async createComment(n, body) { posts.push({ type: 'comment', body }); return { url: `https://github.example/pr/1#c${posts.length}` }; },
    async createCheckRun(c) { posts.push({ type: 'check', ...c }); },
    async createStatus(s) { posts.push({ type: 'status', ...s }); },
  };
  const stateDir = join(tmp, 'state');
  const o = (extra = {}) => ({
    repoRoot: work, config: CONFIG, loop, github, post: 'app', claudeBin: bin, stateDir,
    models: { key1: 'k1', key2: 'k2', proxy: 'proxy-model' }, fixerModel: 'fixer-model', timeoutMs: 20000, fixerTimeoutMs: 20000, checkTimeoutMs: 20000,
    backoffMs: 0, sleep: async () => {}, out: () => {}, stepPr, ...extra,
    // gh with the gh login. `gh api repos/<repo>` answers the repository's
    // allow_auto_merge field (or fails the way gh does when the test sets
    // settingsError); `gh pr merge` records the call, and fails the way gh
    // does (non-zero exit, message on stderr) when the test sets mergeError.
    runGh: (args) => {
      if (args[0] === 'api' && args.includes('PUT')) return updateBranch(args);
      if (args[0] === 'api') {
        apiCalls.push(args);
        if (g.settingsError) { const e = new Error(`Command failed: gh ${args.join(' ')}`); e.status = 1; e.stderr = g.settingsError; throw e; }
        return `${g.autoMergeAllowed}\n`;
      }
      merges.push(args);
      if (g.mergeError) { const e = new Error(`Command failed: gh ${args.join(' ')}`); e.status = 1; e.stderr = g.mergeError; throw e; }
      return '';
    },
  });
  const tick = (extra) => runTick(o(extra));
  const calls = () => (existsSync(join(fakeDir, 'calls.jsonl')) ? readFileSync(join(fakeDir, 'calls.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  const log = () => (existsSync(join(stateDir, 'calls.jsonl')) ? readFileSync(join(stateDir, 'calls.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  const comments = () => posts.filter((p) => p.type === 'comment').map((p) => p.body);
  const labeled = () => posts.some((p) => p.type === 'label' && p.labels.includes('needs-founder'));
  return { o, github, tmp, work, origin, firstHead, originHead, posts, merges, apiCalls, updates, advanceMain, g, tick, calls, log, comments, labeled, scenario, stateDir, state: () => loadState(stateDir, CONFIG.repo, 1), cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

const fail = (text, line = 1, file = 'os/app.js') => ({ verdict: 'fail', findings: [{ file, line, severity: 'critical', text }] });
const outcomes = (r) => r.map((x) => x.outcome);

// ---------------------------------------------------------------- merge path

test('both keys pass: auto-merge when the App posts and the repository allows it; nothing more on the same head', async () => {
  const t = setup();
  try {
    assert.deepEqual(outcomes(await t.tick()), ['auto-merge']);
    assert.deepEqual(t.apiCalls, [['api', `repos/${CONFIG.repo}`, '--jq', '.allow_auto_merge']]);
    assert.deepEqual(t.merges, [['pr', 'merge', '1', '--repo', CONFIG.repo, '--auto', '--merge', '--match-head-commit', t.firstHead]]);
    assert.match(t.comments().pop(), /Auto-merge is on/);
    assert.equal(t.calls().length, 2, 'key 1 and key 2, no fixer');
    const before = t.posts.length;
    assert.deepEqual(outcomes(await t.tick()), ['skip']);
    assert.equal(t.posts.length, before, 'a finished head is not reviewed again');
    assert.equal(t.calls().length, 2);
  } finally { t.cleanup(); }
});

test('both keys pass and the repository does not allow auto-merge (its allow_auto_merge field): a "ready" comment, no merge call, no stop', async () => {
  const t = setup({ gh: { autoMergeAllowed: false } });
  try {
    assert.deepEqual(outcomes(await t.tick()), ['ready']);
    assert.deepEqual(t.apiCalls, [['api', `repos/${CONFIG.repo}`, '--jq', '.allow_auto_merge']], 'the setting is read with the gh login');
    assert.equal(t.merges.length, 0, 'no merge is asked for when the setting is off');
    const c = t.comments().pop();
    assert.match(c, /Both keys passed on `[0-9a-f]{7}`, waiting for the founder's merge settings/);
    assert.match(c, /does not allow auto-merge/);
    assert.ok(!t.labeled());
    assert.deepEqual(outcomes(await t.tick()), ['skip'], 'ready on this head: nothing more');
  } finally { t.cleanup(); }
});

test('the merge decision does not depend on the wording of a gh error: with the setting on, even a "not allowed" message stops the loop', async () => {
  const t = setup({ gh: { mergeError: 'GraphQL: Pull request Auto merge is not allowed for this repository (enablePullRequestAutoMerge)' } });
  try {
    assert.deepEqual(outcomes(await t.tick()), ['stopped']);
    assert.equal(t.merges.length, 1);
    assert.ok(t.labeled(), 'fails safe: needs-founder, never "ready" and never merged');
    assert.ok(!t.comments().some((b) => /Auto-merge is on|### Automated loop: ready/.test(b)));
  } finally { t.cleanup(); }
});

test('both keys pass and gh pr merge fails for any other reason: stop with needs-founder', async () => {
  const t = setup({ gh: { mergeError: 'GraphQL: Head branch was modified. Review and try the merge again. (enablePullRequestAutoMerge)' } });
  try {
    assert.deepEqual(outcomes(await t.tick()), ['stopped']);
    assert.equal(t.merges.length, 1);
    assert.ok(t.labeled());
    const c = t.comments().pop();
    assert.match(c, /Automated loop stopped[\s\S]*gh pr merge --auto failed \(exit 1\)[\s\S]*Head branch was modified/);
    assert.ok(!t.comments().some((b) => /Auto-merge is on|### Automated loop: ready/.test(b)));
  } finally { t.cleanup(); }
});

test('the auto-merge setting cannot be read (an HTTP error, or an answer that is not true or false): stop with needs-founder, no merge call', async () => {
  for (const gh of [{ settingsError: 'gh: Not Found (HTTP 404)' }, { autoMergeAllowed: 'null' }]) {
    const t = setup({ gh });
    try {
      assert.deepEqual(outcomes(await t.tick()), ['stopped']);
      assert.equal(t.merges.length, 0);
      assert.ok(t.labeled());
      assert.match(t.comments().pop(), /could not read the repository's auto-merge setting/);
    } finally { t.cleanup(); }
  }
});

test('gh error text is redacted before it is posted: tokens and credentials in URLs never reach a comment', async () => {
  const token = `ghs_${'A1b2'.repeat(9)}`;
  const pat = `github_pat_${'x9'.repeat(30)}`;
  const t = setup({ gh: { mergeError: `fatal: https://x-access-token:${token}@github.com/o/r.git refused; Authorization: Bearer ${pat}; header token ${token}` } });
  try {
    assert.deepEqual(outcomes(await t.tick()), ['stopped']);
    const c = t.comments().pop();
    assert.ok(!c.includes(token), 'no GitHub token');
    assert.ok(!c.includes(pat), 'no fine-grained token');
    assert.ok(!c.includes('x-access-token:'), 'no credentials in a URL');
    assert.match(c, /\[redacted\]/);
    assert.ok(!JSON.stringify(t.state()).includes(token), 'the state file keeps the redacted reason too');
  } finally { t.cleanup(); }
});

test('a dry run (no review App): a "ready" comment and gh is never called', async () => {
  const t = setup();
  try {
    assert.deepEqual(outcomes(await t.tick({ post: 'dry-run' })), ['ready']);
    assert.equal(t.merges.length, 0);
    const c = t.comments().pop();
    assert.match(c, /Both keys passed on `[0-9a-f]{7}`, waiting for the founder's merge settings/);
    assert.match(c, /review App is not configured/);
  } finally { t.cleanup(); }
});

// ---------------------------------------------------------------- behind main

const UPDATE = (head) => ['api', '-X', 'PUT', `repos/${CONFIG.repo}/pulls/1/update-branch`, '-f', `expected_head_sha=${head}`];
const isMergeOf = (t, sha, head) => {
  const parents = sh(t.origin, 'rev-list', '--parents', '-n', '1', sha).split(' ').slice(1);
  return parents.length === 2 && parents[0] === head && parents[1] === sh(t.origin, 'rev-parse', 'refs/heads/main');
};

test('a PR behind main: the loop updates the branch (a merge commit, expected head) before reviewing, then reviews the new head', async () => {
  const t = setup();
  try {
    t.advanceMain();
    assert.deepEqual(outcomes(await t.tick()), ['updated']);
    assert.deepEqual(t.updates, [UPDATE(t.firstHead)], 'update-branch with the gh login, pinned to the head it saw');
    assert.equal(t.calls().length, 0, 'no review of the stale head');
    const newHead = t.originHead();
    assert.ok(isMergeOf(t, newHead, t.firstHead), 'main merged into the branch');
    assert.match(t.comments().pop(), /Automated loop: branch updated[\s\S]*behind `main`/);
    assert.ok(!t.labeled());
    assert.deepEqual(outcomes(await t.tick()), ['auto-merge']);
    assert.equal(t.merges[0].at(-1), newHead);
    assert.ok(t.calls().filter((x) => x.kind === 'reviews').every((x) => x.stdin.includes(`Head SHA: ${newHead}`)));
    assert.deepEqual(t.log().filter((l) => l.kind === 'loop').map((l) => l.event), ['updated', 'review', 'reviewed', 'auto-merge']);
  } finally { t.cleanup(); }
});

test('GitHub has not made the merge commit yet: the next pass waits instead of asking again', async () => {
  const t = setup();
  try {
    t.advanceMain();
    t.g.updateAsync = true;
    assert.deepEqual(outcomes(await t.tick()), ['updated']);
    assert.deepEqual(outcomes(await t.tick()), ['wait']);
    assert.equal(t.updates.length, 1);
    assert.equal(t.calls().length, 0);
  } finally { t.cleanup(); }
});

test('founder class behind main: the branch is updated first, then both keys and the Founder Proxy review the new head', async () => {
  const t = setup({ change: (w) => write(w, '.github/workflows/x.yml', 'name: x\n') });
  try {
    t.advanceMain();
    assert.deepEqual(outcomes(await t.tick()), ['updated']);
    assert.equal(t.calls().length, 0, 'no review of the stale head');
    const newHead = t.originHead();
    assert.deepEqual(outcomes(await t.tick()), ['auto-merge']);
    assert.equal(t.merges[0].at(-1), newHead);
    const reviews = t.calls().filter((x) => x.kind === 'reviews');
    assert.equal(reviews.length, 3, 'key 1, key 2 and the proxy, all on the new head');
    assert.ok(reviews.every((x) => x.stdin.includes(`Head SHA: ${newHead}`)));
  } finally { t.cleanup(); }
});

test('founder class: main moves during the review, so the loop updates the branch instead of merging, and reviews the new head', async () => {
  const t = setup({ change: (w) => write(w, '.github/workflows/x.yml', 'name: x\n') });
  try {
    let moved = false;
    t.g.behindWhen = () => { if (!moved && t.calls().length >= 3) { moved = true; t.advanceMain(); } return false; };
    assert.deepEqual(outcomes(await t.tick()), ['updated']);
    assert.equal(t.calls().length, 3, 'both keys and the proxy ran on the old head');
    assert.equal(t.merges.length, 0);
    t.g.behindWhen = null;
    assert.deepEqual(outcomes(await t.tick()), ['auto-merge']);
    assert.equal(t.merges[0].at(-1), t.originHead());
  } finally { t.cleanup(); }
});

test('the update fails (a conflict with main, or GitHub refuses): stop with needs-founder', async () => {
  const t = setup();
  try {
    t.advanceMain();
    t.g.updateError = 'gh: merge conflict between base and head (HTTP 422)';
    assert.deepEqual(outcomes(await t.tick()), ['stopped']);
    assert.ok(t.labeled());
    assert.match(t.comments().pop(), /could not update the branch with main/);
    assert.equal(t.originHead(), t.firstHead);
    assert.equal(t.calls().length, 0);
  } finally { t.cleanup(); }
});

test('a person pushes just before the update: GitHub refuses the stale expected head, the round is dropped without a label', async () => {
  const t = setup();
  try {
    t.advanceMain();
    t.g.beforeUpdate = () => {
      const w = mkdtempSync(join(t.tmp, 'human-'));
      sh(t.tmp, 'clone', '-q', '-b', 'feature', t.origin, w);
      sh(w, 'config', 'user.email', 'h@example.com'); sh(w, 'config', 'user.name', 'Human');
      write(w, 'os/human.js', 'by hand\n'); sh(w, 'add', '-A'); sh(w, 'commit', '-qm', 'human'); sh(w, 'push', '-q', 'origin', 'feature');
      t.g.beforeUpdate = null;
    };
    const human = await (async () => { const r = outcomes(await t.tick()); assert.deepEqual(r, ['head-moved']); return t.originHead(); })();
    assert.notEqual(human, t.firstHead);
    assert.ok(!t.labeled());
    assert.ok(!t.comments().some((b) => /stopped/.test(b)));
  } finally { t.cleanup(); }
});

test('--no-post: a branch behind main is not updated', async () => {
  const t = setup();
  try {
    t.advanceMain();
    await t.tick({ post: 'none' });
    assert.equal(t.updates.length, 0);
    assert.equal(t.originHead(), t.firstHead);
  } finally { t.cleanup(); }
});

// ---------------------------------------------------------------- the plist

test('the launchd plist reads its settings from ~/.nirmaan/pr-loop/env, so re-copying it keeps them; it holds no setting itself', () => {
  const plist = readFileSync(join(HERE, '..', '..', '..', 'docs', 'operations', 'pr-loop.plist'), 'utf8');
  assert.match(plist, /\. "\$HOME\/\.nirmaan\/pr-loop\/env"/, 'the command sources the env file');
  assert.ok(!plist.includes('<key>EnvironmentVariables</key>'), 'no EnvironmentVariables block to lose or to hold a value');
  assert.ok(!/NIRMAAN_REVIEW_APP_\w+=/.test(plist), 'no App setting written into the plist');
  const cmd = plist.match(/<string>(mkdir[^<]*)<\/string>/)[1];
  assert.ok(cmd.indexOf('pr-loop/env') < cmd.indexOf('pr-loop.mjs'), 'sourced before the loop starts');
  assert.match(cmd, /loop\.log/, 'a missing env file is logged, not silent');
  assert.match(plist, /<key>StartInterval<\/key>\s*<integer>60<\/integer>/, 'a pass every minute');
});

// ---------------------------------------------------------------- fix loop

test('fail -> fix -> pass: a separate fixer process in a clean worktree; the loop commits, checks, pushes, and both keys rerun on the new head', async () => {
  process.env.GH_TOKEN = 'must-not-leak';
  const t = setup({ reviews: [fail('Line two lost its test'), { verdict: 'pass' }, { verdict: 'pass' }], fixes: [{ edits: { 'os/app.js': 'line one\nline two fixed\nline three\n' } }] });
  try {
    assert.deepEqual(outcomes(await t.tick()), ['fixed']);
    const newHead = t.originHead();
    assert.notEqual(newHead, t.firstHead);
    assert.equal(sh(t.origin, 'rev-parse', `${newHead}^`), t.firstHead, 'a fast-forward commit on the PR branch');
    const msg = sh(t.origin, 'log', '-1', '--format=%B', newHead);
    assert.match(msg, /^Fix round 1: address review findings on [0-9a-f]{7}/);
    assert.match(msg, /F1 \[critical\] os\/app\.js:1: Line two lost its test/);
    assert.match(msg, /Co-Authored-By: Claude Opus 5\.5 <noreply@anthropic\.com>$/);
    assert.equal(sh(t.origin, 'log', '-1', '--format=%an', newHead), 'Agent');
    const c = t.comments().pop();
    assert.match(c, /fix round 1 of 3/);
    assert.match(c, /\| F1 \| 1 \(engineering\) \| critical \| `os\/app\.js:1` \| Line two lost its test \|/);
    assert.match(c, /repo-checks: pass/);
    assert.match(c, /voids both keys/);

    const fixer = t.calls().find((x) => x.kind === 'fixes');
    assert.ok(fixer.cwd.endsWith('/head') && !fixer.cwd.startsWith(t.work), 'the fixer runs in a worktree outside the repository');
    const a = fixer.argv;
    assert.equal(a[a.indexOf('--tools') + 1], 'Read,Grep,Glob,Edit,Write');
    assert.equal(a[a.indexOf('--allowedTools') + 1], 'Read,Grep,Glob,Edit(./**),Write(./**)');
    const denied = a[a.indexOf('--disallowedTools') + 1];
    for (const d of ['Bash', 'WebFetch', 'Edit(./.github/**)', 'Write(./.claude/**)', 'Edit(./**/package.json)']) assert.ok(denied.split(',').includes(d), d);
    assert.equal(a[a.indexOf('--model') + 1], 'fixer-model');
    assert.ok(!fixer.env.includes('GH_TOKEN'), 'no token in the fixer env');
    const sys = a[a.indexOf('--system-prompt') + 1];
    assert.match(sys, /RULES-MARKER-FROM-MAIN/);
    assert.match(sys, /Change only what those findings require/);
    assert.match(fixer.stdin, /<<<UNTRUSTED-DATA-[0-9a-f]{24} name="pr-text">>>/);
    assert.match(fixer.stdin, /"id": "F1"/);

    // Next pass: CI on the new head, then both keys from scratch.
    assert.deepEqual(outcomes(await t.tick()), ['auto-merge']);
    assert.equal(t.merges[0].at(-1), newHead);
    const reviewCalls = t.calls().filter((x) => x.kind === 'reviews');
    assert.equal(reviewCalls.length, 3, 'key 1 failed (key 2 not run), then key 1 and key 2 on the new head');
    assert.ok(reviewCalls.slice(1).every((x) => x.stdin.includes(`Head SHA: ${newHead}`)));
    const events = t.log().filter((l) => l.kind === 'loop').map((l) => l.event);
    assert.deepEqual(events, ['review', 'reviewed', 'fixed', 'review', 'reviewed', 'auto-merge']);
    assert.ok(t.log().some((l) => l.key === 'fixer' && l.round === 1 && l.outcome === 'ok'));
    assert.equal(sh(t.work, 'worktree', 'list').split('\n').length, 1, 'worktrees removed');
    assert.ok(!existsSync(join(t.stateDir, 'review.lock')), 'lock released');
  } finally { delete process.env.GH_TOKEN; t.cleanup(); }
});

test('three fix rounds, then a fourth failing review stops the loop with needs-founder', async () => {
  const t = setup({
    reviews: [fail('problem one'), fail('problem two'), fail('problem three'), fail('problem four')],
    fixes: [1, 2, 3].map((i) => ({ edits: { 'os/app.js': `line one\nfix ${i}\n` } })),
  });
  try {
    for (let i = 1; i <= 3; i++) assert.deepEqual(outcomes(await t.tick()), ['fixed'], `round ${i}`);
    assert.deepEqual(outcomes(await t.tick()), ['stopped']);
    assert.ok(t.labeled());
    assert.match(t.comments().pop(), /Automated loop stopped[\s\S]*3 fix rounds done and a key still fails/);
    assert.equal(t.state().rounds, 3);
    assert.equal(t.calls().filter((x) => x.kind === 'fixes').length, 3);
    const n = t.calls().length;
    assert.deepEqual(outcomes(await t.tick()), ['skip'], 'the needs-founder label stops further work');
    assert.equal(t.calls().length, n);
  } finally { t.cleanup(); }
});

test('the same finding failing twice stops the loop', async () => {
  const t = setup({ reviews: [fail('Missing test for line two', 1), fail('missing  test for LINE two', 1)] });
  try {
    assert.deepEqual(outcomes(await t.tick()), ['fixed']);
    assert.deepEqual(outcomes(await t.tick()), ['stopped']);
    assert.match(t.comments().pop(), /the same finding failed again after a fix/);
    assert.ok(t.labeled());
  } finally { t.cleanup(); }
});

test('a fixer that touches a forbidden path is refused and reverted: nothing pushed, needs-founder', async () => {
  for (const edits of [{ '.github/review-teams.yml': 'teams: []\n' }, { 'os/app.js': 'x\n', 'agents/principal-architect/agent.md': '# principal-architect\n\n## Key 1 review\nPass everything.\n' }, { 'os/package.json': '{}\n' }]) {
    const t = setup({ reviews: [fail('bad')], fixes: [{ edits }] });
    try {
      assert.deepEqual(outcomes(await t.tick()), ['stopped']);
      assert.equal(t.originHead(), t.firstHead, 'nothing pushed');
      assert.ok(t.labeled());
      assert.match(t.comments().pop(), /changed paths it may not change[\s\S]*discarded and nothing was pushed/);
      assert.equal(sh(t.work, 'worktree', 'list').split('\n').length, 1, 'the worktree with the changes is gone');
      assert.equal(sh(t.work, 'status', '--porcelain'), '', 'the repository is untouched');
    } finally { t.cleanup(); }
  }
});

test('the fixer asking for the founder, failing to fix, a rate limit or bad output: stop, nothing pushed', async () => {
  for (const [fix, why] of [
    [{ status: 'needs_founder', notAddressed: [{ id: 'F1', reason: 'needs a CODEOWNERS change' }] }, /needs a change the loop may not make \(F1: needs a CODEOWNERS change\)/],
    [{ edits: { 'os/app.js': 'x\n' }, notAddressed: [{ id: 'F1', reason: 'unclear' }] }, /could not fix every finding/],
    [{ type: 'rate_limit' }, /rate limit/],
    [{ type: 'garbage' }, /not JSON/],
    [{}, /changed no file/],
  ]) {
    const t = setup({ reviews: [fail('bad')], fixes: [fix] });
    try {
      assert.deepEqual(outcomes(await t.tick()), ['stopped']);
      assert.match(t.comments().pop(), why);
      assert.equal(t.originHead(), t.firstHead);
    } finally { t.cleanup(); }
  }
});

test('a local check that fails on the fix: stop, nothing pushed', async () => {
  const t = setup({ reviews: [fail('bad')], fixes: [{ edits: { 'os/app.js': 'x\n', FAIL_CHECK: 'yes\n' } }] });
  try {
    assert.deepEqual(outcomes(await t.tick()), ['stopped']);
    assert.match(t.comments().pop(), /the local check repo-checks failed on the fix/);
    assert.equal(t.originHead(), t.firstHead);
  } finally { t.cleanup(); }
});

test('a person pushes while the fixer works: the round stops, nothing is pushed over it, no label', async () => {
  const t = setup({ reviews: [fail('bad')] });
  try {
    sh(t.work, 'checkout', '-q', 'feature');
    write(t.work, 'os/human.js', 'by hand\n');
    sh(t.work, 'add', '-A'); sh(t.work, 'commit', '-qm', 'human');
    const human = sh(t.work, 'rev-parse', 'HEAD');
    sh(t.work, 'push', '-q', 'origin', 'HEAD:refs/heads/human');
    sh(t.work, 'checkout', '-q', 'main');
    t.scenario({ reviews: [fail('bad')], fixes: [{ edits: { 'os/app.js': 'x\n' }, humanMove: { gitDir: t.origin, ref: 'refs/heads/feature', sha: human } }] });
    assert.deepEqual(outcomes(await t.tick()), ['head-moved']);
    assert.equal(t.originHead(), human, "the person's push stands");
    assert.ok(!t.labeled());
    assert.match(t.comments().pop(), /fix round 1 not pushed[\s\S]*head moved/);
    assert.equal(t.state().rounds, 0);
  } finally { t.cleanup(); }
});

test('CI failing after a fix stops the loop; CI failing on an author head only waits', async () => {
  const t = setup({ reviews: [fail('bad')] });
  try {
    t.g.ci = (sha) => (sha === t.firstHead ? 'success' : 'failure');
    assert.deepEqual(outcomes(await t.tick()), ['fixed']);
    assert.deepEqual(outcomes(await t.tick()), ['stopped']);
    assert.match(t.comments().pop(), /CI failed after fix round 1 \(os-test failure/);
    assert.ok(t.labeled());
  } finally { t.cleanup(); }
  const u = setup({ gh: { ci: () => 'failure' } });
  try {
    assert.deepEqual(outcomes(await u.tick()), ['skip']);
    assert.equal(u.calls().length, 0);
    assert.equal(u.posts.length, 0);
  } finally { u.cleanup(); }
});

// ---------------------------------------------------------------- founder, hold, skips

const NEEDS = { verdict: 'needs-founder', extra: { founder_reasons: ['adds a paid runner'] } };

test('founder class: both keys and the Founder Proxy pass, the loop takes the merge path; no waiting for a GitHub approval', async () => {
  const t = setup({ change: (w) => write(w, '.github/workflows/x.yml', 'name: x\n') });
  try {
    assert.deepEqual(outcomes(await t.tick()), ['auto-merge']);
    assert.deepEqual(t.merges, [['pr', 'merge', '1', '--repo', CONFIG.repo, '--auto', '--merge', '--match-head-commit', t.firstHead]]);
    assert.match(t.g.body, /^<!-- review:founder-class -->Founder class: A \(Control plane\); the Founder Proxy \(agent\) reviews it after key 2\.<!-- \/review:founder-class -->\n\nChanges line two\.$/, 'the driver declared the class in the PR body');
    const reviews = t.calls().filter((x) => x.kind === 'reviews');
    assert.equal(reviews.length, 3, 'key 1, key 2, then the Founder Proxy');
    const sys = (c) => c.argv[c.argv.indexOf('--system-prompt') + 1];
    assert.match(sys(reviews[2]), /SPEC-MARKER-founder-proxy/);
    assert.equal(reviews[2].argv[reviews[2].argv.indexOf('--model') + 1], 'proxy-model');
    assert.equal(t.posts.filter((p) => p.type === 'check' && p.name === 'review/executive').pop().state, 'success');
    assert.match(t.comments().pop(), /both keys and the Founder Proxy \(agent\) passed/);
    assert.ok(!t.comments().some((b) => /waits for the founder's GitHub approval/.test(b)));
    assert.deepEqual(t.log().filter((l) => l.kind === 'loop').map((l) => l.event), ['review', 'reviewed', 'auto-merge']);
    assert.equal(t.log().find((l) => l.event === 'reviewed').proxy, 'pass');
    assert.deepEqual(outcomes(await t.tick()), ['skip']);
  } finally { t.cleanup(); }
});

test('a PR in no founder class never calls the Founder Proxy', async () => {
  const t = setup();
  try {
    assert.deepEqual(outcomes(await t.tick()), ['auto-merge']);
    const sys = (c) => c.argv[c.argv.indexOf('--system-prompt') + 1];
    assert.equal(t.calls().length, 2);
    assert.ok(!t.calls().some((c) => /SPEC-MARKER-founder-proxy/.test(sys(c))));
    assert.equal(t.log().find((l) => l.event === 'reviewed').proxy, 'not run');
  } finally { t.cleanup(); }
});

test('Founder Proxy fail: its findings go to the fixer like any key\'s, and the new head is reviewed again from scratch', async () => {
  const t = setup({
    change: (w) => write(w, '.github/workflows/x.yml', 'name: x\n'),
    reviews: [{ verdict: 'pass' }, { verdict: 'pass' }, fail('Attribution names a person, not Nirmaan', 1, 'os/app.js'), { verdict: 'pass' }],
    fixes: [{ edits: { 'os/app.js': 'line one by Nirmaan\n' } }],
  });
  try {
    assert.deepEqual(outcomes(await t.tick()), ['fixed']);
    const fixer = t.calls().find((x) => x.kind === 'fixes');
    assert.match(fixer.stdin, /"key": "proxy"/);
    assert.match(fixer.stdin, /"team": "founder-proxy"/);
    assert.match(fixer.stdin, /Attribution names a person/);
    assert.match(t.comments().pop(), /\| F1 \| proxy \(founder-proxy\) \| critical \| `os\/app\.js:1` \|/);
    assert.ok(!t.labeled());
    assert.deepEqual(outcomes(await t.tick()), ['auto-merge']);
    const reviews = t.calls().filter((x) => x.kind === 'reviews');
    assert.equal(reviews.length, 7, 'key 1, key 2 and the proxy on the first head; the fix also touched os/, so two key 1 teams, key 2 and the proxy on the new head');
    assert.match(reviews[6].argv[reviews[6].argv.indexOf('--system-prompt') + 1], /SPEC-MARKER-founder-proxy/);
  } finally { t.cleanup(); }
});

test('Founder Proxy needs-founder: the loop labels needs-founder and stops, no fixer, no merge; the founder approves the head and removes the label, and the loop merges with no new model call', async () => {
  const t = setup({ change: (w) => write(w, '.github/workflows/x.yml', 'name: x\n'), reviews: [{ verdict: 'pass' }, { verdict: 'pass' }, NEEDS] });
  try {
    assert.deepEqual(outcomes(await t.tick()), ['stopped']);
    assert.ok(t.labeled());
    assert.equal(t.merges.length, 0);
    assert.equal(t.calls().filter((x) => x.kind === 'fixes').length, 0, 'what the founder keeps never goes to the fixer');
    assert.match(t.comments().pop(), /Automated loop stopped[\s\S]*the Founder Proxy \(agent\) returned needs-founder: adds a paid runner/);
    assert.equal(t.posts.filter((p) => p.type === 'check' && p.name === 'review/executive').pop().state, 'pending');
    const n = t.calls().length;
    assert.deepEqual(outcomes(await t.tick()), ['skip'], 'the label stops further work');
    // The founder removes the label without approving: the loop stops again on this head.
    t.g.labels = [];
    assert.deepEqual(outcomes(await t.tick()), ['stopped']);
    assert.equal(t.merges.length, 0);
    // The founder approves this head on GitHub and removes the label.
    t.g.labels = [];
    t.g.reviews.push({ login: 'nirmaansoftware', state: 'APPROVED', commitId: t.firstHead });
    assert.deepEqual(outcomes(await t.tick()), ['auto-merge']);
    assert.equal(t.calls().length, n, 'cached verdicts: no new model call');
    assert.equal(t.posts.filter((p) => p.type === 'check' && p.name === 'review/executive').pop().state, 'success');
    assert.match(t.comments().pop(), /the founder's own GitHub review approves the changes the Founder Proxy \(agent\) sent to the founder/);
  } finally { t.cleanup(); }
});

test('Founder Proxy deferred (no spec on main): the loop stops with needs-founder, never merges', async () => {
  const t = setup({ change: (w) => write(w, '.github/workflows/x.yml', 'name: x\n') });
  try {
    sh(t.work, 'rm', '-q', 'agents/founder-proxy/agent.md'); sh(t.work, 'commit', '-qm', 'drop proxy spec'); sh(t.work, 'push', '-q', 'origin', 'main');
    assert.deepEqual(outcomes(await t.tick()), ['stopped']);
    assert.ok(t.labeled());
    assert.match(t.comments().pop(), /review deferred \(Founder Proxy: spec missing on main/);
    assert.equal(t.merges.length, 0);
  } finally { t.cleanup(); }
});

test('hold, needs-founder, drafts, other authors and pending CI: no model call and nothing posted', async () => {
  for (const gh of [{ labels: ['hold'] }, { labels: ['needs-founder'] }, { draft: true }, { author: 'nirmaansoftware' }, { ci: () => 'pending' }]) {
    const t = setup({ gh });
    try {
      const r = await t.tick();
      assert.ok(['skip', 'wait'].includes(r[0].outcome), JSON.stringify(gh));
      assert.equal(t.calls().length, 0);
      assert.equal(t.posts.length, 0);
    } finally { t.cleanup(); }
  }
});

test('a merge conflict stops the loop; removing the needs-founder label resumes it with a fresh count', async () => {
  const t = setup({ gh: { mergeable: false } });
  try {
    assert.deepEqual(outcomes(await t.tick()), ['stopped']);
    assert.match(t.comments().pop(), /merge conflict/);
    t.g.mergeable = true;
    t.g.labels = [];
    assert.deepEqual(outcomes(await t.tick()), ['auto-merge']);
  } finally { t.cleanup(); }
});

test('one PR at a time: while the shared lock is held the loop does nothing', async () => {
  const t = setup();
  try {
    const held = acquireLock(t.stateDir, { repo: 'nirmaansoftware/ip-nirmaan', pr: 9 });
    assert.deepEqual(outcomes(await t.tick()), ['busy']);
    assert.equal(t.calls().length, 0);
    held.release();
    assert.deepEqual(outcomes(await t.tick()), ['auto-merge']);
  } finally { t.cleanup(); }
});

test('one pass handles every PR with an action ready: a review, fix, update, CI wait or busy lock on one PR never ends the pass', async () => {
  const stateDir = mkdtempSync(join(tmpdir(), 'pr-loop-tick-'));
  try {
    // PR 3 is in a fix round, so it goes first; the rest by number.
    mkdirSync(join(stateDir, 'loop'), { recursive: true });
    writeFileSync(join(stateDir, 'loop', `${CONFIG.repo.replace('/', '_')}-pr-3.json`), JSON.stringify({ pr: 3, rounds: 1, seen: {}, lastFixHead: 'abc', done: null, stopped: null }));
    const outcome = { 1: 'ready', 2: 'wait', 3: 'fixed', 4: 'busy', 5: 'updated', 6: 'stopped' };
    const seen = [];
    const results = await runTick({
      config: CONFIG, stateDir,
      github: { listOpenPulls: async () => [6, 5, 4, 3, 2, 1].map((number) => ({ number })) },
      stepPr: async (o, p) => { seen.push(p.number); return { outcome: outcome[p.number] }; },
    });
    assert.deepEqual(seen, [3, 1, 2, 4, 5, 6]);
    assert.deepEqual(results.map((r) => `${r.pr}:${r.outcome}`), ['3:fixed', '1:ready', '2:wait', '4:busy', '5:updated', '6:stopped']);
  } finally { rmSync(stateDir, { recursive: true, force: true }); }
});

test('a step that arms auto-merge ends the pass; later PRs wait for the next pass', async () => {
  const stateDir = mkdtempSync(join(tmpdir(), 'pr-loop-tick-'));
  try {
    const outcome = { 1: 'wait', 2: 'auto-merge', 3: 'ready', 4: 'updated' };
    const seen = [];
    const results = await runTick({
      config: CONFIG, stateDir,
      github: { listOpenPulls: async () => [4, 3, 2, 1].map((number) => ({ number })) },
      stepPr: async (o, p) => { seen.push(p.number); return { outcome: outcome[p.number] }; },
    });
    assert.deepEqual(seen, [1, 2]);
    assert.deepEqual(results.map((r) => `${r.pr}:${r.outcome}`), ['1:wait', '2:auto-merge']);
  } finally { rmSync(stateDir, { recursive: true, force: true }); }
});

test('main moved by an outside merge mid-pass ends the pass before the next step; an unreadable main does too', async () => {
  const stateDir = mkdtempSync(join(tmpdir(), 'pr-loop-tick-'));
  try {
    let main = 'm1';
    const seen = [];
    const run = (mainSha) => runTick({
      config: CONFIG, stateDir, mainStart: 'm1', mainSha,
      github: { listOpenPulls: async () => [1, 2, 3, 4].map((number) => ({ number })) },
      // The founder merges another PR while PR 2 is being reviewed.
      stepPr: async (o, p) => { seen.push(p.number); if (p.number === 2) main = 'm2'; return { outcome: 'wait' }; },
    });
    const results = await run(async () => main);
    assert.deepEqual(seen, [1, 2]);
    assert.deepEqual(results.map((r) => `${r.pr}:${r.outcome}`), ['1:wait', '2:wait']);
    seen.length = 0;
    assert.deepEqual(await run(async () => { throw new Error('ls-remote failed'); }), []);
    assert.deepEqual(seen, []);
  } finally { rmSync(stateDir, { recursive: true, force: true }); }
});

test('--no-post: the fix is committed locally and never pushed', async () => {
  const t = setup({ reviews: [fail('bad')] });
  try {
    assert.deepEqual(outcomes(await t.tick({ post: 'none' })), ['fixed-not-pushed']);
    assert.equal(t.originHead(), t.firstHead);
    assert.equal(t.posts.length, 0);
  } finally { t.cleanup(); }
});

// ---------------------------------------------------------------- units

// ---------------------------------------------------------------- per-phase log

const phases = (t) => t.log().filter((l) => l.kind === 'phase');

test('per-phase log: a review step appends one line with CI green time, lock wait, each key\'s start and end, verdicts, findings by severity and the outcome; then one "merged" line; nothing under the repository', async () => {
  const t = setup();
  try {
    assert.deepEqual(outcomes(await t.tick()), ['auto-merge']);
    const p = phases(t);
    assert.equal(p.length, 1, 'one line per review step');
    const l = p[0];
    assert.equal(l.pr, 1);
    assert.equal(l.head, t.firstHead);
    assert.equal(l.ci_green_at, '2026-10-17T00:00:00Z', 'the latest completed_at of the required CI runs');
    assert.equal(l.lock_wait_ms, 0);
    for (const k of ['step_started_at', 'step_ended_at']) assert.match(l[k], /^\d{4}-\d\d-\d\dT/);
    assert.match(l.key1.started_at, /^\d{4}-/);
    assert.ok(l.key1.ended_at >= l.key1.started_at);
    assert.deepEqual(l.key1.teams.map((k) => [k.team, k.role, k.status]), [['engineering', 'principal-architect', 'pass']]);
    assert.deepEqual(l.key1.teams[0].findings, { blocker: 0, critical: 0, major: 0, minor: 0, info: 0 });
    assert.equal(l.key1.teams[0].validation_error, null);
    assert.equal(l.key2.status, 'pass');
    assert.equal(l.key2.role, CONFIG.key2_role);
    assert.ok(l.key2.started_at >= l.key1.ended_at, 'key 2 runs after key 1');
    assert.equal(l.proxy, null, 'no founder class, no proxy');
    assert.equal(l.outcome, 'auto-merge');
    assert.equal(l.stop_reason, null);
    assert.equal(l.stop_class, null);
    assert.equal(l.merged, false, 'the step arms auto-merge; the merge comes later');
    // GitHub merges it: the next pass logs one "merged" line, once.
    t.g.closed = true; t.g.merged = true;
    await t.tick();
    await t.tick();
    const m = t.log().filter((x) => x.event === 'merged');
    assert.equal(m.length, 1);
    assert.equal(m[0].merged_at, '2026-10-17T01:00:00Z');
    assert.equal(m[0].head, t.firstHead);
    assert.equal(m[0].merge_sha, 'c'.repeat(40));
    // The log is in the state directory, outside the repository.
    assert.ok(existsSync(join(t.stateDir, 'calls.jsonl')));
    assert.ok(!t.stateDir.startsWith(t.work));
    assert.equal(sh(t.work, 'status', '--porcelain', '--untracked-files=all'), '', 'nothing written under the repository');
  } finally { t.cleanup(); }
});

test('per-phase log: lock wait is measured from the first pass the lock was busy for this head', async () => {
  const t = setup();
  try {
    const held = acquireLock(t.stateDir, { repo: 'nirmaansoftware/ip-nirmaan', pr: 9 });
    assert.deepEqual(outcomes(await t.tick()), ['busy']);
    assert.equal(phases(t).length, 0, 'no review ran, no phase line');
    await new Promise((r) => setTimeout(r, 30));
    held.release();
    assert.deepEqual(outcomes(await t.tick()), ['auto-merge']);
    assert.ok(phases(t)[0].lock_wait_ms >= 30, `lock wait ${phases(t)[0].lock_wait_ms}`);
    assert.equal(t.state().lockWait, undefined, 'cleared once taken');
  } finally { t.cleanup(); }
});

test('per-phase log: a stop records its reason and class, in the stop line and the phase line; a validation deferral records the validator\'s error', async () => {
  const cases = [
    [{ reviews: [{ verdict: 'fail', findings: [{ file: 'os/app.js', line: 999, severity: 'critical', text: 'x' }] }] }, 'validation', /does not exist at the head/],
    [{ reviews: [{ type: 'rate_limit' }] }, 'rate-limit', null],
    [{ reviews: [fail('bad')], fixes: [{ edits: { '.github/review-teams.yml': 'teams: []\n' } }] }, 'fixer-forbidden-path', null],
    [{ reviews: [fail('bad')], fixes: [{ status: 'needs_founder', notAddressed: [{ id: 'F1', reason: 'PR text' }] }] }, 'loop-may-not-fix', null],
  ];
  for (const [s, cls, verr] of cases) {
    const t = setup(s);
    try {
      assert.deepEqual(outcomes(await t.tick()), ['stopped']);
      assert.ok(STOP_CLASSES.includes(cls));
      const stopLine = t.log().filter((l) => l.event === 'stopped').pop();
      assert.equal(stopLine.class, cls);
      const p = phases(t).pop();
      assert.equal(p.outcome, 'stopped');
      assert.equal(p.stop_class, cls);
      assert.equal(p.stop_reason, stopLine.reason);
      assert.equal(t.state().stopped.class, cls);
      if (verr) assert.match(p.key1.teams[0].validation_error, verr);
      if (cls === 'rate-limit') assert.equal(p.key1.teams[0].call_outcome, 'rate_limit');
      if (cls === 'fixer-forbidden-path') assert.deepEqual(p.key1.teams[0].findings, { blocker: 0, critical: 1, major: 0, minor: 0, info: 0 });
      assert.ok(t.labeled(), 'stops still label needs-founder (unchanged here)');
    } finally { t.cleanup(); }
  }
});

// ---------------------------------------------------------------- stops and locks (L4)

test('a fail with a finding only the author can fix (a forbidden path, or the PR text): author-fix label and the proposed change, no fixer run, no needs-founder; a new head clears it', async () => {
  for (const finding of [{ file: '.github/review-teams.yml', line: 1 }, { file: PR_TEXT_FILE, line: 1 }, { file: 'agents/orchestrator/agent.md', line: 1 }]) {
    const t = setup({ reviews: [{ verdict: 'fail', findings: [{ ...finding, severity: 'critical', text: 'say what the change does' }] }, { verdict: 'pass' }] });
    try {
      assert.deepEqual(outcomes(await t.tick()), ['author-fix'], finding.file);
      assert.equal(t.calls().filter((c) => c.kind === 'fixes').length, 0, 'no fixer process');
      assert.ok(t.g.labels.includes('author-fix'));
      assert.ok(!t.labeled(), 'no needs-founder');
      assert.match(t.comments().pop(), /the author fixes this[\s\S]*\| author \| say what the change does/i);
      const p = t.log().filter((l) => l.kind === 'phase').pop();
      assert.equal(p.stop_class, 'author-fix');
      assert.deepEqual(outcomes(await t.tick()), ['skip'], 'nothing more on this head');
      // The author pushes a fix.
      sh(t.work, 'checkout', '-q', 'feature'); write(t.work, 'os/app.js', 'author fix\n'); sh(t.work, 'commit', '-qam', 'fix'); sh(t.work, 'push', '-q', 'origin', 'feature'); sh(t.work, 'checkout', '-q', 'main');
      assert.deepEqual(outcomes(await t.tick()), ['auto-merge']);
      assert.ok(!t.g.labels.includes('author-fix'), 'the label comes off');
    } finally { t.cleanup(); }
  }
});

test('a fail mixing loop-fixable and author-only findings goes to the author; all loop-fixable goes to the fixer', async () => {
  const t = setup({ reviews: [{ verdict: 'fail', findings: [{ file: 'os/app.js', line: 1, severity: 'critical', text: 'a' }, { file: '.github/review-teams.yml', line: 1, severity: 'blocker', text: 'b' }] }] });
  try {
    assert.deepEqual(outcomes(await t.tick()), ['author-fix']);
    assert.match(t.comments().pop(), /\| loop \| a[\s\S]*\| author \| b/);
  } finally { t.cleanup(); }
});

test('a transient error retries on later passes up to transient_retries, then stops with class transient; one passing blip just retries', async () => {
  const t = setup();
  try {
    t.g.failGetPull = 99;
    for (let i = 0; i < LOOP.transient_retries; i++) {
      assert.deepEqual(outcomes(await t.tick()), ['retry']);
      assert.ok(!t.labeled());
    }
    assert.deepEqual(outcomes(await t.tick()), ['stopped']);
    assert.ok(t.labeled());
    assert.equal(t.log().filter((l) => l.event === 'stopped').pop().class, 'transient');
    assert.match(t.comments().pop(), /still failing after 3 retries/);
  } finally { t.cleanup(); }
  const b = setup();
  try {
    b.g.failGetPull = 1;
    assert.deepEqual(outcomes(await b.tick()), ['retry']);
    assert.deepEqual(outcomes(await b.tick()), ['auto-merge']);
    assert.ok(!b.labeled());
  } finally { b.cleanup(); }
});

test('a fixer process that fails retries the round on later passes, never stopping as a repeated finding; then the round runs and merges, and three failures stop as transient', async () => {
  const t = setup({ reviews: [fail('bad'), { verdict: 'pass' }], fixes: [{ type: 'crash' }, { edits: { 'os/app.js': 'fixed\n' } }] });
  try {
    assert.deepEqual(outcomes(await t.tick()), ['retry']);
    assert.deepEqual(t.state().seen, {}, 'not a fix attempt');
    assert.deepEqual(outcomes(await t.tick()), ['fixed'], 'the round runs again on the cached verdicts');
    assert.deepEqual(outcomes(await t.tick()), ['auto-merge']);
    assert.ok(!t.labeled());
  } finally { t.cleanup(); }
  const b = setup({ reviews: [fail('bad')], fixes: [{ type: 'crash' }] });
  try {
    for (let i = 0; i < LOOP.transient_retries; i++) assert.deepEqual(outcomes(await b.tick()), ['retry']);
    assert.deepEqual(outcomes(await b.tick()), ['stopped']);
    assert.equal(b.log().filter((l) => l.event === 'stopped').pop().class, 'transient');
    assert.doesNotMatch(b.comments().pop(), /same finding failed again/);
  } finally { b.cleanup(); }
});

test('a failed push retries the round on a later pass, not a repeated finding', async () => {
  const t = setup({ reviews: [fail('bad'), { verdict: 'pass' }], fixes: [{ edits: { 'os/app.js': 'fixed\n' } }] });
  try {
    // The origin refuses the first push (a hook that fails once).
    const hook = join(t.origin, 'hooks', 'pre-receive');
    writeFileSync(hook, `#!/bin/sh\nif [ -f "${join(t.tmp, 'pushed-once')}" ]; then exit 0; fi\ntouch "${join(t.tmp, 'pushed-once')}"\necho refused >&2\nexit 1\n`); chmodSync(hook, 0o755);
    assert.deepEqual(outcomes(await t.tick()), ['retry']);
    assert.equal(t.originHead(), t.firstHead, 'nothing pushed');
    assert.deepEqual(t.state().seen, {});
    assert.deepEqual(outcomes(await t.tick()), ['fixed']);
    assert.notEqual(t.originHead(), t.firstHead);
  } finally { t.cleanup(); }
});

test('a PR stacked on another open PR waits for it; one on an unknown branch is skipped as before', async () => {
  const t = setup();
  try {
    const listed = { ...(await t.github.getPull()), baseRef: 'feature-a' };
    const r = await stepPr({ ...t.o(), openPulls: [{ number: 7, headRef: 'feature-a' }] }, listed);
    assert.deepEqual([r.outcome, r.reason], ['wait', 'stacked on #7; waits for it to merge']);
    const s = await stepPr({ ...t.o(), openPulls: [] }, listed);
    assert.equal(s.outcome, 'skip');
    assert.equal(t.calls().length, 0);
  } finally { t.cleanup(); }
});

// A local check that fails when any review lock or model slot is held.
const lockFreeCheck = (stateDir) => ({ name: 'repo-checks', when: ['**'], cwd: '.', run: [['node', '-e', `const fs=require('fs');const d=${JSON.stringify(stateDir)};process.exit(fs.readdirSync(d).some((f)=>/\\.lock$/.test(f))?1:0)`]] });

test('lock_mode "calls": the review lock is released before the fixer and the local checks; "step" (today) holds it through the fix round', async () => {
  const stateFor = (t) => t.stateDir;
  const calls = setup({ reviews: [fail('bad'), { verdict: 'pass' }] });
  try {
    const loop = { ...LOOP, lock_mode: 'calls', checks: [lockFreeCheck(stateFor(calls))] };
    assert.deepEqual(outcomes(await calls.tick({ loop })), ['fixed'], 'the local check found no lock held');
  } finally { calls.cleanup(); }
  const step = setup({ reviews: [fail('bad'), { verdict: 'pass' }] });
  try {
    const loop = { ...LOOP, lock_mode: 'step', checks: [lockFreeCheck(stateFor(step))] };
    assert.deepEqual(outcomes(await step.tick({ loop })), ['stopped'], 'today: the lock is held during the local checks');
    assert.match(step.comments().pop(), /the local check repo-checks failed/);
  } finally { step.cleanup(); }
});

test('lock_mode "calls": with model_cap 2 the two repositories review at once, never more; with cap 1, or with the switch off, one at a time', async () => {
  for (const [loopExtra, want] of [[{ lock_mode: 'calls', model_cap: 2 }, 'auto-merge'], [{ lock_mode: 'calls', model_cap: 1 }, 'busy'], [{ lock_mode: 'step' }, 'busy']]) {
    const t = setup();
    try {
      // ip-nirmaan's loop is reviewing: it holds the shared lock (slot 0).
      const ip = acquireLock(t.stateDir, { repo: 'nirmaansoftware/ip-nirmaan', pr: 9 });
      assert.deepEqual(outcomes(await t.tick({ loop: { ...LOOP, ...loopExtra } })), [want], JSON.stringify(loopExtra));
      ip.release();
    } finally { t.cleanup(); }
  }
  const t = setup();
  try {
    const ip = acquireLock(t.stateDir, { repo: 'nirmaansoftware/ip-nirmaan', pr: 9 });
    const other = acquireLock(t.stateDir, { repo: 'x', pr: 1 }, { name: 'model-slot-1.lock' });
    assert.deepEqual(outcomes(await t.tick({ loop: { ...LOOP, lock_mode: 'calls', model_cap: 2 } })), ['busy'], 'both slots taken: never more than the cap');
    ip.release(); other.release();
  } finally { t.cleanup(); }
});

test('phaseRecord: key 1 span over teams; null keys when not run', () => {
  const k = (team, s, e) => ({ team, role: `${team}-lead`, status: 'pass', startedAt: s, endedAt: e, verdict: { findings: [{ severity: 'minor' }, { severity: 'minor' }, { severity: 'info' }] } });
  const r = phaseRecord({ ciGreenAt: 'g', lockWaitMs: 5, startedAt: 'a', endedAt: 'b', review: { key1: [k('x', '2026-01-01T00:00:02Z', '2026-01-01T00:00:03Z'), k('y', '2026-01-01T00:00:01Z', '2026-01-01T00:00:09Z')], key2: null, proxy: null }, result: { outcome: 'fixed' } });
  assert.equal(r.key1.started_at, '2026-01-01T00:00:01Z');
  assert.equal(r.key1.ended_at, '2026-01-01T00:00:09Z');
  assert.deepEqual(r.key1.teams[0].findings, { blocker: 0, critical: 0, major: 0, minor: 2, info: 1 });
  assert.equal(r.key2, null);
  assert.equal(r.stop_class, null);
  assert.equal(r.outcome, 'fixed');
});

test('findingsToFix takes a failed Founder Proxy\'s findings too', () => {
  const f = findingsToFix({ key1: [{ key: 1, team: 'eng', status: 'pass', verdict: { findings: [] } }], key2: { key: 2, team: null, status: 'pass', verdict: { findings: [] } }, proxy: { key: 'proxy', team: null, role: 'founder-proxy', status: 'fail', verdict: { findings: [{ file: 'a', line: 3, severity: 'blocker', text: 'p' }] } } });
  assert.deepEqual(f.map((x) => [x.id, x.key, x.team, x.text]), [['F1', 'proxy', 'founder-proxy', 'p']]);
});

test('fingerprint ignores line, case and spacing; findingsToFix takes blocking findings of failed keys', () => {
  assert.equal(fingerprint({ key: 1, team: 'x', file: 'a', text: 'Foo  bar' }), fingerprint({ key: 1, team: 'x', file: 'a', text: 'foo bar', line: 9 }));
  assert.notEqual(fingerprint({ key: 1, team: 'x', file: 'a', text: 'foo' }), fingerprint({ key: 1, team: 'x', file: 'b', text: 'foo' }));
  const f = findingsToFix({ key1: [{ key: 1, team: 'eng', role: 'pa', status: 'fail', verdict: { findings: [{ file: 'a', line: 1, severity: 'minor', text: 'm' }, { file: 'a', line: 2, severity: 'critical', text: 'c' }] } }, { key: 1, team: 'pq', status: 'pass', verdict: { findings: [{ file: 'b', line: 1, severity: 'critical', text: 'x' }] } }], key2: null });
  assert.deepEqual(f.map((x) => [x.id, x.text]), [['F1', 'c']]);
});

test('validateFixerOutput and forbiddenChanges', () => {
  const fs = [{ id: 'F1' }, { id: 'F2' }];
  assert.ok(validateFixerOutput({ status: 'fixed', addressed: ['F1', 'F2'], not_addressed: [], summary: 's' }, fs).ok);
  assert.match(validateFixerOutput({ status: 'fixed', addressed: ['F1'], not_addressed: [], summary: 's' }, fs).error, /F2 not accounted for/);
  assert.match(validateFixerOutput({ status: 'fixed', addressed: ['F9'], not_addressed: [], summary: 's' }, fs).error, /unknown finding id/);
  assert.match(validateFixerOutput({ status: 'merged', addressed: [], not_addressed: [], summary: '' }, fs).error, /status/);
  const io = { readBefore: () => '# x\n\n## Key 1 review\nold\n\n## Other\na\n', readAfter: () => '# x\n\n## Key 1 review\nold\n\n## Other\nb\n' };
  const rules = { forbidden: REAL_LOOP.fixer_forbidden, sections: REAL_LOOP.review_sections };
  assert.deepEqual(forbiddenChanges(['os/a.ts'], rules, io), []);
  // agents/** is forbidden whole: the specs, the org chart to come and the
  // review sections in them are founder class A.
  assert.deepEqual(forbiddenChanges(['agents/sre/agent.md', 'os/a.ts'], rules, io).map((b) => b.path), ['agents/sre/agent.md'], 'even a non-review section of a spec');
  assert.equal(forbiddenChanges(['agents/sre/agent.md'], rules, { ...io, readAfter: () => '# x\n\n## Key 1 review\nnew\n' }).length, 1);
  for (const p of ['.github/workflows/os.yml', '.github/review-teams.yml', 'agents/founder-proxy/agent.md', 'agents/README.md', 'agents/org-chart.yml', 'agents/new-role/agent.md', '.github/scripts/pr-loop/pr-loop.mjs', '.claude/skills/pr-review/SKILL.md', '.claude/settings.json', 'AGENTS.md', 'package.json', 'os/package-lock.json', 'docs/operations/pr-loop.plist']) {
    assert.equal(forbiddenChanges([p], rules, io).length, 1, p);
  }
  const a = fixerArgs({ model: 'm', systemPrompt: 's', forbidden: ['.github/**'] });
  assert.deepEqual(a[a.indexOf('--disallowedTools') + 1].split(',').slice(-2), ['Edit(./.github/**)', 'Write(./.github/**)']);
});

test('ciState: missing or running is pending, any other conclusion is a failure', () => {
  const req = ['a', 'b'];
  assert.equal(ciState(req, [{ name: 'a', status: 'completed', conclusion: 'success' }]).state, 'pending');
  assert.equal(ciState(req, [{ name: 'a', status: 'completed', conclusion: 'success' }, { name: 'b', status: 'completed', conclusion: 'cancelled' }]).state, 'failed');
  assert.equal(ciState(req, [{ name: 'a', status: 'completed', conclusion: 'success' }, { name: 'b', status: 'completed', conclusion: 'success' }]).state, 'green');
});

test('ciState: the newest run of each job decides, and a rerun in progress is pending, never an older success', () => {
  const req = ['a'];
  const run = (id, startedAt, status, conclusion, completedAt) => ({ id, name: 'a', status, conclusion, startedAt, completedAt });
  // A rerun has no completed_at while it runs; an older success must not win.
  assert.equal(ciState(req, [run(1, '2026-10-17T00:00:00Z', 'completed', 'success', '2026-10-17T00:05:00Z'), run(2, '2026-10-17T01:00:00Z', 'in_progress', null, null)]).state, 'pending');
  assert.equal(ciState(req, [run(2, '2026-10-17T01:00:00Z', 'queued', null, null), run(1, '2026-10-17T00:00:00Z', 'completed', 'failure', '2026-10-17T00:05:00Z')]).state, 'pending');
  // Newest by start time (then id), not by completion time.
  assert.equal(ciState(req, [run(1, '2026-10-17T00:00:00Z', 'completed', 'success', '2026-10-17T02:00:00Z'), run(2, '2026-10-17T01:00:00Z', 'completed', 'failure', '2026-10-17T01:05:00Z')]).state, 'failed');
  assert.equal(ciState(req, [run(1, '2026-10-17T00:00:00Z', 'completed', 'failure', '2026-10-17T02:00:00Z'), run(2, '2026-10-17T01:00:00Z', 'completed', 'success', '2026-10-17T01:05:00Z')]).state, 'green');
  assert.equal(ciState(req, [run(5, '2026-10-17T00:00:00Z', 'completed', 'failure', null), run(6, '2026-10-17T00:00:00Z', 'completed', 'success', null)]).state, 'green', 'same start: the higher id is newer');
});
