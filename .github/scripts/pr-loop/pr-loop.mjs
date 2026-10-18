#!/usr/bin/env node
// The automated review loop ("driver"): for each open PR by the agents'
// account it waits for CI, runs the two-key review (review.mjs), and then
// either takes the merge path or, when a key failed with findings, starts a
// separate fixer process, checks and pushes its fix, and lets the new head
// be reviewed again from scratch. How it runs: docs/operations/pr-review.md
// ("Automated loop").
//
// One step per PR per call, as a state machine, so the loop survives restarts
// and a step never waits on CI:
//   skip     draft, fork, other author, `hold` or `needs-founder` label, or
//            this head already finished (ready, auto-merge, founder wait);
//   wait     required CI not finished on the head;
//   stop     CI failed on a head the loop pushed, a merge conflict, a key
//            deferred (rate limit, bad output, missing spec), a repeated
//            finding, the round limit, a forbidden path, a failed local
//            check, or any error: label `needs-founder` and say why;
//   review   both keys (fresh read-only processes, review.mjs);
//   merge    both keys passed: `gh pr merge --auto --merge` with the gh login
//            when the review App posts the checks and the repository's
//            allow_auto_merge field (read with gh) is true; a "ready" comment
//            in a dry run or when it is false; the field unreadable or any
//            merge error stops. Founder-class PRs are never merged
//            by the loop: it waits for the founder's GitHub approval and the
//            founder merges;
//   fix      a key failed: a fresh fixer `claude -p` in a clean worktree of
//            the head, write tools only there; the loop (never the model)
//            regenerates, commits, runs the checks and pushes.
//
// Usage: node .github/scripts/pr-loop/pr-loop.mjs (--once | --watch) [--pr <n>]
//          [--interval-minutes 5] [--no-post]
// Exit: 0 done, 2 setup error, 4 refused (this copy differs from main).

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globMatch } from '../review-teams.mjs';
import { acquireLock, logCall, nonce, parseNameStatusZ, parseVerdictText, redact, requiredCi } from '../pr-review/lib.mjs';
import { reviewerEnv, runOnce } from '../pr-review/claude.mjs';
import { appConfigFromEnv, createClient, ghToken, installationToken } from '../pr-review/github.mjs';
import { defaults, differsFromMain, EXIT, runReview } from '../pr-review/review.mjs';
import { findingsToFix, fixerArgs, fixerSystemPrompt, fixerUserPrompt, forbiddenChanges, validateFixerOutput } from './fixer.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MARK = 'nirmaan-pr-loop';

export function loopDefaults(env = process.env) {
  return {
    ...defaults(env),
    fixerModel: env.NIRMAAN_LOOP_MODEL_FIXER || 'sonnet',
    fixerTimeoutMs: Number(env.NIRMAAN_LOOP_FIXER_TIMEOUT_SECONDS || 1800) * 1000,
    checkTimeoutMs: Number(env.NIRMAAN_LOOP_CHECK_TIMEOUT_SECONDS || 1200) * 1000,
    gitName: env.NIRMAAN_LOOP_GIT_NAME || null,
    gitEmail: env.NIRMAAN_LOOP_GIT_EMAIL || null,
  };
}

function git(cwd, args, opts = {}) {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

// A failed gh call, classified by what it is (gh missing, a timeout, or its
// exit code) with its output after; stop() redacts it before posting.
function ghFailure(e) {
  const kind = e?.code === 'ENOENT' ? 'gh not found' : e?.code === 'ETIMEDOUT' || e?.signal ? `gh ${e.signal ? `killed by ${e.signal}` : 'timed out'}` : `exit ${e?.status ?? 'unknown'}`;
  const detail = `${e?.stderr ?? ''} ${e?.stdout ?? ''}`.replace(/\s+/g, ' ').trim() || String(e?.message ?? '');
  return `(${kind}): ${detail.slice(0, 500)}`;
}

const esc = (s, max = 400) => {
  let t = String(s ?? '').replace(/\r/g, '').replace(/<!--|-->/g, '').replace(/\n+/g, ' ').replace(/\|/g, '\\|').replace(/@/g, '@\u200b');
  if (t.length > max) t = `${t.slice(0, max)}...`;
  return t;
};

// ---------------------------------------------------------------- state

function statePath(stateDir, repo, pr) { return join(stateDir, 'loop', `${repo.replace('/', '_')}-pr-${pr}.json`); }
export function loadState(stateDir, repo, pr) {
  try { return JSON.parse(readFileSync(statePath(stateDir, repo, pr), 'utf8')); } catch { return { pr, rounds: 0, seen: {}, lastFixHead: null, done: null, stopped: null }; }
}
function saveState(stateDir, repo, st) {
  mkdirSync(join(stateDir, 'loop'), { recursive: true });
  writeFileSync(statePath(stateDir, repo, st.pr), JSON.stringify(st, null, 2));
}

// ---------------------------------------------------------------- CI

// The same reading of CI as the review (lib.mjs requiredCi): the newest run
// of each job, and a run still in progress is pending.
export function ciState(required, runs) {
  const ci = requiredCi(required, runs);
  return { state: ci.state, jobs: ci.jobs.map((j) => ({ name: j.name, state: j.conclusion })), text: ci.text };
}

// ---------------------------------------------------------------- commands

// Runs one configured command list in `cwd` with the token-free environment.
function runCommands(list, cwd, vars, timeoutMs) {
  for (const argv of list) {
    const args = argv.map((a) => a.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)));
    const r = spawnSync(args[0], args.slice(1), { cwd, env: reviewerEnv(), encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) {
      const tail = `${r.stderr ?? ''}\n${r.stdout ?? ''}`.trim().split('\n').slice(-5).join(' / ');
      return { ok: false, command: args.join(' '), detail: r.error ? r.error.message : `exit ${r.status}: ${tail.slice(0, 400)}` };
    }
  }
  return { ok: true };
}

const applies = (entry, changed) => changed.some((p) => entry.when.some((g) => globMatch(g, p)));

// Paths changed in a worktree, tracked or not, including renames' sources.
function worktreeChanges(dir) {
  const out = git(dir, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const parts = out.split('\0').filter(Boolean);
  const paths = [];
  for (let i = 0; i < parts.length; i++) {
    const s = parts[i];
    paths.push(s.slice(3));
    if (s[0] === 'R' || s[0] === 'C') paths.push(parts[++i]);
  }
  return [...new Set(paths)];
}

// ---------------------------------------------------------------- one PR

// One step for one PR. Returns { outcome, reason? }. `o` = { repoRoot, config
// (review config), loop (loop config), github, post, claudeBin, stateDir,
// models, fixerModel, timeoutMs, fixerTimeoutMs, checkTimeoutMs, backoffMs,
// sleep, out, runGh, gitName, gitEmail, inClaudeSession, callerBranch }.
export async function stepPr(o, listed) {
  const cfg = o.config, lc = o.loop, out = o.out ?? ((s) => console.log(s));
  const n = listed.number;
  const st = loadState(o.stateDir, cfg.repo, n);
  const log = (event, extra = {}) => logCall(o.stateDir, { kind: 'loop', repo: cfg.repo, pr: n, head: listed.headSha, round: st.rounds, event, ...extra });
  const skip = (why) => { out(`pr-loop: #${n} skipped: ${why}`); return { outcome: 'skip', reason: why }; };

  if (listed.draft) return skip('draft');
  if (listed.headRepo !== cfg.repo || listed.baseRef !== cfg.base_branch) return skip('not a same-repository PR to main');
  if (!lc.authors.includes(listed.author)) return skip(`author ${listed.author} is not the agents' account`);
  if (listed.labels.includes(cfg.hold_label)) return skip(`"${cfg.hold_label}" label`);
  if (listed.labels.includes(lc.needs_founder_label)) return skip(`"${lc.needs_founder_label}" label`);
  if (st.stopped?.labeled) {
    // The founder removed the label: resume with a fresh round count.
    out(`pr-loop: #${n} resumes: the "${lc.needs_founder_label}" label was removed`);
    Object.assign(st, { rounds: 0, seen: {}, lastFixHead: null, done: null, stopped: null });
    saveState(o.stateDir, cfg.repo, st);
    log('resumed');
  }
  if (st.stopped && st.stopped.head === listed.headSha) return skip(`stopped on this head: ${st.stopped.reason}`);
  if (st.stopped) st.stopped = null; // unlabeled (--no-post) stop on an older head

  const say = async (body) => {
    if (o.post === 'none') { out(`----- comment (not posted)\n${body}`); return null; }
    return (await o.github.createComment(n, body)).url;
  };
  const stop = async (head, why) => {
    // Reasons can carry gh or git error text: redacted before it is logged,
    // saved or posted.
    const reason = redact(why);
    out(`pr-loop: #${n} stopped: ${reason}`);
    st.stopped = { head, reason, at: new Date().toISOString(), labeled: false };
    saveState(o.stateDir, cfg.repo, st);
    log('stopped', { reason });
    try {
      if (o.post !== 'none') { await o.github.addLabels(n, [lc.needs_founder_label]); st.stopped.labeled = true; saveState(o.stateDir, cfg.repo, st); }
      await say([
        `<!-- ${MARK} stop head=${head} -->`,
        '### Automated loop stopped',
        '',
        `Head \`${head}\`, after ${st.rounds} fix round${st.rounds === 1 ? '' : 's'}: ${esc(reason, 1500)}`,
        '',
        `The loop does nothing more on this PR while the \`${lc.needs_founder_label}\` label is set. Remove the label to let it resume (the fix-round count starts again).`,
      ].join('\n'));
    } catch (e) { out(`pr-loop: #${n}: could not label or comment: ${e.message}`); }
    return { outcome: 'stopped', reason };
  };

  try {
    const pull = await o.github.getPull(n);
    const head = pull.headSha;
    const founderApproval = async () => {
      const mine = (await o.github.listReviews(n)).filter((r) => r.login === cfg.founder_login && ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(r.state));
      const last = mine[mine.length - 1];
      return !!last && last.state === 'APPROVED' && last.commitId === head;
    };
    if (st.done?.head === head) {
      if (st.done.outcome !== 'founder-wait' || st.done.founderRerun) return skip(`${st.done.outcome} on this head`);
      if (!(await founderApproval())) return skip("waiting for the founder's approval on this head");
    }
    if (pull.mergeable === false || pull.mergeableState === 'dirty') return await stop(head, 'the branch has a merge conflict with main; a person resolves it');

    const ci = ciState(cfg.required_ci, await o.github.listCheckRuns(head));
    if (ci.state === 'pending') { out(`pr-loop: #${n} waiting for CI on ${head.slice(0, 7)}: ${ci.text}`); return { outcome: 'wait', reason: ci.text }; }
    if (ci.state === 'failed') {
      if (st.lastFixHead === head) return await stop(head, `CI failed after fix round ${st.rounds} (${ci.text})`);
      return skip(`CI failed on ${head.slice(0, 7)} (${ci.text}); the author fixes it`);
    }

    // One PR at a time across both repositories: the review's lock, held
    // for the review and the fix round together.
    const lock = acquireLock(o.stateDir, { repo: cfg.repo, pr: n, by: 'pr-loop' });
    if (!lock.ok) return { outcome: 'busy', reason: `lock held by ${lock.holder ? `${lock.holder.repo} #${lock.holder.pr}` : 'another process'}` };
    try {
      log('review', { ci: ci.text });
      const r = await runReview({
        repoRoot: o.repoRoot, pr: n, config: cfg, github: o.github, post: o.post, claudeBin: o.claudeBin, stateDir: o.stateDir,
        models: o.models, timeoutMs: o.timeoutMs, backoffMs: o.backoffMs, sleep: o.sleep, out, heldLock: true,
        callerBranch: o.callerBranch, inClaudeSession: o.inClaudeSession,
      });
      if (r.exit === EXIT.headMoved) { log('head-moved'); return { outcome: 'head-moved' }; }
      if (r.exit === EXIT.refused) { st.done = { head, outcome: 'refused' }; saveState(o.stateDir, cfg.repo, st); return { outcome: 'skip', reason: r.reason }; }
      if (r.exit !== EXIT.ok) return await stop(head, `the review exited ${r.exit}`);
      if (r.waiting) return { outcome: 'wait', reason: r.waiting };
      if (r.ciFailed) return st.lastFixHead === head ? await stop(head, `CI failed after fix round ${st.rounds} (${r.ciFailed})`) : skip(`${r.ciFailed}; the author fixes it`);
      if (r.deferred) return await stop(head, `review deferred: ${r.deferred}`);
      const k1 = r.key1 ?? [];
      const deferred = [...k1, ...(r.key2 ? [r.key2] : [])].filter((k) => k.status === 'deferred');
      if (k1.length === 0) return await stop(head, 'review deferred: no owning team');
      if (deferred.length) return await stop(head, `review deferred (${deferred.map((k) => `${k.teamName}: ${k.reason}`).join('; ')})`);
      const failed = [...k1, ...(r.key2 ? [r.key2] : [])].filter((k) => k.status === 'fail');
      log('reviewed', { key1: k1.map((k) => `${k.team}:${k.status}`).join(','), key2: r.key2?.status ?? 'not run' });

      if (failed.length === 0) return await mergePath(o, { n, head, st, r, say, stop, log, founderApproval });
      return await fixRound(o, { n, head, pull, st, r, say, stop, log, out });
    } finally { lock.release(); }
  } catch (e) {
    return await stop(listed.headSha, `error: ${e.message}`);
  }
}

async function mergePath(o, { n, head, st, r, say, stop, log, founderApproval }) {
  const cfg = o.config;
  const sha7 = head.slice(0, 7);
  const classes = Object.keys(r.classification?.founder ?? {});
  const held = (await o.github.getPull(n)).labels.includes(cfg.hold_label);
  if (held) { log('held'); return { outcome: 'skip', reason: 'hold label set during the review' }; }
  if (classes.length) {
    const approved = await founderApproval();
    const first = st.done?.head !== head;
    st.done = { head, outcome: 'founder-wait', founderRerun: approved };
    saveState(o.stateDir, cfg.repo, st);
    log('founder-wait', { classes: classes.join(','), founder_approved: approved });
    if (first || approved) {
      await say([
        `<!-- ${MARK} ready head=${head} founder=${classes.join(',')} -->`,
        `### Automated loop: both keys passed on \`${sha7}\``,
        '',
        approved
          ? `Founder class ${classes.join(', ')}: the founder's approval of this head is on GitHub, so \`review/executive\` was posted again. The loop never merges a founder-class PR; the founder merges it.`
          : `Founder class ${classes.join(', ')}: this PR waits for the founder's GitHub approval of head \`${sha7}\`. The loop never merges a founder-class PR, and an agent review never stands in for the founder.`,
        '',
        '_Agent review, not a sign-off._',
      ].join('\n'));
    }
    return { outcome: 'founder-wait', reason: approved ? 'founder approved; the founder merges' : 'waiting for the founder' };
  }
  // The repository's "Allow auto-merge" setting decides between auto-merge
  // and "ready": read with the gh login (`allow_auto_merge`, a field, never
  // the wording of an error). Off: ready. On: `gh pr merge --auto`, and any
  // failure of it stops the loop (fails safe). The setting unreadable, or an
  // answer other than true or false: stop as well.
  let why = o.post !== 'app' ? 'the review App is not configured (dry run)' : null;
  if (!why) {
    let allowed;
    try {
      allowed = String(o.runGh(['api', `repos/${cfg.repo}`, '--jq', '.allow_auto_merge']) ?? '').trim();
    } catch (e) {
      return await stop(head, `could not read the repository's auto-merge setting ${ghFailure(e)}`);
    }
    if (allowed === 'false') why = 'the repository does not allow auto-merge';
    else if (allowed !== 'true') return await stop(head, `could not read the repository's auto-merge setting (gh answered "${allowed.slice(0, 40)}", not true or false)`);
  }
  if (!why) {
    try {
      o.runGh(['pr', 'merge', String(n), '--repo', cfg.repo, '--auto', '--merge', '--match-head-commit', head]);
    } catch (e) {
      return await stop(head, `gh pr merge --auto failed ${ghFailure(e)}`);
    }
  }
  if (!why) {
    log('auto-merge');
    await say(`<!-- ${MARK} auto-merge head=${head} -->\n### Automated loop: both keys passed on \`${sha7}\`\n\nAuto-merge is on for this PR: GitHub merges it with a merge commit once every required check passes on this head.\n\n_Agent review, not a sign-off._`);
    st.done = { head, outcome: 'auto-merge' };
  } else {
    log('ready', { why });
    await say(`<!-- ${MARK} ready head=${head} -->\n### Automated loop: ready\n\nBoth keys passed on \`${sha7}\`, waiting for the founder's merge settings: ${why}. The founder merges this PR.\n\n_Agent review, not a sign-off._`);
    st.done = { head, outcome: 'ready' };
  }
  saveState(o.stateDir, cfg.repo, st);
  return { outcome: st.done.outcome };
}

async function fixRound(o, { n, head, pull, st, r, say, stop, log, out }) {
  const cfg = o.config, lc = o.loop;
  const findings = findingsToFix(r);
  if (!findings.length) return await stop(head, 'a key failed without findings to fix');
  const repeated = findings.filter((f) => st.seen[f.fingerprint]);
  if (repeated.length) return await stop(head, `the same finding failed again after a fix: ${repeated.map((f) => `${f.file}:${f.line} ${f.text}`).join('; ')}`);
  for (const f of findings) st.seen[f.fingerprint] = (st.seen[f.fingerprint] ?? 0) + 1;
  saveState(o.stateDir, cfg.repo, st);
  if (st.rounds >= lc.max_fix_rounds) return await stop(head, `${lc.max_fix_rounds} fix rounds done and a key still fails`);
  const round = st.rounds + 1;

  git(o.repoRoot, ['fetch', '--no-tags', '--quiet', 'origin', `+refs/heads/${cfg.base_branch}:refs/pr-review/main`, `+refs/pull/${n}/head:refs/pr-loop/pr-${n}`]);
  if (git(o.repoRoot, ['rev-parse', `refs/pr-loop/pr-${n}`]).trim() !== head) { log('head-moved'); return { outcome: 'head-moved' }; }
  const mainSha = git(o.repoRoot, ['rev-parse', 'refs/pr-review/main']).trim();
  mkdirSync(join(o.stateDir, 'worktrees'), { recursive: true });
  const dir = join(mkdtempSync(join(o.stateDir, 'worktrees', `${cfg.repo.replace('/', '_')}-${n}-fix-`)), 'head');
  git(o.repoRoot, ['worktree', 'add', '--quiet', '--detach', dir, head]);
  try {
    // The fixer's rules come from main, never from the PR.
    const rules = lc.rules_files.map((f) => { try { return `### ${f}\n\n${git(o.repoRoot, ['show', `${mainSha}:${f}`])}`; } catch { return ''; } }).filter(Boolean).join('\n\n');
    const nn = nonce();
    const ctx = { company: cfg.company, repo: cfg.repo, pr: n, headSha: head, nonce: nn, forbidden: lc.fixer_forbidden, sections: lc.review_sections, rules, findings, round, maxRounds: lc.max_fix_rounds, title: pull.title, body: cfg.include_pr_body ? pull.body : '(not given in this repository)' };
    const system = fixerSystemPrompt(ctx);
    const user = fixerUserPrompt(ctx);
    out(`pr-loop: #${n} fix round ${round}: ${findings.length} finding(s), fixer model ${o.fixerModel}...`);
    const res = await runOnce({ bin: o.claudeBin, args: fixerArgs({ model: o.fixerModel, systemPrompt: system, forbidden: lc.fixer_forbidden }), input: user, cwd: dir, env: reviewerEnv(), timeoutMs: o.fixerTimeoutMs });
    logCall(o.stateDir, { repo: cfg.repo, pr: n, head, key: 'fixer', team: null, model: o.fixerModel, reported_model: res.reportedModel ?? null, round, attempt: 1, outcome: res.kind, duration_ms: res.durationMs, ...(res.tokens ?? {}), prompt_chars: system.length + user.length });
    if (res.kind === 'rate_limit') return await stop(head, `fix round ${round}: the fixer hit a rate limit (${res.error})`);
    if (res.kind !== 'ok') return await stop(head, `fix round ${round}: the fixer failed (${res.kind}: ${res.error})`);

    // Whatever the fixer says, its changes are checked first.
    const readAt = (ref) => (p) => { try { return git(o.repoRoot, ['show', `${ref}:${p}`]); } catch { return null; } };
    const regen = (lc.generate ?? []);
    let changed = worktreeChanges(dir);
    const bad = forbiddenChanges(changed, { forbidden: lc.fixer_forbidden, sections: lc.review_sections }, { readBefore: readAt(head), readAfter: (p) => (existsSync(join(dir, p)) ? readFileSync(join(dir, p), 'utf8') : null) });
    if (bad.length) return await stop(head, `fix round ${round}: the fixer changed paths it may not change (${bad.map((b) => `${b.path}: ${b.why}`).join('; ')}). Its changes were discarded and nothing was pushed; a review-config change needs the founder`);
    let parsed;
    try { parsed = res.structured ?? parseVerdictText(res.text); } catch (e) { return await stop(head, `fix round ${round}: the fixer's output is not JSON (${e.message}); nothing was pushed`); }
    const v = validateFixerOutput(parsed, findings);
    if (!v.ok) return await stop(head, `fix round ${round}: the fixer's output failed validation (${v.error}); nothing was pushed`);
    const fo = v.output;
    const notDone = fo.not_addressed.map((x) => `${x.id}: ${x.reason}`).join('; ');
    if (fo.status === 'needs_founder') return await stop(head, `fix round ${round}: a finding needs a change the loop may not make (${notDone || fo.summary}); nothing was pushed`);
    if (fo.status !== 'fixed' || fo.not_addressed.length) return await stop(head, `fix round ${round}: the fixer could not fix every finding (${notDone || fo.summary}); nothing was pushed`);
    if (!changed.length) return await stop(head, `fix round ${round}: the fixer changed no file; nothing was pushed`);

    // Generated files (website/public from website/src), then the checks.
    for (const g of regen.filter((e) => applies(e, changed))) {
      const gr = runCommands(g.run, join(dir, g.cwd), { main: mainSha }, o.checkTimeoutMs);
      if (!gr.ok) return await stop(head, `fix round ${round}: regenerating ${g.name} failed (${gr.command}: ${gr.detail}); nothing was pushed`);
    }
    changed = worktreeChanges(dir);
    const bad2 = forbiddenChanges(changed, { forbidden: lc.fixer_forbidden, sections: lc.review_sections }, { readBefore: readAt(head), readAfter: (p) => (existsSync(join(dir, p)) ? readFileSync(join(dir, p), 'utf8') : null) });
    if (bad2.length) return await stop(head, `fix round ${round}: regenerating changed paths the loop may not change (${bad2.map((b) => b.path).join(', ')}); nothing was pushed`);

    const ident = commitIdentity(o, head);
    git(dir, ['add', '-A']);
    const addressed = findings.filter((f) => fo.addressed.includes(f.id));
    const msg = [
      `Fix round ${round}: address review findings on ${head.slice(0, 7)}`,
      '',
      `Findings addressed (agent review of ${head}):`,
      ...addressed.map((f) => `- ${f.id} [${f.severity}] ${f.file}:${f.line}: ${String(f.text).replace(/\s+/g, ' ').slice(0, 200)}`),
      '',
      `Fixer: fresh claude -p process, model ${res.reportedModel ?? o.fixerModel}. The loop ran the checks and pushed.`,
      '',
      `Co-Authored-By: ${lc.co_author}`,
    ].join('\n');
    git(dir, ['-c', `user.name=${ident.name}`, '-c', `user.email=${ident.email}`, 'commit', '--quiet', '--no-verify', '-m', msg]);
    const newSha = git(dir, ['rev-parse', 'HEAD']).trim();
    const commitChanged = parseNameStatusZ(git(dir, ['diff', '--name-status', '-z', head, newSha])).flatMap((f) => (f.from ? [f.from, f.path] : [f.path]));
    const ran = [];
    for (const c of lc.checks.filter((e) => applies(e, commitChanged))) {
      const cr = runCommands(c.run, join(dir, c.cwd), { main: mainSha, head: newSha }, o.checkTimeoutMs);
      if (!cr.ok) return await stop(head, `fix round ${round}: the local check ${c.name} failed on the fix (${cr.command}: ${cr.detail}); nothing was pushed`);
      ran.push(c.name);
    }

    // A person may have pushed while the fixer worked: then this round stops.
    const now = (await o.github.getPull(n)).headSha;
    if (now !== head) {
      log('head-moved', { round, new_head: now });
      await say(`<!-- ${MARK} round=${round} abandoned head=${head} -->\n### Automated loop: fix round ${round} not pushed\n\nThe head moved from \`${head.slice(0, 7)}\` to \`${now.slice(0, 7)}\` while the fixer worked (someone pushed). The fix was discarded; the loop reviews the new head from scratch.`);
      return { outcome: 'head-moved' };
    }
    if (o.post === 'none') {
      out(`pr-loop: #${n} fix round ${round}: committed ${newSha.slice(0, 7)} locally; not pushed (--no-post)`);
      return { outcome: 'fixed-not-pushed', sha: newSha };
    }
    try {
      git(dir, ['push', '--quiet', '--no-verify', `--force-with-lease=refs/heads/${pull.headRef}:${head}`, 'origin', `${newSha}:refs/heads/${pull.headRef}`]);
    } catch (e) {
      const remote = (await o.github.getPull(n)).headSha;
      if (remote !== head) { log('head-moved', { round }); return { outcome: 'head-moved' }; }
      return await stop(head, `fix round ${round}: the push failed (${String(e.stderr || e.message).trim().slice(0, 300)})`);
    }
    st.rounds = round;
    st.lastFixHead = newSha;
    saveState(o.stateDir, cfg.repo, st);
    log('fixed', { round, new_head: newSha, addressed: fo.addressed.join(','), checks: ran.join(',') });
    await say([
      `<!-- ${MARK} round=${round} head=${newSha} from=${head} -->`,
      `### Automated loop: fix round ${round} of ${lc.max_fix_rounds}`,
      '',
      '| | |',
      '|---|---|',
      `| Reviewed head | \`${head}\` |`,
      `| New head | \`${newSha}\` |`,
      `| Fixer | fresh \`claude -p\` process (Read, Grep, Glob, Edit and Write in a clean worktree of the head; no shell, no network, no token), model ${esc(res.reportedModel ?? o.fixerModel, 80)} |`,
      `| Local checks | ${ran.length ? ran.map((c) => `${c}: pass`).join(', ') : 'none applied'} |`,
      '',
      '#### Findings addressed',
      '',
      '| Id | Key | Severity | Where | Finding |',
      '|---|---|---|---|---|',
      ...addressed.map((f) => `| ${f.id} | ${f.key} (${esc(f.team, 40)}) | ${f.severity} | \`${esc(f.file, 200)}:${f.line}\` | ${esc(f.text)} |`),
      '',
      `Fixer summary (model output): ${esc(fo.summary, 800)}`,
      '',
      `The new head voids both keys: CI and both reviews run again from scratch on \`${newSha.slice(0, 7)}\`.`,
      '',
      '_Automated fix, not a sign-off._',
    ].join('\n'));
    return { outcome: 'fixed', sha: newSha };
  } finally {
    try { git(o.repoRoot, ['worktree', 'remove', '--force', dir]); } catch { rmSync(dir, { recursive: true, force: true }); }
    try { rmSync(dirname(dir), { recursive: true, force: true }); git(o.repoRoot, ['worktree', 'prune']); } catch { /* best effort */ }
  }
}

function commitIdentity(o, head) {
  const cfgGet = (k) => { try { return git(o.repoRoot, ['config', k]).trim(); } catch { return ''; } };
  const name = o.gitName || cfgGet('user.name'), email = o.gitEmail || cfgGet('user.email');
  if (name && email) return { name, email };
  // Fall back to the PR head commit's author: the agents' account.
  const [an, ae] = git(o.repoRoot, ['log', '-1', '--format=%an%x00%ae', head]).trim().split('\0');
  return { name: name || an, email: email || ae };
}

// ---------------------------------------------------------------- a tick

// One pass over the open PRs. A PR the loop is fixing goes first; the pass
// ends after the first PR that ran a review or a fix, so one PR at a time
// moves through the expensive steps.
export async function runTick(o) {
  const cfg = o.config;
  const pulls = (await o.github.listOpenPulls()).filter((p) => !o.onlyPr || p.number === o.onlyPr);
  const inFlight = (p) => { const s = loadState(o.stateDir, cfg.repo, p.number); return s.lastFixHead && !s.done && !s.stopped ? 0 : 1; };
  pulls.sort((a, b) => inFlight(a) - inFlight(b) || a.number - b.number);
  const results = [];
  for (const p of pulls) {
    const r = await o.stepPr(o, p);
    results.push({ pr: p.number, ...r });
    if (r.outcome === 'busy') break;
    if (!['skip', 'wait'].includes(r.outcome)) break;
  }
  return results;
}

// The loop's own files and the review's must be main's copies to post.
function loopDiffersFromMain(repoRoot) {
  const rels = readdirSync(HERE).filter((f) => !f.endsWith('.test.mjs') && f !== 'fixtures').map((f) => `.github/scripts/pr-loop/${f}`);
  const differ = differsFromMain(repoRoot);
  for (const rel of rels) {
    let onMain = null;
    try { onMain = git(repoRoot, ['show', `refs/pr-review/main:${rel}`]); } catch { /* absent */ }
    if (onMain === null || onMain !== readFileSync(join(repoRoot, rel), 'utf8')) differ.push(rel);
  }
  return differ;
}

async function main(argv) {
  const watch = argv.includes('--watch'), once = argv.includes('--once');
  if (watch === once) { console.error('usage: pr-loop.mjs (--once | --watch) [--pr <n>] [--interval-minutes 5] [--no-post]'); return 2; }
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const onlyPr = arg('--pr') ? Number(arg('--pr')) : null;
  const intervalMs = Number(arg('--interval-minutes') ?? 5) * 60 * 1000;
  const config = JSON.parse(readFileSync(join(HERE, '..', 'pr-review', 'config.json'), 'utf8'));
  const loop = JSON.parse(readFileSync(join(HERE, 'config.json'), 'utf8'));
  const repoRoot = resolve(HERE, '..', '..', '..');
  const noPost = argv.includes('--no-post');
  let callerBranch = null;
  try { callerBranch = git(process.cwd(), ['rev-parse', '--abbrev-ref', 'HEAD']).trim(); } catch { /* not in a repository */ }
  const base = {
    repoRoot, config, loop, ...loopDefaults(), onlyPr, stepPr,
    callerBranch, inClaudeSession: !!process.env.CLAUDECODE,
    runGh: (args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
  };
  for (;;) {
    let github, post;
    try {
      const app = appConfigFromEnv();
      if (noPost) { github = createClient({ repo: config.repo, token: ghToken() }); post = 'none'; }
      else if (app) { github = createClient({ repo: config.repo, token: await installationToken(app, config.repo) }); post = 'app'; }
      else { github = createClient({ repo: config.repo, token: ghToken() }); post = 'dry-run'; }
    } catch (e) { console.error(`pr-loop: could not get a GitHub token: ${e.message}`); return 2; }
    git(repoRoot, ['fetch', '--no-tags', '--quiet', 'origin', `+refs/heads/${config.base_branch}:refs/pr-review/main`]);
    if (post !== 'none') {
      const differ = loopDiffersFromMain(repoRoot);
      if (differ.length) {
        console.error(`pr-loop: refusing to run: this copy differs from main (${differ.join(', ')}). Run it from a checkout of origin/main, or use --no-post.`);
        return 4;
      }
    }
    const results = await runTick({ ...base, github, post });
    console.log(`pr-loop: ${new Date().toISOString()} ${post}: ${results.map((r) => `#${r.pr} ${r.outcome}`).join(', ') || 'no open PRs'}`);
    if (once) return 0;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(`pr-loop: ${e.stack || e.message}`); process.exit(2); });
}
