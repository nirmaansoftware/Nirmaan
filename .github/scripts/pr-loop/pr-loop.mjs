#!/usr/bin/env node
// The automated review loop ("driver"): for each open PR by the agents'
// account it waits for CI, runs the two-key review (review.mjs, which adds
// the Founder Proxy (agent) on a founder-class PR), and then
// either takes the merge path or, when a key failed with findings, starts a
// separate fixer process, checks and pushes its fix, and lets the new head
// be reviewed again from scratch. How it runs: docs/operations/pr-review.md
// ("Automated loop").
//
// One step per PR per call, as a state machine, so the loop survives restarts
// and a step never waits on CI:
//   skip     draft, fork, other author, `hold` or `needs-founder` label, or
//            this head already finished (ready, auto-merge);
//   update   GitHub reports the branch behind main (it does only while the
//            ruleset requires up-to-date branches): merge main into it with the gh
//            login (update-branch, pinned to the head the loop saw) before
//            any review, and again after the review when main moved during
//            it; a failed update stops, a person's push in between drops the
//            step;
//   wait     required CI not finished on the head, or GitHub still making
//            the update's merge commit;
//   pause    a key, the proxy or the fixer hit a rate limit (the plan's
//            session or usage limit): no label, the key stays pending, and
//            the whole loop waits rate_limit_pause_minutes before any model
//            call, then reviews again;
//   stop     CI failed on a head the loop pushed, a merge conflict, a key or
//            the proxy deferred (bad output, missing spec), the
//            Founder Proxy returned needs-founder (until the founder's own
//            GitHub review approves the head), a repeated finding, the round
//            limit, a forbidden path, a failed local check, or any error:
//            label `needs-founder` and say why;
//   review   both keys, and the Founder Proxy for a founder-class PR (fresh
//            read-only processes, review.mjs);
//   merge    both keys (and the proxy, for a founder-class PR) passed:
//            `gh pr merge --auto --merge` with the gh login when the review
//            App posts the checks and the repository's allow_auto_merge
//            field (read with gh) is true; a "ready" comment in a dry run or
//            when it is false; the field unreadable or any merge error stops;
//   fix      a key or the proxy failed: a fresh fixer `claude -p` in a clean worktree of
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
import { acquireLock, acquireSlot, findingsBySeverity, logCall, NEEDS_FOUNDER, nonce, parseNameStatusZ, parseVerdictText, redact, requiredCi } from '../pr-review/lib.mjs';
import { reviewerEnv, runOnce } from '../pr-review/claude.mjs';
import { appConfigFromEnv, createClient, ghToken, installationToken } from '../pr-review/github.mjs';
import { defaults, differsFromMain, EXIT, runReview } from '../pr-review/review.mjs';
import { findingsToFix, fixableBy, fixerArgs, fixerSystemPrompt, fixerUserPrompt, forbiddenChanges, validateFixerOutput } from './fixer.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MARK = 'nirmaan-pr-loop';
// After asking GitHub to update a branch, how long the loop waits for the new
// head before asking again (GitHub makes the merge commit asynchronously).
const UPDATE_WAIT_MS = 10 * 60 * 1000;
// The loop-wide rate-limit pause (shared by every PR of this repository).
function pausePath(stateDir) { return join(stateDir, 'loop', 'rate-limit-pause.json'); }
export function readPause(stateDir, now = Date.now()) {
  try {
    const p = JSON.parse(readFileSync(pausePath(stateDir), 'utf8'));
    return Date.parse(p.until) > now ? p : null;
  } catch { return null; }
}

// The kinds of stop, logged as `class` with every stop (and in the per-phase
// line): the comment gives the reason, the class groups them for reports.
export const STOP_CLASSES = [
  'merge-conflict', 'ci-failed-after-fix', 'deferred', 'validation', 'rate-limit', 'call-failed', 'needs-founder',
  'update-failed', 'merge-failed', 'no-findings', 'repeated-finding', 'rounds-used-up', 'fixer-forbidden-path',
  'fixer-invalid-output', 'loop-may-not-fix', 'fixer-could-not-fix', 'local-check', 'push-failed', 'error', 'transient',
];
// Stops that may be passing faults (a failed model process, a GitHub or git
// error, a failed push): retried on later passes, transient_retries times,
// before they stop for real with class "transient".
export const TRANSIENT_CLASSES = new Set(['call-failed', 'error', 'push-failed']);

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
  return { state: ci.state, jobs: ci.jobs.map((j) => ({ name: j.name, state: j.conclusion })), text: ci.text, greenAt: ci.greenAt ?? null };
}

// ---------------------------------------------------------------- per-phase log

// One key's part of the per-phase log line: when it ran, its verdict, its
// findings by severity and the validation error, if any.
function keyPhase(k) {
  if (!k) return null;
  return {
    team: k.team ?? null, role: k.role ?? null, status: k.status, reused: !!k.reused,
    ...(k.composite ? { teams: k.teams } : {}),
    started_at: k.startedAt ?? null, ended_at: k.endedAt ?? null,
    findings: findingsBySeverity(k.verdict), validation_error: k.validationError ?? null, call_outcome: k.callOutcome ?? null, deferral_kind: k.deferralKind ?? null,
  };
}

// The per-phase fields of one review step (docs/operations/pr-review.md,
// "Records"): CI green time, lock wait, each key's start and end, verdicts,
// findings by severity, validation errors, the step's outcome and, for a
// stop, its reason and class. `merged` is false here: the step only arms
// auto-merge; a separate "merged" line follows when the loop sees the merge.
export function phaseRecord({ ciGreenAt, lockWaitMs, startedAt, endedAt, review, result }) {
  const k1 = (review?.key1 ?? []).map(keyPhase);
  const span = (list) => {
    const s = list.map((x) => x.started_at).filter(Boolean).sort(), e = list.map((x) => x.ended_at).filter(Boolean).sort();
    return { started_at: s[0] ?? null, ended_at: e[e.length - 1] ?? null };
  };
  return {
    ci_green_at: ciGreenAt ?? null, lock_wait_ms: lockWaitMs, step_started_at: startedAt, step_ended_at: endedAt,
    key1: k1.length ? { ...span(k1), teams: k1 } : null,
    key2: keyPhase(review?.key2), proxy: keyPhase(review?.proxy),
    outcome: result?.outcome ?? null,
    // A stop, an author-fix hand-over or a retry on a later pass.
    stop_reason: ['stopped', 'author-fix', 'retry'].includes(result?.outcome) ? result.reason ?? null : null,
    stop_class: ['stopped', 'author-fix', 'retry'].includes(result?.outcome) ? result.class ?? null : null,
    merged: false,
  };
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
  if (listed.headRepo === cfg.repo && listed.baseRef !== cfg.base_branch) {
    // Stacked on another open PR: wait for it to merge (GitHub then retargets
    // this one to main).
    const base = (o.openPulls ?? []).find((p) => p.number !== n && p.headRef === listed.baseRef);
    if (base) { out(`pr-loop: #${n} waits: stacked on #${base.number}`); return { outcome: 'wait', reason: `stacked on #${base.number}; waits for it to merge` }; }
  }
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
  if (st.authorFix) {
    // The author fixes what the loop may not: nothing more on this head; a
    // new head is reviewed from scratch and the label comes off.
    if (st.authorFix.head === listed.headSha) return skip('waiting for the author to fix findings the loop may not fix');
    if (o.post !== 'none' && lc.author_fix_label) { try { await o.github.removeLabel(n, lc.author_fix_label); } catch { /* already gone */ } }
    delete st.authorFix;
    saveState(o.stateDir, cfg.repo, st);
  }
  if (st.stopped) st.stopped = null; // unlabeled (--no-post) stop on an older head

  const say = async (body) => {
    if (o.post === 'none') { out(`----- comment (not posted)\n${body}`); return null; }
    return (await o.github.createComment(n, body)).url;
  };
  // `cls` names the kind of stop for the log (STOP_CLASSES); the reason is
  // what the comment says.
  const stop = async (head, why, cls = 'error') => {
    // Reasons can carry gh or git error text: redacted before it is logged,
    // saved or posted.
    let reason = redact(why);
    if (TRANSIENT_CLASSES.has(cls) && lc.transient_retries) {
      const tr = st.transient?.head === head ? st.transient : { head, count: 0 };
      if (tr.count < lc.transient_retries) {
        tr.count++;
        st.transient = tr;
        saveState(o.stateDir, cfg.repo, st);
        out(`pr-loop: #${n} retries on a later pass (${tr.count} of ${lc.transient_retries}): ${reason}`);
        log('retry', { reason, class: cls, attempt: tr.count });
        return { outcome: 'retry', reason, class: cls };
      }
      reason = `${reason} (still failing after ${tr.count} retries on later passes)`;
      cls = 'transient';
    }
    out(`pr-loop: #${n} stopped: ${reason}`);
    st.stopped = { head, reason, class: cls, at: new Date().toISOString(), labeled: false };
    saveState(o.stateDir, cfg.repo, st);
    log('stopped', { reason, class: cls });
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
    return { outcome: 'stopped', reason, class: cls };
  };
  // A rate limit is not a stop: no label, no deputy (it shares the plan), the key
  // stays pending, and the loop makes no model call for any PR until the
  // pause ends; then this head is reviewed again.
  const pause = (head, why) => {
    const reason = redact(why);
    const until = new Date(Date.now() + (lc.rate_limit_pause_minutes ?? 30) * 60 * 1000).toISOString();
    mkdirSync(join(o.stateDir, 'loop'), { recursive: true });
    writeFileSync(pausePath(o.stateDir), JSON.stringify({ until, repo: cfg.repo, pr: n, head, reason }));
    out(`pr-loop: #${n} paused until ${until}: ${reason}`);
    log('paused', { reason, until, class: 'rate-limit' });
    return { outcome: 'paused', reason, until };
  };

  try {
    const pull = await o.github.getPull(n);
    const head = pull.headSha;
    // Behind main: update first, also for a head that already finished (it
    // cannot merge while behind).
    if (pull.mergeableState === 'behind' && st.done?.outcome !== 'refused') {
      const u = await updateBehind(o, { n, head, st, say, stop, log, out });
      if (u) return u;
    }
    if (st.done?.head === head) return skip(`${st.done.outcome} on this head`);
    if (pull.mergeable === false || pull.mergeableState === 'dirty') return await stop(head, 'the branch has a merge conflict with main; a person resolves it', 'merge-conflict');

    const ci = ciState(cfg.required_ci, await o.github.listCheckRuns(head));
    if (ci.state === 'pending') { out(`pr-loop: #${n} waiting for CI on ${head.slice(0, 7)}: ${ci.text}`); return { outcome: 'wait', reason: ci.text }; }
    if (ci.state === 'failed') {
      if (st.lastFixHead === head) return await stop(head, `CI failed after fix round ${st.rounds} (${ci.text})`, 'ci-failed-after-fix');
      return skip(`CI failed on ${head.slice(0, 7)} (${ci.text}); the author fixes it`);
    }

    // One PR at a time across both repositories: the review's lock, held
    // for the review and the fix round together. Lock wait: from the first
    // pass that found this head ready but the lock held, to the pass that
    // takes it (kept in the PR's state between passes).
    // lock_mode "step" (today): the one shared review lock for the review and
    // the fix round together. "calls": this repository's own lock plus one of
    // model_cap model slots, held for the review only; the fixer takes a slot
    // just for its call, and local checks hold nothing.
    const callsMode = lc.lock_mode === 'calls';
    let lock = callsMode ? acquireLock(o.stateDir, { repo: cfg.repo, pr: n, by: 'pr-loop' }, { name: `review-${cfg.repo.replace('/', '_')}.lock` }) : acquireLock(o.stateDir, { repo: cfg.repo, pr: n, by: 'pr-loop' });
    if (lock.ok && callsMode) {
      const slot = acquireSlot(o.stateDir, { repo: cfg.repo, pr: n, by: 'pr-loop' }, lc.model_cap ?? 1);
      if (!slot.ok) { lock.release(); lock = slot; }
      else { const repoLock = lock; lock = { ok: true, release: () => { slot.release(); repoLock.release(); } }; }
    }
    if (!lock.ok) {
      if (st.lockWait?.head !== head) { st.lockWait = { head, since: new Date().toISOString() }; saveState(o.stateDir, cfg.repo, st); }
      return { outcome: 'busy', reason: `lock held by ${lock.holder ? `${lock.holder.repo} #${lock.holder.pr}` : 'another process'}` };
    }
    const stepStarted = new Date();
    const lockWaitMs = st.lockWait?.head === head ? Math.max(0, stepStarted.getTime() - Date.parse(st.lockWait.since)) : 0;
    if (st.lockWait) { delete st.lockWait; saveState(o.stateDir, cfg.repo, st); }
    let r = null, result = null;
    const roundAtStart = st.rounds;
    try {
      log('review', { ci: ci.text });
      r = await runReview({
        repoRoot: o.repoRoot, pr: n, config: cfg, github: o.github, post: o.post, claudeBin: o.claudeBin, stateDir: o.stateDir,
        models: o.models, timeoutMs: o.timeoutMs, backoffMs: o.backoffMs, sleep: o.sleep, out, heldLock: true,
        callerBranch: o.callerBranch, inClaudeSession: o.inClaudeSession,
      });
      if (callsMode) { lock.release(); lock.release = () => {}; }
      result = await afterReview(o, { n, head, pull, st, r, say, stop, pause, skip, log, out });
      return result;
    } finally {
      lock.release();
      // One per-phase line per review step that ran, whatever it ended in.
      // Its own kind, so the loop's event lines stay as they were.
      if (r) logCall(o.stateDir, { kind: 'phase', repo: cfg.repo, pr: n, head, round: roundAtStart, ...phaseRecord({ ciGreenAt: ci.greenAt, lockWaitMs, startedAt: stepStarted.toISOString(), endedAt: new Date().toISOString(), review: r, result }) });
    }
  } catch (e) {
    return await stop(listed.headSha, `error: ${e.message}`, 'error');
  }
}

// What follows a review: stop, merge path or fix round.
async function afterReview(o, { n, head, pull, st, r, say, stop, pause, skip, log, out }) {
  const cfg = o.config;
  if (r.exit === EXIT.headMoved) { log('head-moved'); return { outcome: 'head-moved' }; }
  if (r.exit === EXIT.refused) { st.done = { head, outcome: 'refused' }; saveState(o.stateDir, cfg.repo, st); return { outcome: 'skip', reason: r.reason }; }
  if (r.exit !== EXIT.ok) return await stop(head, `the review exited ${r.exit}`, 'error');
  if (r.waiting) return { outcome: 'wait', reason: r.waiting };
  if (r.ciFailed) return st.lastFixHead === head ? await stop(head, `CI failed after fix round ${st.rounds} (${r.ciFailed})`, 'ci-failed-after-fix') : skip(`${r.ciFailed}; the author fixes it`);
  if (r.deferred) return await stop(head, `review deferred: ${r.deferred}`, 'deferred');
  const k1 = r.key1 ?? [];
  // The Founder Proxy (agent) is a reviewer like the keys: deferred
  // stops, fail goes to the fixer.
  const all = [...k1, ...(r.key2 ? [r.key2] : []), ...(r.proxy ? [r.proxy] : [])];
  const deferred = all.filter((k) => k.status === 'deferred');
  if (k1.length === 0) return await stop(head, 'review deferred: no owning team', 'deferred');
  // Every deferral a rate limit: pause, no label. Any other deferral stops.
  if (deferred.length && deferred.every((k) => k.callOutcome === 'rate_limit')) return pause(head, `rate limit (${deferred.map((k) => `${k.teamName}: ${k.reason}`).join('; ')})`);
  if (deferred.length) {
    // The class says why (the comment and the label are the same for all).
    const cls = deferred.some((k) => k.validationError) ? 'validation' : deferred.some((k) => k.callOutcome === 'rate_limit') ? 'rate-limit' : deferred.some((k) => k.callOutcome) ? 'call-failed' : 'deferred';
    return await stop(head, `review deferred (${deferred.map((k) => `${k.teamName}: ${k.reason}`).join('; ')})`, cls);
  }
  const failed = all.filter((k) => k.status === 'fail');
  log('reviewed', { key1: k1.map((k) => `${k.team}:${k.status}`).join(','), key2: r.key2?.status ?? 'not run', proxy: r.proxy?.status ?? 'not run' });
  // What the founder keeps: the loop stops and the founder decides on
  // GitHub. Their own review approving this head lets the review pass
  // review/executive; removing the label lets the loop resume.
  if (r.proxy?.status === NEEDS_FOUNDER && !r.founderApproved) {
    const why = (r.proxy.verdict?.founder_reasons ?? []).join('; ');
    return await stop(head, `the Founder Proxy (agent) returned needs-founder: ${why}. The founder decides: approve head ${head.slice(0, 7)} on GitHub (or not), then remove the label`, 'needs-founder');
  }

  if (failed.length === 0) return await mergePath(o, { n, head, st, r, say, stop, log, out });
  return await fixRound(o, { n, head, pull, st, r, say, stop, pause, log, out });
}

// The branch is behind main: ask GitHub to merge main into it (REST
// update-branch with the gh login, the same merge-commit update as
// `gh pr update-branch`, but pinned with expected_head_sha so a person's push
// in between is never merged over). Returns the step's result, or null to go
// on (--no-post never updates).
async function updateBehind(o, { n, head, st, say, stop, log, out }) {
  const cfg = o.config;
  const sha7 = head.slice(0, 7);
  if (o.post === 'none') { out(`pr-loop: #${n} is behind main; not updated (--no-post)`); return null; }
  if (st.updated?.from === head && Date.now() - Date.parse(st.updated.at) < UPDATE_WAIT_MS) {
    out(`pr-loop: #${n} waiting for GitHub to update the branch (head ${sha7})`);
    return { outcome: 'wait', reason: 'waiting for GitHub to update the branch' };
  }
  try {
    o.runGh(['api', '-X', 'PUT', `repos/${cfg.repo}/pulls/${n}/update-branch`, '-f', `expected_head_sha=${head}`]);
  } catch (e) {
    const now = (await o.github.getPull(n)).headSha;
    if (now !== head) { log('head-moved', { new_head: now }); return { outcome: 'head-moved' }; }
    return await stop(head, `could not update the branch with main ${ghFailure(e)}. A person resolves it (a merge conflict with main, or GitHub refused the update)`, 'update-failed');
  }
  st.updated = { from: head, at: new Date().toISOString() };
  saveState(o.stateDir, cfg.repo, st);
  log('updated');
  await say(`<!-- ${MARK} updated from=${head} -->\n### Automated loop: branch updated\n\nGitHub reported the branch behind \`main\` (the ruleset requires up-to-date branches while it reports that), so the loop asked GitHub to merge \`main\` into it (update-branch, a merge commit, only while the head was still \`${sha7}\`). The new head is reviewed from scratch.`);
  return { outcome: 'updated' };
}

async function mergePath(o, { n, head, st, r, say, stop, log, out }) {
  const cfg = o.config;
  const sha7 = head.slice(0, 7);
  const now = await o.github.getPull(n);
  if (now.labels.includes(cfg.hold_label)) { log('held'); return { outcome: 'skip', reason: 'hold label set during the review' }; }
  // main moved during the review: this head cannot merge, so update it rather
  // than ask GitHub to merge it.
  if (now.mergeableState === 'behind' && o.post !== 'none') return await updateBehind(o, { n, head, st, say, stop, log, out });
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
      return await stop(head, `could not read the repository's auto-merge setting ${ghFailure(e)}`, 'merge-failed');
    }
    if (allowed === 'false') why = 'the repository does not allow auto-merge';
    else if (allowed !== 'true') return await stop(head, `could not read the repository's auto-merge setting (gh answered "${allowed.slice(0, 40)}", not true or false)`, 'merge-failed');
  }
  if (!why) {
    try {
      o.runGh(['pr', 'merge', String(n), '--repo', cfg.repo, '--auto', '--merge', '--match-head-commit', head]);
    } catch (e) {
      return await stop(head, `gh pr merge --auto failed ${ghFailure(e)}`, 'merge-failed');
    }
  }
  if (!why) {
    log('auto-merge');
    await say(`<!-- ${MARK} auto-merge head=${head} -->\n### Automated loop: ${passedWhat(r)} on \`${sha7}\`\n\nAuto-merge is on for this PR: GitHub merges it with a merge commit once every required check passes on this head.\n\n_Agent review, not a sign-off._`);
    st.done = { head, outcome: 'auto-merge', at: new Date().toISOString() };
  } else {
    log('ready', { why });
    await say(`<!-- ${MARK} ready head=${head} -->\n### Automated loop: ready\n\n${passedWhat(r, true)} on \`${sha7}\`, waiting for the founder's merge settings: ${why}. The founder merges this PR.\n\n_Agent review, not a sign-off._`);
    st.done = { head, outcome: 'ready', at: new Date().toISOString() };
  }
  saveState(o.stateDir, cfg.repo, st);
  return { outcome: st.done.outcome };
}

// What passed, for the merge-path comments.
function passedWhat(r, capital = false) {
  const what = !r.proxy ? 'both keys passed'
    : r.proxy.status === NEEDS_FOUNDER ? "both keys passed, and the founder's own GitHub review approves the changes the Founder Proxy (agent) sent to the founder"
      : 'both keys and the Founder Proxy (agent) passed';
  return capital ? what[0].toUpperCase() + what.slice(1) : what;
}

async function fixRound(o, { n, head, pull, st, r, say, stop, pause, log, out }) {
  const cfg = o.config, lc = o.loop;
  const findings = findingsToFix(r).map((f) => ({ ...f, fixable_by: fixableBy(f, lc.fixer_forbidden) }));
  if (!findings.length) return await stop(head, 'a key failed without findings to fix', 'no-findings');
  // A finding only the author can fix (the PR text, or a path the fixer may
  // not change): no fixer run that cannot succeed; the author-fix label and
  // the proposed changes instead (decision R5.4).
  const forAuthor = findings.filter((f) => f.fixable_by === 'author');
  if (forAuthor.length) return await authorFix(o, { n, head, st, findings, forAuthor, say, log, out });
  // lock_mode "calls": a model slot for the fixer's call; none free, try
  // again on a later pass (nothing is counted yet).
  let slot = null;
  if (lc.lock_mode === 'calls') {
    slot = acquireSlot(o.stateDir, { repo: cfg.repo, pr: n, by: 'pr-loop fixer' }, lc.model_cap ?? 1);
    if (!slot.ok) return { outcome: 'busy', reason: 'no model slot free for the fixer' };
  }
  // A round that ends in a retry on a later pass (the fixer's process
  // failed, a git or GitHub error, a failed push) or throws was not a fix
  // attempt: its findings are not counted as seen, so the next pass runs the
  // round again instead of stopping as "the same finding failed again".
  const seenBefore = JSON.stringify(st.seen);
  const unsee = () => { st.seen = JSON.parse(seenBefore); saveState(o.stateDir, cfg.repo, st); };
  try {
    const res = await fixRoundWith(o, { n, head, pull, st, r, say, stop, pause, log, out, findings, releaseSlot: () => { if (slot) { slot.release(); slot = null; } } });
    if (res?.outcome === 'retry') unsee();
    return res;
  } catch (e) {
    unsee();
    throw e;
  } finally { if (slot) slot.release(); }
}

// The author-fix outcome: label, comment with the proposed changes, and the
// loop waits for a new head (no needs-founder label, no fixer).
async function authorFix(o, { n, head, st, findings, forAuthor, say, log, out }) {
  const cfg = o.config, lc = o.loop;
  out(`pr-loop: #${n} author-fix: ${forAuthor.length} finding(s) the loop may not fix`);
  st.authorFix = { head, at: new Date().toISOString() };
  saveState(o.stateDir, cfg.repo, st);
  log('author-fix', { class: 'author-fix', findings: findings.length, author_only: forAuthor.length });
  if (o.post !== 'none') { try { await o.github.addLabels(n, [lc.author_fix_label]); } catch (e) { out(`pr-loop: #${n}: could not label: ${e.message}`); } }
  try {
    await say([
      `<!-- ${MARK} author-fix head=${head} -->`,
      '### Automated loop: the author fixes this',
      '',
      `A key failed on \`${head.slice(0, 7)}\` with ${forAuthor.length === findings.length ? 'findings' : 'at least one finding'} the loop's fixer may not fix (the PR text, or a path the fixer may not change), so no fixer ran. The author pushes a fix; the new head is reviewed from scratch and the \`${lc.author_fix_label}\` label comes off.`,
      '',
      '| Id | Key | Severity | Where | Fixable by | Proposed change (the reviewer\'s finding) |',
      '|---|---|---|---|---|---|',
      ...findings.map((f) => `| ${f.id} | ${f.key} (${esc(f.team, 40)}) | ${f.severity} | \`${esc(f.file, 200)}:${f.line}\` | ${f.fixable_by} | ${esc(f.text)} |`),
      '',
      '_Automated loop, not a sign-off._',
    ].join('\n'));
  } catch (e) { out(`pr-loop: #${n}: could not comment: ${e.message}`); }
  return { outcome: 'author-fix', reason: `${forAuthor.length} finding(s) for the author`, class: 'author-fix' };
}

async function fixRoundWith(o, { n, head, pull, st, r, say, stop, pause, log, out, findings, releaseSlot }) {
  const cfg = o.config, lc = o.loop;
  const repeated = findings.filter((f) => st.seen[f.fingerprint]);
  if (repeated.length) return await stop(head, `the same finding failed again after a fix: ${repeated.map((f) => `${f.file}:${f.line} ${f.text}`).join('; ')}`, 'repeated-finding');
  for (const f of findings) st.seen[f.fingerprint] = (st.seen[f.fingerprint] ?? 0) + 1;
  saveState(o.stateDir, cfg.repo, st);
  if (st.rounds >= lc.max_fix_rounds) return await stop(head, `${lc.max_fix_rounds} fix rounds done and a key still fails`, 'rounds-used-up');
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
    releaseSlot(); // lock_mode "calls": the slot was for the model call only
    logCall(o.stateDir, { repo: cfg.repo, pr: n, head, key: 'fixer', team: null, model: o.fixerModel, reported_model: res.reportedModel ?? null, round, attempt: 1, outcome: res.kind, duration_ms: res.durationMs, ...(res.tokens ?? {}), prompt_chars: system.length + user.length });
    if (res.kind === 'rate_limit') {
      // Not a fix attempt: the findings are not counted as seen, so the
      // round runs again after the pause.
      for (const f of findings) { if (--st.seen[f.fingerprint] <= 0) delete st.seen[f.fingerprint]; }
      saveState(o.stateDir, cfg.repo, st);
      return pause(head, `fix round ${round}: the fixer hit a rate limit (${res.error})`);
    }
    if (res.kind !== 'ok') return await stop(head, `fix round ${round}: the fixer failed (${res.kind}: ${res.error})`, 'call-failed');

    // Whatever the fixer says, its changes are checked first.
    const readAt = (ref) => (p) => { try { return git(o.repoRoot, ['show', `${ref}:${p}`]); } catch { return null; } };
    const regen = (lc.generate ?? []);
    let changed = worktreeChanges(dir);
    const bad = forbiddenChanges(changed, { forbidden: lc.fixer_forbidden, sections: lc.review_sections }, { readBefore: readAt(head), readAfter: (p) => (existsSync(join(dir, p)) ? readFileSync(join(dir, p), 'utf8') : null) });
    if (bad.length) return await stop(head, `fix round ${round}: the fixer changed paths it may not change (${bad.map((b) => `${b.path}: ${b.why}`).join('; ')}). Its changes were discarded and nothing was pushed; a review-config change needs the founder`, 'fixer-forbidden-path');
    let parsed;
    try { parsed = res.structured ?? parseVerdictText(res.text); } catch (e) { return await stop(head, `fix round ${round}: the fixer's output is not JSON (${e.message}); nothing was pushed`, 'fixer-invalid-output'); }
    const v = validateFixerOutput(parsed, findings);
    if (!v.ok) return await stop(head, `fix round ${round}: the fixer's output failed validation (${v.error}); nothing was pushed`, 'fixer-invalid-output');
    const fo = v.output;
    const notDone = fo.not_addressed.map((x) => `${x.id}: ${x.reason}`).join('; ');
    if (fo.status === 'needs_founder') return await stop(head, `fix round ${round}: a finding needs a change the loop may not make (${notDone || fo.summary}); nothing was pushed`, 'loop-may-not-fix');
    if (fo.status !== 'fixed' || fo.not_addressed.length) return await stop(head, `fix round ${round}: the fixer could not fix every finding (${notDone || fo.summary}); nothing was pushed`, 'fixer-could-not-fix');
    if (!changed.length) return await stop(head, `fix round ${round}: the fixer changed no file; nothing was pushed`, 'fixer-could-not-fix');

    // Generated files (website/public from website/src), then the checks.
    for (const g of regen.filter((e) => applies(e, changed))) {
      const gr = runCommands(g.run, join(dir, g.cwd), { main: mainSha }, o.checkTimeoutMs);
      if (!gr.ok) return await stop(head, `fix round ${round}: regenerating ${g.name} failed (${gr.command}: ${gr.detail}); nothing was pushed`, 'local-check');
    }
    changed = worktreeChanges(dir);
    const bad2 = forbiddenChanges(changed, { forbidden: lc.fixer_forbidden, sections: lc.review_sections }, { readBefore: readAt(head), readAfter: (p) => (existsSync(join(dir, p)) ? readFileSync(join(dir, p), 'utf8') : null) });
    if (bad2.length) return await stop(head, `fix round ${round}: regenerating changed paths the loop may not change (${bad2.map((b) => b.path).join(', ')}); nothing was pushed`, 'fixer-forbidden-path');

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
      if (!cr.ok) return await stop(head, `fix round ${round}: the local check ${c.name} failed on the fix (${cr.command}: ${cr.detail}); nothing was pushed`, 'local-check');
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
      return await stop(head, `fix round ${round}: the push failed (${String(e.stderr || e.message).trim().slice(0, 300)})`, 'push-failed');
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

// One pass over the open PRs: one step for every PR, so a PR waiting on CI,
// or one that just ran a review or a fix, never holds up the others. A PR
// the loop is fixing goes first, then by number. The steps run one after
// another, and each review or fix round holds the shared lock, so reviews
// still run one at a time (a lock held elsewhere makes that PR "busy" and
// the pass goes on to the next).
export async function runTick(o) {
  const cfg = o.config;
  const open = await o.github.listOpenPulls();
  await logMerges(o, new Set(open.map((p) => p.number)));
  const pulls = open.filter((p) => !o.onlyPr || p.number === o.onlyPr);
  const paused = readPause(o.stateDir);
  if (paused) {
    (o.out ?? console.log)(`pr-loop: rate-limit pause until ${paused.until} (#${paused.pr}); no model call this pass`);
    return pulls.map((p) => ({ pr: p.number, outcome: 'paused', reason: `rate-limit pause until ${paused.until}` }));
  }
  const inFlight = (p) => { const s = loadState(o.stateDir, cfg.repo, p.number); return s.lastFixHead && !s.done && !s.stopped ? 0 : 1; };
  pulls.sort((a, b) => inFlight(a) - inFlight(b) || a.number - b.number);
  const results = [];
  // main's SHA when the pass began (the copy fetched and checked in main()).
  // Before each step main is read again; if any merge moved it (this loop's,
  // the founder's, the ip-nirmaan loop's), the pass ends, so no later step
  // runs against a stale main or a script copy that no longer matches it.
  // An unreadable main ends the pass too (fails safe).
  const start = o.mainStart ?? null;
  for (const p of pulls) {
    if (start && o.mainSha) {
      let now = null;
      try { now = await o.mainSha(); } catch { /* unreadable: end the pass */ }
      if (now !== start) break;
    }
    const r = await o.stepPr({ ...o, openPulls: open }, p);
    results.push({ pr: p.number, ...r });
    // Auto-merge armed: main can move at any moment, so a later PR in this
    // pass would be reviewed against a stale main. End the pass; the next one
    // refetches main and reruns the differs-from-main check first.
    if (r && r.outcome === 'auto-merge') break;
  }
  return results;
}

// A PR this loop armed for merge (auto-merge, or "ready" for the founder) that
// is no longer open: one "merged" (or "closed") line with GitHub's merge time,
// once, for the per-phase records. Only states the loop marked with a time
// (from this version on) are looked at; a failed read is tried next pass.
async function logMerges(o, openNumbers) {
  const cfg = o.config;
  const dir = join(o.stateDir, 'loop'), prefix = `${cfg.repo.replace('/', '_')}-pr-`;
  let names = [];
  try { names = readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.json')); } catch { return; }
  for (const f of names) {
    const n = Number(f.slice(prefix.length, -'.json'.length));
    if (!Number.isInteger(n) || openNumbers.has(n)) continue;
    const st = loadState(o.stateDir, cfg.repo, n);
    if (!st.done?.at || st.done.closedLogged || !['auto-merge', 'ready'].includes(st.done.outcome)) continue;
    let p;
    try { p = await o.github.getPull(n); } catch { continue; }
    if (p.state !== 'closed') continue;
    logCall(o.stateDir, { kind: 'loop', repo: cfg.repo, pr: n, head: st.done.head, round: st.rounds, event: p.merged ? 'merged' : 'closed', merged: !!p.merged, merged_at: p.mergedAt ?? null, merge_sha: p.mergeSha ?? null, merged_head: p.headSha ?? null });
    st.done.closedLogged = true;
    saveState(o.stateDir, cfg.repo, st);
  }
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
    mainSha: () => git(repoRoot, ['ls-remote', 'origin', `refs/heads/${config.base_branch}`]).split(/\s/)[0] || null,
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
    const mainStart = git(repoRoot, ['rev-parse', 'refs/pr-review/main']).trim();
    const results = await runTick({ ...base, github, post, mainStart });
    console.log(`pr-loop: ${new Date().toISOString()} ${post}: ${results.map((r) => `#${r.pr} ${r.outcome}`).join(', ') || 'no open PRs'}`);
    if (once) return 0;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(`pr-loop: ${e.stack || e.message}`); process.exit(2); });
}
