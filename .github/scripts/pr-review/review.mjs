#!/usr/bin/env node
// PR review script: runs the two-key agent review of one pull request and
// posts the result. Decision record: docs/operations/pr-review-decisions.md;
// how it runs: docs/operations/pr-review.md; the skill that calls it:
// .claude/skills/pr-review/SKILL.md.
//
// What it does, in order (every failure is fail-closed: pending or failure,
// never success):
//   1. Takes the one-at-a-time lock shared with ip-nirmaan.
//   2. Reads the PR: open, targets main, same-repository branch, allowed
//      author; otherwise refuses without posting.
//   3. Fetches main and the PR head, checks the fetched head is the PR's head,
//      and makes clean worktrees of both outside the repository.
//   4. Computes owning teams, member checklists, founder classes and content
//      hits from main's .github/review-teams.yml (never the PR's copy).
//   5. Waits for green required CI on the head: pending while a required job
//      runs (the newest run of each job counts), "CI failed; review not run"
//      (action_required, never green) when one finished without success.
//   6. Key 1: one fresh `claude -p` per owning team, its lead's spec and
//      checklists from main (key1_mode "per-team"); or, with key1_mode
//      "composite", one process for every owning team, given the base
//      checklist, each lead's key 1 section and every rule-named member
//      checklist, answering per team and per checklist. Key 2: the orchestrator's spec plus every owning
//      lead's spec and checklist, given key 1's results. For a founder-class
//      PR, once key 2 passed: the Founder Proxy (agent), its spec from main,
//      given both keys' results, on the strongest model.
//   7. Validates each JSON verdict (schema, head SHA, every cited file:line at
//      the head; the proxy may also say "needs-founder", with reasons); one
//      backoff retry on a failed call, then "review deferred".
//   8. Checks the head has not moved, then posts one comment per key and the
//      checks review/team-lead and review/executive. A comment or check run
//      identical to the App's latest one for that key, team and head is not
//      posted again (a rerun that reused its cached verdicts). review/executive is
//      success only with key 2 pass, no `hold` label, and, for a founder-class
//      PR, the Founder Proxy's pass on this head SHA. A proxy "needs-founder"
//      keeps it pending until the founder's own GitHub approval of this head
//      SHA; the loop labels such a PR needs-founder.
//
// Posting identity: the review App (env in github.mjs APP_ENV) posts check
// runs. Without it, the caller's gh login posts comments and commit statuses
// named dry-run/<check> that are never green, so nothing reads as a pass.
//
// Usage: node .github/scripts/pr-review/review.mjs <pr-number> [--no-post] [--fresh]
// Exit: 0 reviewed and posted (any verdict), 2 setup error, 3 another review
// holds the lock, 4 refused (not eligible), 5 the head moved (nothing posted).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../review-teams.mjs';
import {
  acquireLock, classify, founderClassBlock, key1SystemPrompt, markdownSection, key2SystemPrompt, logCall, NEEDS_FOUNDER, nonce, parseNameStatusZ, parseVerdictText,
  capFindings, prTextBlock, prTextDigest, proxySystemPrompt, PROXY_VERDICT_SCHEMA, renderComment, repairPrompt, requiredCi, REUSED_NOTE, statusDescription, userPrompt, validateVerdict,
  VERDICT_SCHEMA, verdictCacheName, withFounderClassBlock, COMPOSITE_TEAM, COMPOSITE_VERDICT_SCHEMA, compositeKey1SystemPrompt,
} from './lib.mjs';
import { claudeArgs, reviewerEnv, runWithRetry } from './claude.mjs';
import { deriveKeys, shadowNote } from './derive.mjs';
import { appConfigFromEnv, createClient, ghToken, installationToken } from './github.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const EXIT = { ok: 0, setup: 2, busy: 3, refused: 4, headMoved: 5 };

export function defaults(env = process.env) {
  return {
    claudeBin: env.NIRMAAN_CLAUDE_CODE || 'claude',
    stateDir: env.NIRMAAN_REVIEW_STATE_DIR || join(homedir(), '.nirmaan', 'pr-review'),
    // Key 2 and the Founder Proxy run on the strongest model.
    models: { key1: env.NIRMAAN_REVIEW_MODEL_KEY1 || 'sonnet', key2: env.NIRMAAN_REVIEW_MODEL_KEY2 || 'opus', proxy: env.NIRMAAN_REVIEW_MODEL_PROXY || 'opus' },
    timeoutMs: Number(env.NIRMAAN_REVIEW_TIMEOUT_SECONDS || 1200) * 1000,
    backoffMs: Number(env.NIRMAAN_REVIEW_BACKOFF_SECONDS || 90) * 1000,
  };
}

function git(repoRoot, args, opts = {}) {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

class HeadMoved extends Error {}

// Runs the whole review. `o` = { repoRoot, pr, config, github, post: 'app' |
// 'dry-run' | 'none', claudeBin, stateDir, models, timeoutMs, backoffMs,
// fresh, callerBranch, inClaudeSession, sleep, out, heldLock }.
export async function runReview(o) {
  const out = o.out ?? ((s) => console.log(s));
  const cfg = o.config;
  // The automated loop (pr-loop) passes the lock it already holds, so the
  // review and the fix round it belongs to are one turn of the shared lock.
  const lock = o.heldLock ? { ok: true, release: () => {} } : acquireLock(o.stateDir, { repo: cfg.repo, pr: o.pr });
  if (!lock.ok) {
    out(`pr-review: another review is running (${lock.holder ? `${lock.holder.repo} #${lock.holder.pr}, pid ${lock.holder.pid}` : 'unknown holder'}). Try again when it finishes.`);
    return { exit: EXIT.busy };
  }
  const worktrees = [];
  const posted = [];
  let wtRoot = null;
  try {
    // 2. Eligibility.
    const pull = await o.github.getPull(o.pr);
    const refuse = (why) => { out(`pr-review: refused: ${why}. Nothing was posted.`); return { exit: EXIT.refused, reason: why }; };
    if (pull.state !== 'open') return refuse(`PR #${o.pr} is ${pull.state}`);
    if (pull.baseRef !== cfg.base_branch) return refuse(`PR targets ${pull.baseRef}, not ${cfg.base_branch}`);
    if (pull.headRepo !== cfg.repo || pull.baseRepo !== cfg.repo) return refuse('the head branch is not in this repository (forks are never reviewed)');
    if (!cfg.allowed_authors.includes(pull.author)) return refuse(`author ${pull.author} is not one of ${cfg.allowed_authors.join(', ')}`);
    if (o.inClaudeSession && o.callerBranch && o.callerBranch === pull.headRef) {
      return refuse(`this Claude Code session has the PR's branch ${pull.headRef} checked out; a session never reviews its own PR (run it from another session or a terminal)`);
    }
    const headSha = pull.headSha;

    // 3. Fetch and worktrees.
    git(o.repoRoot, ['fetch', '--no-tags', '--quiet', 'origin', `+refs/heads/${cfg.base_branch}:refs/pr-review/main`, `+refs/pull/${o.pr}/head:refs/pr-review/pr-${o.pr}`]);
    const fetchedHead = git(o.repoRoot, ['rev-parse', `refs/pr-review/pr-${o.pr}`]).trim();
    if (fetchedHead !== headSha) { out(`pr-review: the head moved while fetching (${headSha.slice(0, 7)} -> ${fetchedHead.slice(0, 7)}). Nothing was posted; run again.`); return { exit: EXIT.headMoved }; }
    const mainSha = git(o.repoRoot, ['rev-parse', 'refs/pr-review/main']).trim();
    const baseSha = git(o.repoRoot, ['merge-base', mainSha, headSha]).trim();
    mkdirSync(join(o.stateDir, 'worktrees'), { recursive: true });
    wtRoot = mkdtempSync(join(o.stateDir, 'worktrees', `${cfg.repo.replace('/', '_')}-${o.pr}-`));
    const headDir = join(wtRoot, 'head'), mainDir = join(wtRoot, 'main');
    for (const [dir, sha] of [[headDir, headSha], [mainDir, mainSha]]) {
      git(o.repoRoot, ['worktree', 'add', '--quiet', '--detach', dir, sha]);
      worktrees.push(dir);
    }
    const ctx = { repo: cfg.repo, pr: o.pr, headSha, baseSha, mainSha, mainDir, headDir, company: cfg.company, dryRun: o.post === 'dry-run' };

    // Posting, guarded by the head check.
    const checkHead = async () => {
      const now = (await o.github.getPull(o.pr)).headSha;
      if (now !== headSha) throw new HeadMoved(`the head moved from ${headSha.slice(0, 7)} to ${now.slice(0, 7)} during the review`);
    };
    // What the review App already posted on this head, read once per run.
    const appLogin = cfg.review_app_slug ? `${cfg.review_app_slug}[bot]` : null;
    let headRuns = null, appComments = null;
    const checkRunsOnHead = async () => (headRuns ??= await o.github.listCheckRuns(headSha));
    const markerKey = (body) => body.split('\n')[0].replace(/ digest=[0-9a-f]+ -->$/, ' -->');
    const comment = async (body) => {
      await checkHead();
      if (o.post === 'none') { out(`----- comment (not posted)\n${body}`); posted.push({ type: 'comment', body }); return null; }
      if (o.post === 'app' && appLogin) {
        // The App's latest comment for this key, team and head; the same
        // digest means the same verdict, so it is linked, not posted again.
        appComments ??= (await o.github.listComments(o.pr)).filter((c) => c.author === appLogin);
        const marker = body.split('\n')[0];
        const last = appComments.filter((c) => markerKey(c.body ?? '') === markerKey(body)).pop();
        if (last && (last.body ?? '').split('\n')[0] === marker) {
          out(`pr-review: the same result is already posted for this key and head (${last.url}); not posted again.`);
          posted.push({ type: 'comment', body, url: last.url, reused: true });
          return last.url;
        }
      }
      const r = await o.github.createComment(o.pr, body);
      posted.push({ type: 'comment', body, url: r.url });
      return r.url;
    };
    const check = async (which, state, description, detailsUrl) => {
      await checkHead();
      const name = cfg.check_names[which];
      const desc = statusDescription(description);
      if (o.post === 'none') { out(`----- check ${name}: ${state}: ${desc} (not posted)`); posted.push({ type: 'check', name, state, description: desc }); return; }
      if (o.post === 'app') {
        // Not again when the App's latest run of this check on this head
        // already says the same.
        const want = state === 'pending' ? { status: 'in_progress', conclusion: null } : { status: 'completed', conclusion: state === 'success' || state === 'action_required' ? state : 'failure' };
        const latest = (await checkRunsOnHead()).filter((r) => r.name === name && r.app === cfg.review_app_slug)
          .sort((a, b) => String(b.startedAt ?? '').localeCompare(String(a.startedAt ?? '')) || (Number(b.id) || 0) - (Number(a.id) || 0))[0];
        if (latest && latest.status === want.status && (latest.conclusion ?? null) === want.conclusion && latest.title === desc) {
          out(`pr-review: check ${name} already says "${desc}" on this head; not posted again.`);
          posted.push({ type: 'check', name, state, description: desc, reused: true });
          return;
        }
        await o.github.createCheckRun({ name, headSha, state, title: desc, summary: `${desc}\n\nAgent review, not a sign-off.${detailsUrl ? ` Comment: ${detailsUrl}` : ''}`, detailsUrl });
        posted.push({ type: 'check', name, state, description: desc });
      } else {
        // Dry run with the caller's login: never green, and a context name the
        // ruleset does not require.
        const dryState = state === 'failure' || state === 'action_required' ? 'failure' : 'pending';
        await o.github.createStatus({ sha: headSha, context: `dry-run/${name}`, state: dryState, description: statusDescription(`dry run: ${description}`), targetUrl: detailsUrl });
        posted.push({ type: 'status', name: `dry-run/${name}`, state: dryState, description: `dry run: ${desc}` });
      }
    };

    // 4. Classification from main's map.
    const mapPath = join(mainDir, cfg.map_path);
    let map;
    try { map = parseYaml(readFileSync(mapPath, 'utf8')); } catch (e) {
      const why = `review map ${cfg.map_path} could not be read from main: ${e.message}`;
      await check('key1', 'pending', `review deferred: ${why}`);
      await check('key2', 'pending', `review deferred: ${why}`);
      return { exit: EXIT.ok, deferred: why, posted };
    }
    const files = parseNameStatusZ(git(o.repoRoot, ['diff', '--no-ext-diff', '--no-textconv', '--name-status', '-z', '-M', baseSha, headSha]));
    const diff = git(o.repoRoot, ['diff', '--no-ext-diff', '--no-textconv', '--no-color', '-M', baseSha, headSha]);
    const lsTree = (sha) => git(o.repoRoot, ['ls-tree', '-r', '--name-only', '-z', sha]).split('\0').filter(Boolean);
    const trackedHead = new Set(lsTree(headSha));
    const tracked = new Set([...trackedHead, ...lsTree(mainSha)]);
    const classification = classify(map, files, diff, tracked);
    ctx.classification = classification;
    out(`pr-review: #${o.pr} head ${headSha.slice(0, 7)}; owning teams: ${classification.teams.join(', ')}; founder classes: ${Object.keys(classification.founder).join(', ') || 'none'}`);

    // Key derivation in shadow mode (derive.mjs): who would hold the keys
    // under main's org chart, logged beside who holds them. It never changes
    // what is posted or who reviews, and any problem with it is only logged.
    let derived;
    try {
      const chartText = cfg.org_chart && existsSync(join(mainDir, cfg.org_chart)) ? readFileSync(join(mainDir, cfg.org_chart), 'utf8') : null;
      derived = chartText === null ? { ok: false, error: `no ${cfg.org_chart ?? 'org chart'} on main` }
        : deriveKeys(parseYaml(chartText), { teams: classification.teams, founderClasses: Object.keys(classification.founder), files: files.flatMap((f) => (f.from ? [f.from, f.path] : [f.path])) }, { noDeputyUnits: cfg.legal_teams });
    } catch (e) { derived = { ok: false, error: `derivation failed: ${e.message}` }; }
    logCall(o.stateDir, {
      kind: 'derive', repo: cfg.repo, pr: o.pr, head: headSha, ok: derived.ok, error: derived.ok ? null : derived.error,
      derived_key2: derived.ok ? derived.key2.occupant : null, derived_key2_position: derived.ok ? derived.key2.position : null, derived_reason: derived.ok ? derived.reason : null,
      derived_key2_deputy: derived.ok ? derived.key2.deputy?.occupant ?? null : null,
      derived_key1: derived.ok ? derived.key1.map((k) => ({ team: k.team, holder: k.occupant, position: k.position, rolled_up: k.rolledUp, deputy: k.deputy?.occupant ?? null })) : null,
      actual_key2: cfg.key2_role, actual_key1: classification.teams.map((id) => ({ team: id, holder: (map.teams ?? []).find((t) => t.id === id)?.lead ?? null })),
    });

    // The founder-class declaration in the PR body, kept by this script so a
    // PR flags its classes even when they come from content (a fixer cannot
    // edit PR text). Not edited with --no-post; the reviewers get it either way.
    ctx.founderBlock = founderClassBlock(map, Object.keys(classification.founder));
    const declaredBody = withFounderClassBlock(pull.body, ctx.founderBlock);
    if (declaredBody !== (pull.body ?? '')) {
      if (o.post !== 'none') {
        await o.github.updatePullBody(o.pr, declaredBody);
        out(`pr-review: ${ctx.founderBlock ? 'wrote the founder-class block into' : 'removed the founder-class block from'} the PR body.`);
      }
      pull.body = declaredBody;
    }

    // 5. CI first: the newest run of each required job on the head.
    const ciNow = requiredCi(cfg.required_ci, await checkRunsOnHead());
    if (ciNow.state === 'failed') {
      // Terminal: not "waiting". action_required is never green, and no
      // review ran, so neither key says pass or fail.
      const why = `CI failed on ${headSha.slice(0, 7)}: ${ciNow.text}; review not run`;
      await check('key1', 'action_required', why, ciNow.failed[0]?.url ?? undefined);
      await check('key2', 'action_required', why, ciNow.failed[0]?.url ?? undefined);
      out(`pr-review: ${why}. No model was called.`);
      return { exit: EXIT.ok, ciFailed: why, posted };
    }
    if (ciNow.state === 'pending') {
      const why = `waiting for CI on ${headSha.slice(0, 7)}: ${ciNow.text}`;
      await check('key1', 'pending', why);
      await check('key2', 'pending', why);
      out(`pr-review: ${why}. No model was called.`);
      return { exit: EXIT.ok, waiting: why, posted };
    }
    const ci = ciNow.jobs;
    ctx.ci = ci;
    ctx.files = files;

    // Shared prompt material.
    const n = nonce();
    const commits = git(o.repoRoot, ['log', '--format=%H%x00%B%x1e', `${baseSha}..${headSha}`]).split('\x1e').map((s) => s.trim()).filter(Boolean)
      .map((s) => { const [sha, message] = s.split('\0'); return { sha, message: (message ?? '').trim() }; });
    const prText = prTextBlock({ title: pull.title, body: pull.body, commits, includeBody: cfg.include_pr_body });
    const diffTruncated = Buffer.byteLength(diff) > cfg.max_diff_bytes;
    const diffForPrompt = diffTruncated ? Buffer.from(diff).subarray(0, cfg.max_diff_bytes).toString('utf8') : diff;
    const deleted = new Set(files.filter((f) => f.status === 'D').map((f) => f.path).concat(files.filter((f) => f.from).map((f) => f.from)));
    const fileLines = new Map();
    // A finding names the side its line is on (head, base or main); without
    // one, the head, or the base for a file the PR deletes.
    const sideSha = { head: headSha, base: baseSha, main: mainSha };
    // The lines of a file on a side, read once (empty when it is absent).
    const linesOf = (file, side) => {
      const ref = side ? sideSha[side] : trackedHead.has(file) ? headSha : deleted.has(file) ? baseSha : null;
      if (!ref) return [];
      const key = `${ref}:${file}`;
      if (!fileLines.has(key)) {
        try { const t = git(o.repoRoot, ['show', `${ref}:${file}`]); const l = t.split('\n'); if (t.endsWith('\n')) l.pop(); fileLines.set(key, l); } catch { fileLines.set(key, []); }
      }
      return fileLines.get(key);
    };
    const lineExists = (file, line, side) => line <= linesOf(file, side).length;
    // Text of lines from..to (1-based, clipped) on a side, for the quoted-snippet check.
    const linesText = (file, from, to, side) => linesOf(file, side).slice(Math.max(0, from - 1), Math.max(0, to)).join('\n');
    // Checklists, all from main. Where the specs carry them (agents/README.md
    // "Every key 1 (base checklist)", a lead's "Key 1 review", the key-2
    // role's "Key 2 review", a member's "Checklist for my team lead"), the
    // spec is the source; otherwise the skill's checklists/<name>.md. Neither
    // present: the key is deferred.
    const readMain = (rel) => readFileSync(join(mainDir, rel), 'utf8');
    const readMainOrNull = (rel) => (rel && existsSync(join(mainDir, rel)) ? readMain(rel) : null);
    const roleSpec = (role) => readMain(cfg.role_spec.replace('{role}', role));
    const skillChecklist = (name) => readMainOrNull(join(cfg.checklist_dir, `${name}.md`));
    const checklist = (name, fromSpec) => {
      if (fromSpec) return { name, text: fromSpec, source: 'spec' };
      const text = skillChecklist(name);
      if (text === null) throw new Error(`no checklist "${name}" on main (neither a spec section nor ${cfg.checklist_dir}/${name}.md)`);
      return { name, text, source: 'skill' };
    };
    const baseChecklist = () => checklist('key1-base', cfg.base_checklist ? markdownSection(readMainOrNull(cfg.base_checklist.file) ?? '', cfg.base_checklist.heading) : null);
    // A lead spec is loaded whole; when it has its own key section, that is the
    // team checklist and the skill file is not added.
    const teamChecklists = (teamId, lead) => (markdownSection(roleSpec(lead), cfg.lead_section) ? [] : [checklist(teamId)]);
    const memberText = (role) => markdownSection(roleSpec(role), cfg.member_section) ?? roleSpec(role);
    const teamsById = new Map((map.teams ?? []).map((t) => [t.id, t]));

    // One reviewer call, cached per (head, main, PR text, key, team, role) so
    // a rerun (after the founder decides a needs-founder PR, or after a
    // restart) does not spend another call. The reviewers read the title and
    // body (include_pr_body), so a change to either is a new review, not a
    // reused verdict; another role on the same key and team is a new review
    // too. The Founder Proxy is key "proxy" here. Each result carries when
    // the call started and ended and, when the output failed, the
    // validation error (for the loop's per-phase log line).
    const cacheDir = join(o.stateDir, 'verdicts', cfg.repo.replace('/', '_'), `pr-${o.pr}`);
    const textDigest = prTextDigest({ title: pull.title, body: pull.body, includeBody: cfg.include_pr_body });
    const review = async (call) => {
      const startedAt = new Date().toISOString();
      const r = await reviewCall(call);
      return { ...r, startedAt, endedAt: new Date().toISOString() };
    };
    const reviewCall = async ({ key, team, role, model, system, user, strict = false, maxFindings = null, composite = null }) => {
      const proxy = key === 'proxy';
      const cacheFile = join(cacheDir, verdictCacheName({ headSha, mainSha, textDigest, key, team, role }));
      if (!o.fresh && existsSync(cacheFile)) {
        const cached = JSON.parse(readFileSync(cacheFile, 'utf8'));
        logCall(o.stateDir, { repo: cfg.repo, pr: o.pr, head: headSha, key, team, role, model, attempt: 0, outcome: 'reused' });
        return { ...cached, reused: true, notes: [...(cached.notes ?? []), REUSED_NOTE] };
      }
      const args = claudeArgs({ model, systemPrompt: system, addDirs: [mainDir], schema: proxy ? PROXY_VERDICT_SCHEMA : composite ? COMPOSITE_VERDICT_SCHEMA : VERDICT_SCHEMA });
      const call = (input, phase) => runWithRetry(
        { bin: o.claudeBin, args, input, cwd: headDir, env: reviewerEnv(), timeoutMs: o.timeoutMs },
        {
          backoffMs: o.backoffMs, sleep: o.sleep,
          onAttempt: (res, attempt) => logCall(o.stateDir, { repo: cfg.repo, pr: o.pr, head: headSha, key, team, role, model, reported_model: res.reportedModel ?? null, attempt, ...(phase ? { phase } : {}), outcome: res.kind, duration_ms: res.durationMs, ...(res.tokens ?? {}), prompt_chars: system.length + input.length }),
        },
      );
      const parse = (r) => { try { return { raw: r.structured ?? parseVerdictText(r.text) }; } catch (e) { return { error: e.message }; } };
      const validate = (raw) => validateVerdict(raw, { headSha, lineExists, linesText, quoteWindow: cfg.quote_window, prTextLines: prText.count, proxy, strict, ...(composite ? { composite } : {}) });
      let r = await call(user, null);
      if (r.kind !== 'ok') return { status: 'deferred', reason: `${r.kind}: ${r.error} (after one backoff retry)`, callOutcome: r.kind, deferralKind: r.kind === 'rate_limit' ? 'rate-limit' : r.kind === 'timeout' ? 'timeout' : 'call-failed', ...(r.noOutput ? { noOutput: true } : {}), model };
      let p = parse(r);
      if (p.error) return { status: 'deferred', reason: `the reviewer's output is not valid JSON (${p.error})`, validationError: `not valid JSON: ${p.error}`, deferralKind: 'invalid-output', model };
      let v = validate(p.raw);
      const notes = [];
      if (!v.ok && v.repair) {
        // One repair run with the validator's exact error (decision R8). A
        // fail, or any blocker or critical finding, never comes back as a
        // pass; anything still wrong defers.
        const first = p.raw, firstError = v.error;
        const wasFail = first.verdict !== 'pass' || (Array.isArray(first.findings) ? first.findings : []).some((f) => f && (f.severity === 'blocker' || f.severity === 'critical'));
        r = await call(repairPrompt(user, { nonce: nonce(), error: firstError, previous: JSON.stringify(first, null, 2) }), 'repair');
        if (r.kind !== 'ok') return { status: 'deferred', reason: `the verdict failed validation (${firstError}) and the repair run failed: ${r.kind}: ${r.error}`, validationError: firstError, callOutcome: r.kind, deferralKind: r.kind === 'rate_limit' ? 'rate-limit' : r.kind === 'timeout' ? 'timeout' : 'call-failed', model };
        p = parse(r);
        if (p.error) return { status: 'deferred', reason: `the verdict failed validation (${firstError}); the repair run's output is not valid JSON (${p.error})`, validationError: firstError, deferralKind: 'invalid-output', model };
        v = validate(p.raw);
        if (!v.ok) return { status: 'deferred', reason: `the verdict failed validation after one repair run: ${v.error}`, validationError: v.error, deferralKind: 'validation', model };
        if (wasFail && v.verdict.verdict === 'pass') return { status: 'deferred', reason: `the repair run turned a fail into a pass (first error: ${firstError}); a bad citation never becomes a pass`, validationError: firstError, deferralKind: 'validation', model };
        notes.push(`One repair run after citation validation failed (${firstError}).`);
      }
      if (!v.ok) return { status: 'deferred', reason: `the verdict failed validation: ${v.error}`, validationError: v.error, deferralKind: 'validation', model };
      let verdict = v.verdict;
      notes.push(...v.notes);
      if (maxFindings) {
        const c = capFindings(verdict, maxFindings);
        verdict = c.verdict;
        if (c.note) notes.push(c.note);
      }
      const result = { status: verdict.verdict, verdict, notes, model: r.reportedModel ?? model };
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(cacheFile, JSON.stringify(result));
      return result;
    };
    const promptCtx = { ...ctx, nonce: n, prText: prText.text, diff: diffForPrompt, diffTruncated, maxDiffBytes: cfg.max_diff_bytes };

    // Citation strictness (decision R8.5): findings from the legal and claims
    // checklists are never dropped. Before findings name their checklist, a
    // key 1 is strict when its team, or a member checklist it loads, is in
    // config strict_citations; key 2 and the proxy when any key 1 was.
    const strictCfg = cfg.strict_citations ?? { teams: [], checklists: [] };
    const strictKey1 = (teamId) => strictCfg.teams.includes(teamId) || classification.checklists.some((c) => strictCfg.checklists.includes(c) && new Set([teamsById.get(teamId)?.lead, ...(teamsById.get(teamId)?.members ?? [])]).has(c));
    const strictAny = classification.teams.some(strictKey1);

    // 6. Key 1: one process per owning team (key1_mode "per-team", the
    // setting today), or one composite process for every owning team
    // (key1_mode "composite").
    const key1 = [];
    const plan = (cfg.key1_mode ?? 'per-team') === 'composite' && classification.teams.length ? compositePlan() : null;
    if (plan?.tooBig) out(`pr-review: ${plan.tooBig}; key 1 runs per team on this head.`);
    if (plan && !plan.tooBig) key1.push(await compositeKey1(plan));
    else for (const teamId of classification.teams) {
      const team = teamsById.get(teamId);
      const base = { key: 1, team: teamId, teamName: team?.name ?? teamId, role: team?.lead ?? 'unknown', checkName: cfg.check_names.key1, legal: cfg.legal_teams.includes(teamId) };
      let system;
      try {
        if (!team) throw new Error(`team ${teamId} is not in main's map`);
        const members = new Set([team.lead, ...(team.members ?? [])]);
        const memberSpecs = classification.checklists.filter((c) => members.has(c) && c !== team.lead).map((role) => ({ role, text: memberText(role) }));
        system = key1SystemPrompt({ ...promptCtx, team, lead: team.lead, leadSpec: roleSpec(team.lead), checklists: [baseChecklist(), ...teamChecklists(teamId, team.lead)], memberSpecs });
      } catch (e) {
        key1.push({ ...base, status: 'deferred', reason: `spec or checklist missing on main: ${e.message}`, deferralKind: 'missing-spec' });
        continue;
      }
      // A team whose standard document does not exist on main yet fails
      // closed (Design until docs/design/visual-direction.md is on main).
      const missing = (cfg.fail_closed_without?.[teamId] ?? []).filter((rel) => !existsSync(join(mainDir, rel)));
      if (missing.length) {
        key1.push({ ...base, status: 'deferred', reason: `${missing.join(', ')} does not exist on main, so ${base.teamName} key 1 cannot review against it; no model was called`, deferralKind: 'missing-standard' });
        continue;
      }
      const user = userPrompt({ ...promptCtx, key: 1, team: teamId });
      out(`pr-review: key 1 for ${base.teamName} (${base.role})...`);
      let res = { ...base, ...(await review({ key: 1, team: teamId, role: base.role, model: o.models.key1, system, user, strict: strictKey1(teamId) })) };
      // Deputy try (decision D4.4): when the lead's call timed out, or its
      // process failed with no output at all (after its retry), the unit's
      // deputy from main's org chart gets one try, marked "deputy" on the
      // comment and the check. Not for a rate limit (same plan); not for any
      // failure that produced output (an error result, invalid output or
      // failed validation: PR text can induce those); not for a missing
      // spec or the legal team (no deputy). If the deputy does not answer either, the key defers as
      // before and the loop stops. A repair run that times out after a
      // failed validation is still a failed validation: no deputy.
      const dep = derived.ok ? derived.key1.find((k) => k.team === teamId)?.deputy?.occupant : null;
      const noAnswer = res.deferralKind === 'timeout' || (res.deferralKind === 'call-failed' && res.noOutput === true);
      if (res.status === 'deferred' && noAnswer && !res.validationError && dep && !cfg.legal_teams.includes(teamId)) {
        try {
          const leadSection = markdownSection(roleSpec(team.lead), cfg.lead_section);
          const dsys = key1SystemPrompt({
            ...promptCtx, team, lead: `${dep}, deputy for ${team.lead}`, leadSpec: roleSpec(dep),
            checklists: [baseChecklist(), ...(leadSection ? [{ name: `${team.lead} Key 1 review`, text: leadSection, source: 'spec' }] : teamChecklists(teamId, team.lead))],
            memberSpecs: classification.checklists.filter((c) => new Set([team.lead, ...(team.members ?? [])]).has(c) && c !== team.lead).map((role) => ({ role, text: memberText(role) })),
          });
          out(`pr-review: key 1 for ${base.teamName}: ${base.role} did not answer (${res.deferralKind}); deputy ${dep}...`);
          const first = res.reason;
          res = { ...base, role: `${dep} (deputy for ${team.lead})`, deputy: dep, ...(await review({ key: 1, team: teamId, role: dep, model: o.models.key1, system: dsys, user, strict: strictKey1(teamId) })) };
          res.notes = [...(res.notes ?? []), `Deputy: ${team.lead} did not answer (${first}); ${dep}, the unit's deputy in main's org chart, reviewed instead (one try).`];
        } catch (e) {
          res.notes = [...(res.notes ?? []), `No deputy try: ${e.message}.`];
        }
      }
      key1.push(res);
    }

    // The composite key 1's inputs: the base checklist once, each owning
    // team's lead "Key 1 review" section (or the team's skill checklist), and
    // every member checklist the map's rules name, whichever team the role is
    // in. Each checklist knows its team, for strictness and fix routing.
    function compositePlan() {
      const teams = [...classification.teams].sort();
      const roleTeam = (role) => (map.teams ?? []).find((t) => t.lead === role || (t.members ?? []).includes(role));
      try {
        const plan = { teams: [], members: [], base: baseChecklist(), team: new Map() };
        for (const id of teams) {
          const team = teamsById.get(id);
          if (!team) throw new Error(`team ${id} is not in main's map`);
          const section = markdownSection(roleSpec(team.lead), cfg.lead_section);
          const c = section ? { name: team.lead, text: section } : { name: id, text: checklist(id).text };
          plan.teams.push({ id, name: team.name ?? id, lead: team.lead, checklist: c });
          plan.team.set(c.name, id);
        }
        const leadsGiven = new Set(plan.teams.map((t) => t.lead));
        for (const role of [...classification.checklists].sort()) {
          if (leadsGiven.has(role)) continue; // its key 1 section is already in
          const t = roleTeam(role);
          const text = t?.lead === role ? (markdownSection(roleSpec(role), cfg.lead_section) ?? roleSpec(role)) : memberText(role);
          plan.members.push({ name: role, team: t?.id ?? null, text });
          plan.team.set(role, t?.id ?? null);
        }
        plan.names = [plan.base.name, ...plan.teams.map((t) => t.checklist.name), ...plan.members.map((m) => m.name)];
        const max = cfg.key1_composite_max_checklists;
        if (Number.isInteger(max) && plan.names.length > max) return { tooBig: `${plan.names.length} checklists, over key1_composite_max_checklists (${max})` };
        return plan;
      } catch (e) {
        return { error: e.message };
      }
    }
    async function compositeKey1(p) {
      const ids = [...classification.teams].sort();
      const named = ids.map((id) => teamsById.get(id)?.name ?? id);
      const base = { key: 1, team: COMPOSITE_TEAM, composite: true, teams: ids, teamName: named.join(', '), role: ids.map((id) => teamsById.get(id)?.lead ?? 'unknown').join(', '), checkName: cfg.check_names.key1, legal: ids.some((id) => cfg.legal_teams.includes(id)) };
      if (p.error) return { ...base, status: 'deferred', reason: `spec or checklist missing on main: ${p.error}` };
      const missing = ids.flatMap((id) => (cfg.fail_closed_without?.[id] ?? []).filter((rel) => !existsSync(join(mainDir, rel))));
      if (missing.length) return { ...base, status: 'deferred', reason: `${missing.join(', ')} does not exist on main, so the composite key 1 cannot review against it; no model was called` };
      const system = compositeKey1SystemPrompt({ ...promptCtx, teams: p.teams, base: p.base, members: p.members });
      const user = userPrompt({ ...promptCtx, key: 1, composite: true });
      // Strictness per finding, by its checklist: a strict checklist, a
      // checklist of a strict team, or the base checklist when any owning
      // team is strict.
      const strictTeamAny = ids.some((id) => strictCfg.teams.includes(id));
      const strict = (f) => strictCfg.checklists.includes(f.checklist) || strictCfg.teams.includes(p.team.get(f.checklist)) || (f.checklist === p.base.name && strictTeamAny);
      out(`pr-review: key 1, composite for ${base.teamName}...`);
      const r = await review({ key: 1, team: COMPOSITE_TEAM, role: base.role, model: o.models.key1, system, user, strict, composite: { teams: ids, checklists: p.names } });
      // Each finding carries its checklist's team, for the loop's fix routing.
      if (r.verdict) r.verdict = { ...r.verdict, findings: r.verdict.findings.map((f) => ({ ...f, team: p.team.get(f.checklist) ?? null })) };
      return { ...base, ...r };
    }
    const failedTeamNames = (r) => (r.composite && r.verdict ? `composite: ${(r.verdict.teams ?? []).filter((t) => t.verdict === 'fail').map((t) => teamsById.get(t.team)?.name ?? t.team).join(', ') || 'see findings'}` : r.teamName);

    // Post key 1.
    for (const r of key1) r.url = await comment(renderComment(r, ctx));
    const k1fail = key1.filter((r) => r.status === 'fail'), k1def = key1.filter((r) => r.status === 'deferred');
    const sha7 = headSha.slice(0, 7);
    const who = key1.length === 1 ? key1[0].role : `${key1.length} team leads${key1.some((r) => r.deputy) ? ', with a deputy' : ''}`;
    const k1url = (k1fail[0] ?? k1def[0] ?? key1[0])?.url;
    if (key1.length === 0) await check('key1', 'pending', `review deferred: no owning team computed for ${sha7}`);
    else if (k1fail.length) await check('key1', 'failure', `agent review (${who}), head ${sha7}: fail (${k1fail.map(failedTeamNames).join(', ')})`, k1url);
    else if (k1def.length) await check('key1', 'pending', `agent review (${who}), head ${sha7}: review deferred (${k1def.map((r) => r.teamName).join(', ')})`, k1url);
    else await check('key1', 'success', `agent review (${who}), head ${sha7}: pass`, k1url);

    // 7. Key 2.
    const k2base = { key: 2, team: null, teamName: cfg.key2_name, role: cfg.key2_role, checkName: cfg.check_names.key2, legal: key1.some((r) => r.legal) };
    if (key1.length === 0 || k1fail.length || k1def.length) {
      await check('key2', 'pending', `not run: key 1 did not pass on ${sha7}`);
      return { exit: EXIT.ok, key1, key2: null, posted, classification };
    }
    let k2;
    try {
      const teams = classification.teams.map((id) => { const t = teamsById.get(id); return { name: t.name, lead: t.lead, leadSpec: roleSpec(t.lead) }; });
      // The generic Key 2 checklist always loads, also when the key-2 role's
      // spec has its own "Key 2 review" section (loaded with the whole spec):
      // the generic one is the floor any key-2 holder reviews against.
      const checklists = [checklist('key2'), baseChecklist(), ...classification.teams.flatMap((id) => teamChecklists(id, teamsById.get(id).lead))];
      const system = key2SystemPrompt({ ...promptCtx, role: cfg.key2_role, roleSpec: roleSpec(cfg.key2_role), checklists, teams, maxFindings: cfg.key2_max_findings ?? null });
      const key1Results = key1.map((r) => ({ team: r.team, role: r.role, verdict: r.verdict }));
      const user = userPrompt({ ...promptCtx, key: 2, key1Results });
      out(`pr-review: key 2 (${cfg.key2_role})...`);
      k2 = { ...k2base, ...(await review({ key: 2, team: null, role: cfg.key2_role, model: o.models.key2, system, user, strict: strictAny, maxFindings: cfg.key2_max_findings ?? null })) };
    } catch (e) {
      k2 = { ...k2base, status: 'deferred', reason: `spec or checklist missing on main: ${e.message}`, deferralKind: 'missing-spec' };
    }

    // The Founder Proxy (agent): founder-class PRs only, and only once key 2
    // passed on this head. It takes the founder's place as the third
    // reviewer (the founder's delegation of 2026-10-18); what the founder
    // keeps it returns as "needs-founder".
    const founderClassesFound = Object.keys(classification.founder);
    const held = pull.labels.includes(cfg.hold_label);
    k2.notes = [...(k2.notes ?? [])];
    if (founderClassesFound.length) k2.notes.push(`Founder classes ${founderClassesFound.join(', ')}: ${k2.status === 'pass' ? 'the Founder Proxy (agent) reviews this head next' : 'the Founder Proxy (agent) runs only after key 2 passes'}; review/executive passes only when key 2 and the proxy pass. Key 2 never substitutes for the founder.`);
    if (held) k2.notes.push(`The "${cfg.hold_label}" label is set: review/executive is not passed.`);
    if (classification.notify.length) k2.notes.push(`Notify: ${classification.notify.join(', ')}.`);
    k2.notes.push(shadowNote(derived, cfg.key2_role));
    k2.url = await comment(renderComment(k2, ctx));

    let proxy = null;
    let founderApproved = false;
    if (founderClassesFound.length && k2.status === 'pass') {
      const pbase = { key: 'proxy', team: null, teamName: cfg.proxy_name, role: cfg.proxy_role, checkName: cfg.check_names.key2, legal: k2.legal };
      try {
        const system = proxySystemPrompt({ ...promptCtx, role: cfg.proxy_role, roleSpec: roleSpec(cfg.proxy_role) });
        const user = userPrompt({
          ...promptCtx, key: 'proxy',
          key1Results: key1.map((r) => ({ team: r.team, role: r.role, verdict: r.verdict })),
          key2Result: { role: cfg.key2_role, verdict: k2.verdict },
        });
        out(`pr-review: Founder Proxy (${cfg.proxy_role})...`);
        proxy = { ...pbase, ...(await review({ key: 'proxy', team: null, role: cfg.proxy_role, model: o.models.proxy, system, user, strict: strictAny })) };
      } catch (e) {
        proxy = { ...pbase, status: 'deferred', reason: `spec missing on main: ${e.message}`, deferralKind: 'missing-spec' };
      }
      proxy.notes = [...(proxy.notes ?? [])];
      if (proxy.status === NEEDS_FOUNDER) {
        // Only the founder decides these: their own GitHub review, the latest
        // one, approving this head SHA.
        const mine = (await o.github.listReviews(o.pr)).filter((r) => r.login === cfg.founder_login && ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(r.state));
        const last = mine[mine.length - 1];
        founderApproved = !!last && last.state === 'APPROVED' && last.commitId === headSha;
        proxy.notes.push(founderApproved
          ? `The founder's own GitHub review approves head ${sha7}: that is the founder's decision on the changes above, not the proxy's.`
          : `review/executive stays pending: the founder decides these changes, on GitHub, on head ${sha7}.`);
      }
      proxy.url = await comment(renderComment(proxy, ctx));
    }

    const desc = `agent review (${cfg.key2_role}), head ${sha7}`;
    const pdesc = `${desc}: key 2 pass; Founder Proxy (agent)`;
    if (k2.status === 'fail') await check('key2', 'failure', `${desc}: fail`, k2.url);
    else if (k2.status === 'deferred') await check('key2', 'pending', `${desc}: review deferred`, k2.url);
    else if (proxy?.status === 'fail') await check('key2', 'failure', `${pdesc}: fail`, proxy.url);
    else if (proxy?.status === 'deferred') await check('key2', 'pending', `${pdesc}: review deferred`, proxy.url);
    else if (proxy?.status === NEEDS_FOUNDER && !founderApproved) await check('key2', 'pending', `${pdesc}: needs the founder (class ${founderClassesFound.join(', ')})`, proxy.url);
    else if (held) await check('key2', 'pending', `${desc}: pass; held by the ${cfg.hold_label} label`, (proxy ?? k2).url);
    else if (proxy?.status === NEEDS_FOUNDER) await check('key2', 'success', `${pdesc}: needs the founder; the founder's review approves this head`, proxy.url);
    else if (proxy) await check('key2', 'success', `${pdesc}: pass`, proxy.url);
    else await check('key2', 'success', `${desc}: pass`, k2.url);
    return { exit: EXIT.ok, key1, key2: k2, proxy, founderApproved, posted, classification };
  } catch (e) {
    if (e instanceof HeadMoved) { out(`pr-review: ${e.message}. Nothing more was posted; run again on the new head.`); return { exit: EXIT.headMoved, posted }; }
    throw e;
  } finally {
    for (const dir of worktrees) { try { git(o.repoRoot, ['worktree', 'remove', '--force', dir]); } catch { rmSync(dir, { recursive: true, force: true }); } }
    // The per-run parent folder too, or an empty one is left for every run.
    if (wtRoot) { try { rmSync(wtRoot, { recursive: true, force: true }); } catch { /* best effort */ } }
    try { git(o.repoRoot, ['worktree', 'prune']); } catch { /* best effort */ }
    lock.release();
  }
}

// The script must be main's copy when it posts, so a PR cannot review itself
// under a script it rewrote. Returns the files that differ.
export function differsFromMain(repoRoot, base = 'main') {
  const rels = ['.github/scripts/review-teams.mjs', '.github/scripts/org-chart.mjs', ...readdirSync(HERE).filter((f) => !f.endsWith('.test.mjs') && f !== 'fixtures').map((f) => `.github/scripts/pr-review/${f}`)];
  const differ = [];
  for (const rel of rels) {
    let onMain = null;
    try { onMain = git(repoRoot, ['show', `refs/pr-review/main:${rel}`]); } catch { /* absent on main */ }
    if (onMain === null || onMain !== readFileSync(join(repoRoot, rel), 'utf8')) differ.push(rel);
  }
  return differ;
}

async function main(argv) {
  const pr = Number(argv.find((a) => /^\d+$/.test(a)));
  if (!pr) { console.error('usage: review.mjs <pr-number> [--no-post] [--fresh]'); return EXIT.setup; }
  const config = JSON.parse(readFileSync(join(HERE, 'config.json'), 'utf8'));
  const repoRoot = resolve(HERE, '..', '..', '..');
  const noPost = argv.includes('--no-post');
  const d = defaults();
  let github, post;
  try {
    const app = appConfigFromEnv();
    if (noPost) { github = createClient({ repo: config.repo, token: ghToken() }); post = 'none'; }
    else if (app) { github = createClient({ repo: config.repo, token: await installationToken(app, config.repo) }); post = 'app'; }
    else { github = createClient({ repo: config.repo, token: ghToken() }); post = 'dry-run'; console.log('pr-review: no review App configured; dry run (comments and never-green dry-run/ statuses).'); }
  } catch (e) { console.error(`pr-review: could not get a GitHub token: ${e.message}`); return EXIT.setup; }
  if (post !== 'none') {
    git(repoRoot, ['fetch', '--no-tags', '--quiet', 'origin', `+refs/heads/${config.base_branch}:refs/pr-review/main`]);
    const differ = differsFromMain(repoRoot);
    if (differ.length) {
      console.error(`pr-review: refusing to post: this copy of the script differs from main (${differ.join(', ')}). Run it from a checkout of origin/main, or use --no-post.`);
      return EXIT.refused;
    }
  }
  let callerBranch = null;
  try { callerBranch = git(process.cwd(), ['rev-parse', '--abbrev-ref', 'HEAD']).trim(); } catch { /* not in a repository */ }
  const r = await runReview({
    repoRoot, pr, config, github, post, ...d, fresh: argv.includes('--fresh'),
    callerBranch, inClaudeSession: !!process.env.CLAUDECODE,
  });
  return r.exit;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(`pr-review: ${e.stack || e.message}`); process.exit(EXIT.setup); });
}
