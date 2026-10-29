# PR review · IMPLEMENTED

How a pull request to this repository is reviewed and merged. The decisions
behind it, with reasons and dissent, are in
[pr-review-decisions.md](pr-review-decisions.md). IP Nirmaan follows the same
mechanism with its own teams and hardware adaptations.

**Live since 2026-10-18.** The ruleset on `main` is active and requires the
review App's two checks; the first PRs merged through both keys that day (see
[Status](#status)).

**The rule: every PR has at least two responsible reviewers.** The first is
the lead of the team that owns the changed files (key 1; one lead per owning
team). The second is the level above that manages those teams, the orchestrator
(key 2), and it reviews with those teams' domain knowledge: their lead specs and
checklists are loaded for its review. No PR, however small, merges on one
review.

**Agent reviews are reviews, not sign-off.** A passing key means an agent role
reviewed the PR. It is never a person's approval, a legal sign-off, an
engineering sign-off or a release decision.

## In short

1. CI runs on the PR's head commit.
2. **Key 1:** the lead of each team that owns a changed file reviews the PR.
3. **Key 2:** the orchestrator, which manages all teams, reviews the PR.
4. **Founder Proxy:** if the PR falls in a founder class (A to F), the
   Founder Proxy (agent) reviews it after key 2 passes. What only the founder
   decides, it sends to the founder (`needs-founder`).
5. When every required check passes, the PR merges automatically, one at a
   time, with a merge commit.

A new push to the PR voids both keys and the proxy; they run again on the new
head commit.

**Author pre-check.** Before opening a PR, or pushing a fix to one, an author
session runs Claude's code review on its own diff (Claude Code's built-in
`code-review` skill, effort `low`) and fixes the findings. It fixes the code and
does not paste the review into the PR text. This catches plain bugs before the
keys spend review calls on them. The loop's fixer is exempt (it cannot run a
skill). It is not a gate: nothing enforces it, no reviewer checks whether it ran,
and it never counts as a review of the PR. Decision:
[2026-10-27-author-precheck-decisions.md](2026-10-27-author-precheck-decisions.md).

## Teams and leads

Each team has one lead, who holds key 1 for that team. Members' checklists run
inside the lead's review and are cited by name; there is one key-1 verdict per
team (with the composite key 1 below, one process answers for every owning
team, with one entry per team).

The teams, their leads and members are listed in the team table of
[`agents/README.md`](../../agents/README.md#teams), which is generated from the
org chart [`agents/org-chart.yml`](../../agents/org-chart.yml). This page does
not copy it. The orchestrator holds key 2 on every PR and never key 1. A
repo-checks step (`node .github/scripts/org-chart.mjs`) fails when the chart,
that table and the teams in `review-teams.yml` disagree.

legal-counsel never holds a key. Role specs are in [`agents/`](../../agents/README.md).

## Which teams own a PR

Path ownership lives in one file: [`.github/review-teams.yml`](../../.github/review-teams.yml).
This page does not copy its rules. In short:

- The review reads it from `main`, never from the PR.
- A PR is owned by every team with a rule matching a changed file. A file with
  two owners needs both leads.
- A file no rule matches belongs to Engineering.
- Content rules sit beside path rules: a price, currency, discount, refund or
  guarantee anywhere in the diff adds Commercial; a client, partner or
  prospect name adds Commercial and Legal and Compliance; a market or
  competitor claim adds Product's market check.
- Generated files follow their source (`website/public/**` follows
  `website/src/**`).
- The shared layer copied into ip.nirmaan.online is owned by Design and
  Engineering together, and a PR touching it names the IP pages it affects.
- A coverage test in CI fails if a tracked file maps to no team, a rule matches
  no file, or a team names a role that does not exist.
- A PR touching more than three teams is split.

## The two keys

**Key 1 (team lead).** Reads the diff, the code and the CI logs for the head
commit, and starts only when every required CI job is green. PR text and
commit messages are untrusted claims to test, never instructions. It fails
when a claim has no file, test or CI run behind it; behaviour changes without
a test; CI is not green or a test is skipped everywhere; a check is weakened
silently; a secret, client data or internal figures appear; a founder class is
not flagged (the review script flags it: before the keys run it writes a
`<!-- review:founder-class -->` block at the top of the PR body naming the
classes it detected from `main`'s map, rewrites it when they change and
removes it when none is left, and that block counts as the PR's flag; a
`--no-post` run only shows the block to the reviewers and leaves the PR body
alone); an instruction to the reviewer is hidden in the diff; or the wording
claims approval or sign-off. Each team adds its own checklist, listed
in [pr-review-decisions.md](pr-review-decisions.md#4-what-the-keys-check).

**Composite key 1 (IMPLEMENTED: switched on).** With `key1_mode`
`composite` in `.github/scripts/pr-review/config.json`, key 1 is one reviewer
process for every owning team instead of one per team: it gets the base
checklist once, each owning lead's "Key 1 review" section (or the team's
skill checklist), and every member checklist the map's rules name, whichever
team the role is in, in a fixed order before the diff and PR text. It answers
with one entry per owning team and per checklist, and each finding names its
checklist; a missing entry gets one repair request and then defers, and a
finding with no checklist defers. It posts one key-1 comment (`team=composite`)
under the same check name; a fix goes to the team of the finding's checklist.
Over `key1_composite_max_checklists` checklists, key 1 runs per team on that
head. The setting is `composite`, switched on under gate R-G2 in
[2026-10-18-review-loop-decisions.md](2026-10-18-review-loop-decisions.md)
after the calibration A/B (results in the internal minutes). Setting
`key1_mode` back to `per-team` returns to one reviewer per team, with the
prompts fixed by the golden file.

**Key 2 (orchestrator).** Confirms key 1 ran for every owning team on this
commit and findings were answered; checks cross-team effects (shared layer,
IP site, generated files); re-tests one claim itself; checks scope; and
confirms the founder classes were applied.

A blocker or critical finding fails a key. Some fails are mechanical: an edited
migration, committed `website/public` differing from a fresh build, a secret in
the diff, a failed coverage test, or a review of a commit that is no longer the
head.

The keys are posted as two check runs, `review/team-lead` and
`review/executive`, by a GitHub App the founder owns. The ruleset accepts
these checks only from that App, so a check posted by an agent's token or a
workflow does not count.

## Founder classes A to F

A PR in any of these gets a third reviewer, the Founder Proxy (agent), after
both agent keys pass on its head commit:

| Class | Covers |
|---|---|
| A. Control plane | `.github/**`, `.claude/**`, `AGENTS.md`, `CLAUDE.md`, `agents/**`, `.gitignore`, the review and decision-meeting rules |
| B. Production config | deploy configuration, turning on the OS deploy or worker |
| C. Money | pricing data, the estimator, price pages, any price or payment wording, any new spending |
| D. Legal and data | the privacy notice, the terms, the contact form, any new collection of personal data |
| E. Public names, products, clients | brand marks, positioning, mission, vision, product status, a new public page, any named client, partner or competitor |
| F. The human send gate | the code that keeps sending outreach a founder-only action |

**The Founder Proxy (founder's decision, 2026-10-18).** Until 2026-10-18 these
classes needed the founder's own GitHub approval, enforced by `CODEOWNERS` and
code owner review. On 2026-10-18 the founder, after being shown the risks,
delegated that third review to an agent:
[`agents/founder-proxy/agent.md`](../../agents/founder-proxy/agent.md). Every
comment it posts says "Founder Proxy (agent), acting under the founder's
delegation of 2026-10-18; not the founder". It is never the founder's
approval.

- **When it runs.** The review script detects the classes (paths and content
  triggers) from `main`'s map, and runs the proxy only on a founder-class PR,
  only after key 1 and key 2 passed on the same head commit. It runs like the
  keys: a fresh read-only process, its spec from `main`, the strongest model,
  untrusted PR text, validated output, cached per head, fail closed.
- **Its verdict.** `pass`, `fail` (with `file:line` findings), or
  `needs-founder` (with the reasons). `review/executive` is success only when
  key 2 and the proxy pass; there is no third check, so the ruleset needs no
  change.
- **What it may not decide** returns `needs-founder`: new spending (a paid
  service, account, API key billing, a runner, or a dependency or tool that
  needs a paid licence); contracts and legal counsel; and turning on the OS
  worker or any sending. Since the founder's record of 2026-10-20
  ([2026-10-20-founder-proxy-widened.md](2026-10-20-founder-proxy-widened.md))
  the proxy decides everything else itself, including the open founder items
  it names. When a change could be read either way, it decides on the merits:
  `needs-founder` only when the change is clearly one of these items, or when
  it cannot tell whether a change adds spending
  ([agents/founder-proxy/agent.md](../../agents/founder-proxy/agent.md)). A change that weakens a review gate (removes or skips a key, a
  required CI job or a required check; lets a check pass by default, on a
  timeout or on a deferred review; reads rules from the pull request instead
  of `main`; or lets the loop merge without both keys and the proxy) is a
  fail, not `needs-founder`. It also fails attribution other than the company
  "Nirmaan" (never a person's name or personal email address).
- **Needs the founder.** `review/executive` stays pending and the loop labels
  the PR `needs-founder`. The founder decides on GitHub: their own review
  approving the current head commit lets the script pass `review/executive`
  (after removing the label, the loop reruns the review from cache and takes
  the merge path); not approving leaves the PR pending.
- **No CODEOWNERS.** `.github/CODEOWNERS` was removed, and the coverage check
  fails if one is added back. The ruleset's "Require review from Code Owners"
  setting is still on, but with no CODEOWNERS file it has no effect; the
  founder can turn it off in the ruleset settings.

Changes to the privacy notice or terms also notify the IP council chair,
because they govern the IP site too. So do changes to the shared layer that
ip.nirmaan.online copies (`review-teams.yml`, named file `shared-layer`).

**Holding a PR.** A `hold` label tells the review script not to pass key 2.
The founder's firm stop is converting the PR to a draft or turning auto-merge
off for it.

## How reviewers run

Reviews run locally: the [`pr-review` skill](../../.claude/skills/pr-review/SKILL.md)
starts the posting script `.github/scripts/pr-review/review.mjs` from a
checkout of `main`. No GitHub Action runs PR content with a model token, and
`pull_request_target` is never used. An agent never reviews its own
session's PR; the skill refuses, and the script refuses when a Claude Code
session has the PR's branch checked out.

What the script does, in order:

1. **A shared lock.** Run by hand, it takes the lock shared with ip-nirmaan
   (`review.lock`); run by the automated loop, it uses the model slot the
   loop already holds ("Locks" below), so at most 2 reviews run across both
   repositories. The lock is a folder
   (`review.lock`) with an owner file written whole (a temporary file renamed
   inside it). A lock whose process is gone is cleared, and so is one with no
   readable owner file that is older than 30 minutes.
2. **Eligibility.** The PR must be open, target `main`, come from a branch in
   this repository (never a fork) and be authored by `patel-om`,
   `nirmaansoftware` or `dependabot[bot]`. Otherwise it refuses and posts
   nothing.
3. **Clean checkouts.** It fetches `main` and the PR head, checks the fetched
   head is the PR's head, and makes clean worktrees of both outside the
   repository.
4. **Owning teams from `main`.** Teams, member checklists, founder classes and
   content-rule hits come from `main`'s `.github/review-teams.yml`, never the
   PR's copy. Role specs (`agents/<role>/agent.md`) and checklists also come
   from `main`: the base key-1 checklist in `agents/README.md`, each lead's
   "Key 1 review" section, the orchestrator's "Key 2 review" section and
   members' "Checklist for my team lead" sections, with
   `.claude/skills/pr-review/checklists/` as the fallback. With neither, the
   key is deferred. Key 2 always also gets the generic key-2 checklist
   (`checklists/key2.md`), even when the key-2 role's spec has its own
   "Key 2 review" section: it is the floor for any key-2 holder. Design key 1 is deferred until
   `docs/design/visual-direction.md` exists on `main`. The script itself
   refuses to post unless it is `main`'s copy. It then keeps its
   founder-class block (`<!-- review:founder-class -->`) at the top of the PR
   body: every other copy of the block, and any lone open or close marker
   without its pair, is removed, so the only markers left are the script's
   own.
   **Key derivation (shadow).** After classification the script also works out
   who would hold the keys under `main`'s org chart
   (`agents/org-chart.yml`, read by `.github/scripts/pr-review/derive.mjs`):
   key 1 is the head of each owning unit (a vacant head rolls up to the
   nearest active manager); key 2 is the lowest active manager above every
   key-1 holder, never a key-1 holder and never the human founder; the
   Orchestrator holds key 2 for founder classes A and B and for any PR that
   touches `agents/**`, `.github/**`, `.claude/**`, `AGENTS.md` or
   `CLAUDE.md`. It also records each derived holder's deputy from the chart
   (none for the legal team). This is logged (`kind` `derive` in
   `calls.jsonl`, beside the actual holders) and stated in one line of the
   key-2 comment. It does not change who holds key 2: that stays
   `key2_role` (the Orchestrator). Without a chart on `main` the line says
   the derivation is not available.
   **Deputy try** (decision D4.4 in
   [capability-hierarchy-decisions.md](capability-hierarchy-decisions.md)).
   When a key-1 lead's call times out, or its process fails with no output
   at all (after its one retry), the unit's deputy named in `main`'s chart
   gets one try with the deputy's own spec and the lead's checklists; the
   comment and the `review/team-lead` check name the deputy. There is no
   deputy try for a rate limit (the deputy runs on the same plan), for a
   failure that produced output (an error result, invalid output or failed
   validation, even when a repair run then times out: PR text can cause
   those), for a missing spec, for the legal team (Legal and Compliance has
   no deputy), or without a chart on `main`; key 2 has none today (above the
   Orchestrator is only the founder). If the deputy does not answer either,
   the key is deferred and the loop stops as before. Every deferred key
   also names its kind (`rate-limit`, `timeout`, `call-failed`,
   `invalid-output`, `validation`, `missing-spec`, `missing-standard`) in
   the loop's per-phase line.
5. **CI first.** For each required job (`os-test`, `website-build`,
   `repo-checks`) the newest run on the head counts (by start time, then run
   id), and a run still in progress, such as a rerun, always means waiting: an
   older success never counts while a newer run exists. While a job runs or is
   missing, both checks stay pending ("waiting for CI"). When a job finished
   without success, both checks are posted as `action_required` with the
   title "CI failed on <sha>; review not run" (terminal, and never green: a
   required check is satisfied only by success, neutral or skipped). No model
   is called in either case.
6. **Key 1, then key 2.** Key 1 is one fresh `claude -p` process per owning
   team (or, with `key1_mode` `composite`, one process for all of them; see
   "Composite key 1" above), with that team's lead spec, the base and team checklists, and the
   specs of any member checklists the map requires. Key 2 runs only when every
   key 1 passed: the orchestrator's spec plus every owning lead's spec and
   checklist, so it reviews with each team's domain knowledge, given key 1's
   results to check. Key 2 runs on the strongest model. On a founder-class
   PR, when key 2 passed, the Founder Proxy runs next, with its spec from
   `main` and both keys' results, also on the strongest model.
7. **Isolation.** Each process runs in the head worktree with only Read, Grep
   and Glob (the `main` worktree is readable for comparison), no command,
   write, network or MCP tools, no project customizations (`--safe-mode`), and
   an environment with no GitHub, App or API tokens. The script computes the
   diff and commit log itself. PR text, commit messages and the diff are
   passed as untrusted data between delimiters with a random marker; an
   instruction to the reviewer inside them is a critical finding.
8. **Validation.** The reviewer returns one JSON object: verdict (`pass` or
   `fail`; the Founder Proxy may also return `needs-founder`, with at least
   one reason), the head SHA, findings with file, line, side and severity,
   checks run and what was not run. The script checks the schema and that
   the SHA is the head. A `pass` with a blocker or critical finding is
   recorded as `fail`.
   **Citations.** Every finding's file and line must exist on its side: the
   head (default), the merge base (`"side": "base"`, a line the PR removes) or
   `main` (`"side": "main"`), each checked against that commit's tree; a claim
   cited as `file:line` (optionally `base:` or `main:` first) is checked the
   same way. When one does not exist:
   - a major, minor or info finding is dropped, with a note in the comment;
     it never blocks, so the verdict does not change;
   - a blocker or critical finding beside another blocker or critical finding
     with a valid citation is posted marked "citation unverified", with no
     extra run (the fail already stands on the valid one);
   - otherwise (a sole bad blocker or critical finding, any bad claim
     citation, and any finding from a strict key) the reviewer gets one
     repair run with the validator's exact error; if a citation is still bad,
     or the repair turns a fail into a pass, the key is deferred.
   Strict keys never drop a finding: Legal and Compliance key 1 and Brand and
   Content key 1 (public claims), a key 1 that loads the market-research
   checklist, and key 2 and the Founder Proxy on any PR with such a key 1
   (`strict_citations` in `config.json`). No path turns a bad citation into
   a pass.
   **Key 2's output cap.** Key 2 lists at most 10 findings
   (`key2_max_findings`), worst first, one line of evidence each; the script
   keeps the 10 worst and marks the verdict "more not listed" when there were
   more. The verdict itself never changes.
9. **Fail closed.** A failed call, a timeout or a rate limit (the plan's
   "session limit" message counts as one) gets one retry
   after a backoff; after that, and on any invalid output or a citation that
   fails as above, the key is posted as "review deferred" and stays pending.
   It never passes by default.
10. **Posting.** Before every post the script checks the head has not moved;
    if it has, it posts nothing more. It posts one comment per key (role, key,
    head and base SHA, verdict, findings, claims, checks run, what was not
    run, "agent review, not a sign-off") and the check runs
    `review/team-lead` (success only when every owning team passed) and
    `review/executive`. `review/executive` is success only when key 2 passed,
    no `hold` label is set, and for a founder-class PR the Founder Proxy
    passed (or it returned `needs-founder` and the founder's latest GitHub
    review is an approval of this head SHA). A comment or check run is
    not posted again when the App's latest one for that key, team and head
    already says the same (a rerun that reused its cached verdicts); the
    comment's marker carries a digest of the result for this.
11. **Records.** Every model call (key, team, role, tokens, duration,
    outcome) is logged outside the repository in
    `~/.nirmaan/pr-review/calls.jsonl`. Validated verdicts are cached per head
    commit, `main` commit, a digest of the PR title and body (the reviewers
    read both, so changed PR text is reviewed again), key, team and role (a
    new holder of a key reviews again), so re-running after the founder decides a `needs-founder` PR
    does not call the model again. Each run's worktrees, and
    the per-run folder that holds them under `~/.nirmaan/pr-review/worktrees`,
    are removed when it ends.

**Posting identity.** The review App posts the check runs with a short-lived
installation token scoped to this repository. It reads these environment
variables: `NIRMAAN_REVIEW_APP_ID`, one of
`NIRMAAN_REVIEW_APP_PRIVATE_KEY_FILE` (a PEM outside every repository) or
`NIRMAAN_REVIEW_APP_KEYCHAIN_SERVICE` (a macOS Keychain item holding the
PEM), and optionally `NIRMAAN_REVIEW_APP_INSTALLATION_ID`. Without
`NIRMAAN_REVIEW_APP_ID` and one of the two key variables, the script runs as
a dry run with the caller's `gh` login: it posts the comments and commit
statuses named `dry-run/review/team-lead` and `dry-run/review/executive`,
which are never green and are not the checks a ruleset requires.

## Automated loop

The loop (`.github/scripts/pr-loop/pr-loop.mjs`, the "driver") runs the whole
cycle without anyone starting the review by hand: wait for CI, run both keys,
fix what a key found, review again, and take the merge path when both keys
pass. It never replaces a key or the Founder Proxy, and never decides what the
proxy sends to the founder: a `needs-founder` verdict stops it.

**Which PRs.** Open PRs to `main` from a branch in this repository, authored by
the agents' account (`patel-om`) or Dependabot (`dependabot[bot]`): the list
`authors` in `.github/scripts/pr-loop/config.json`, kept explicit and
tested. A Dependabot PR gets the same review (CI first, both keys, the
Founder Proxy on a founder class), but the loop never pushes to its branch
(`no_fixer_authors`): a failing Dependabot PR gets `author-fix`, and an agent
recreates or closes it. Behind `main`, before its review or because `main`
moved during it, such a PR is not updated by update-branch either: the loop
comments Dependabot's own rebase command (`rebase_commands`) once per head,
never again on that head, and waits for the new head.
Drafts, PRs labelled `hold` and PRs labelled `needs-founder` are skipped.

**Each step, per PR:**

1. **Behind `main`.** GitHub reports a PR whose branch lacks commits on
   `main` as behind (`mergeable_state` `behind`) only while the ruleset
   requires branches to be up to date. The ruleset does not require it today
   (see "Merging"), so this step does not run now; it runs again if the
   setting is turned back on. On `behind`, the loop asks GitHub to merge `main`
   into the branch first, with the gh login: `PUT
   repos/<repo>/pulls/<n>/update-branch` with `expected_head_sha` set to the
   head it saw. This is the merge-commit update that `gh pr update-branch`
   makes, but GitHub refuses it if the head has moved. It does this before
   any review, also for a head that already finished (unless the review
   refused the PR), and again after both
   keys pass when `main` moved during the review. The new head is reviewed
   from scratch. While GitHub is still making
   the merge commit (up to 10 minutes), the loop waits instead of asking
   again. If the update fails (a merge conflict with `main`, or GitHub
   refuses it), the loop stops with `needs-founder`. If someone pushed in
   between, the step is dropped without a label and the new head is reviewed.
   `--no-post` never updates a branch.
2. **CI.** Until `os-test`, `website-build` and `repo-checks` are green on the
   head commit, the loop waits and calls no model (the newest run of each job
   counts, as in the review). CI failing on a head the loop pushed stops the
   loop; CI failing on the author's head only waits.
3. **Review.** The review script above runs unchanged: one fresh read-only
   process per owning team (key 1), then the orchestrator (key 2), then the
   Founder Proxy for a founder-class PR, specs from `main`, comments and
   checks posted. A proxy `needs-founder` stops the loop (below).
4. **Both keys (and the proxy) pass.** When the review App posts the checks, the loop reads the repository's
   "Allow auto-merge" setting with the gh login (the `allow_auto_merge` field
   of `gh api repos/<repo>`). When it is on, the loop runs `gh pr merge --auto
   --merge --match-head-commit <head>`, so GitHub merges only when every
   required check passes on that head. In a dry run, or when the setting is
   off, it posts "ready: both keys passed, waiting for the founder's merge
   settings", and the founder merges. The decision never depends on the
   wording of a gh error: when the setting cannot be read, or `gh pr merge
   --auto` fails for any reason, the loop stops with `needs-founder`.
5. **A key or the Founder Proxy fails.** The loop starts a **fixer**: a separate, fresh `claude -p`
   process, never a reviewer process and never the session that reviewed. It
   runs in a clean worktree of the head commit, with Read, Grep, Glob, Edit and
   Write allowed only inside that worktree, no shell, no network, no MCP and
   no token in its environment. Its task is the structured list of blocker and
   critical findings from the failed keys and proxy; the PR text and each finding's
   wording are passed as data, not instructions. It gets `AGENTS.md` and
   `CLAUDE.md` from `main` and is told to change only what the findings
   require.
6. **The loop, not the model, finishes the round.** It throws the fix away
   and stops if the fixer changed anything it may not change: `.github/**`
   (the review map, workflows, the review and loop scripts), anything under
   `agents/**` (every role spec with its review sections, the base checklist
   in `agents/README.md`, the Founder Proxy's spec),
   `.claude/**` (the `pr-review` skill and settings), `AGENTS.md`,
   `CLAUDE.md`, `.gitignore`, this page, the decision record, the loop's
   plist, or any `package.json` or `package-lock.json`. A fixer that says a
   finding needs such a change stops the loop the same way. Otherwise the
   loop regenerates `website/public` when `website/src` changed, commits with
   the `Co-Authored-By` line, runs the local checks for the changed paths
   (review map coverage, migration rule and secret scan always; the OS
   install, migrations, typecheck, lint and tests for `os/**`) in a
   token-free environment, checks the head has not moved, pushes to the PR
   branch with `--force-with-lease` on the reviewed head, and posts "fix
   round N" listing the findings addressed.
7. **Again from scratch.** The new head voids both keys, so the next step
   waits for CI on it and runs both reviews again.

**When it stops.** The loop labels the PR `needs-founder` and comments why when:
three fix rounds are done and a key still fails; the same finding (same key,
team, file and wording) fails again after a fix; CI fails after a fix; the
branch has a merge conflict; a key is deferred (bad output, a failed call,
missing spec), or so is the Founder Proxy; the Founder Proxy returns
`needs-founder` (until the founder's own review approves the head); the fixer
gives no valid answer, cannot
fix every finding or changes nothing; a local check fails; the auto-merge
setting cannot be read or `gh pr merge --auto` fails; the branch is behind
`main` and the update fails; or any error (after the retries below for
passing faults). Nothing is
pushed in any of these cases. The reason is redacted before it is logged or
posted: secret formats the secret scan knows, credentials in a URL and the
value after `Authorization:`, `Bearer` or `token` become `[redacted]`, since a
gh or git error can carry them. If someone pushes while the fixer
works, the round is dropped without a label and the new head is reviewed from
scratch. Removing the `needs-founder` label lets the loop resume with a fresh
round count.

**Rate limits pause, they do not stop.** When a key or the Founder Proxy is
deferred only because of a rate limit (the plan's session or usage limit,
after its one retry), or the fixer hits one, the loop does not label the PR
and does not stop: the key's check stays pending, nothing is pushed, and the
whole loop makes no model call for any PR for `rate_limit_pause_minutes` (30,
in `.github/scripts/pr-loop/config.json`). Then it reviews the same head
again. A fixer round cut short this way does not count its findings as seen.
No deputy takes the key: a deputy runs on the same plan and would hit the same
limit. Any other
deferral beside the rate limit still stops the loop.

**Who fixes what.** Before a fix round the loop tags each finding as
fixable by the loop or by the author, from the finding's path, never from the
model: the PR text and every path the fixer may not change (above) are the
author's. When any finding of a failed key is the author's, no fixer runs:
the loop adds the `author-fix` label and a comment with each finding and the
reviewer's proposed change, and waits. It adds no `needs-founder` label. A new
head is reviewed from scratch and the `author-fix` label comes off.

**Passing faults retry.** A failed model process, a GitHub or git error, or a
failed push is retried on later passes, up to `transient_retries` (3) times
for the same head, with no label. If it still fails, the loop stops with
`needs-founder` and the stop's class is `transient`.

**Stacked PRs wait.** A PR whose base branch is another open PR's branch waits
for that PR to merge (GitHub then retargets it to `main`); it is never
reviewed against the other PR's branch.

**Locks.** `lock_mode` in `.github/scripts/pr-loop/config.json` chooses how
reviews share the plan. The setting is `calls` with `model_cap` 2: this
repository has its own lock, and every model call takes one of 2 model slots
shared by both loops. The shared review lock (`review.lock`) is one slot, so
the ip-nirmaan loop, which still holds that lock for a whole review and fix
round, always counts; this loop tries its other slot first, so it leaves the
shared lock free for ip-nirmaan whenever it can. The review holds its slot
only for the review, the fixer only for its call, and the local checks and
pushes hold nothing. So the two repositories can review at once, and never
more than 2 model processes run. Every lock is taken with a try, never a
wait, so the two loops cannot deadlock; a loop that finds no slot free is
"busy" and tries again next pass. `step` (the earlier setting): one review
lock, shared with ip-nirmaan, held for a whole review and fix round.

**One review at a time per repository, every PR each pass.** Each pass takes one
step on every open PR, a PR the loop is fixing first, then by number, so a PR
waiting for CI, or one that just ran a review or a fix, never holds up the
others; the steps run one after another, so this loop runs one review at a time.
Before each step the loop reads main's tip again (`git ls-remote`); if any
merge has moved it since the pass began (the loop's own, the founder's, the
ip-nirmaan loop's), or main cannot be read, the pass ends there. A step that
arms auto-merge also ends the pass. The next pass refetches main and reruns
the check that the loop's copy matches main before it steps any PR. The check
runs between steps, not during one: a merge while a review runs is caught by
the next step's check, and the merge path updates a branch that has fallen
behind main instead of merging it.

**Records.** Every review call, fixer call and loop step (updated, review,
reviewed, fixed, ready, auto-merge, stopped) is a line in
`~/.nirmaan/pr-review/calls.jsonl`; a stop line also names its class (such as
`merge-conflict`, `validation`, `rate-limit`, `loop-may-not-fix`,
`local-check`; the list is `STOP_CLASSES` in `pr-loop.mjs`). Each review step
also writes one per-phase line (`kind` `phase`): when required CI went green
on the head (the latest completion among the required jobs), how long the PR
waited for the review lock, each key's start and end (key 1 per team, or once
for the composite), its
verdict, findings by severity and validation error if any, the step's outcome,
and for a stop its reason and class. When a PR the loop armed for merge leaves
the open list, the next pass writes one `merged` (or `closed`) line with
GitHub's merge time. Nothing is written under the repository. Per-PR loop
state (rounds, findings seen, the last head it pushed, lock wait) is in
`~/.nirmaan/pr-review/loop/`. The needs-founder digest, the health alerts
and the turnaround report read these records:
[pr-loop-runbook.md](pr-loop-runbook.md).

**Author-side usage.** Author pipelines that run `claude -p` steps (a
writer, a checker, an eval) can run each step through
`.github/scripts/author/run.mjs`, so the plan's use by authors is logged beside
the review loop's:

```sh
node .github/scripts/author/run.mjs --role content-strategist --step writer \
  [--pr <n>] [--repo <owner/name>] -- -p --model sonnet < prompt.txt
```

Everything after `--` goes to `claude` unchanged (with `--output-format json`
added when not given; another output format is refused, since the usage is
read from the JSON result). Input, output and exit code pass through. Each run
appends one line (`kind` `author`: role, step, model, outcome, exit code,
duration, input, output and cache tokens; never the prompt or the answer) to
`calls.jsonl` in the state directory (`NIRMAAN_REVIEW_STATE_DIR`, default
`~/.nirmaan/pr-review`), outside the repository. Bad arguments exit 2 and run
nothing.

**Running it.** It runs on the founder's Mac with the Mac's own `claude` login
(the plan) and `gh` login, so it adds no spend and no secret in GitHub
Actions. Like the review script, it refuses to post unless it is `main`'s
copy. Three ways to run it:

- **Once, by hand**, from a checkout of `origin/main`:
  `node .github/scripts/pr-loop/pr-loop.mjs --once` (add `--pr <n>` for one
  PR, `--no-post` to print instead of posting, labelling or pushing; a fix is
  then committed only in a temporary worktree).
- **Continuously in a terminal:** `node .github/scripts/pr-loop/pr-loop.mjs
  --watch --interval-minutes 5`. It exits when `main`'s copy of the loop
  changes; start it again from the updated checkout.
- **launchd (survives restarts).** Make a dedicated clone and the settings
  file, then install the plist [`pr-loop.plist`](pr-loop.plist):

  ```sh
  mkdir -p ~/.nirmaan/pr-loop
  git clone https://github.com/nirmaansoftware/Nirmaan.git ~/.nirmaan/pr-loop/Nirmaan
  # once: write ~/.nirmaan/pr-loop/env (below)
  cp ~/.nirmaan/pr-loop/Nirmaan/docs/operations/pr-loop.plist ~/Library/LaunchAgents/online.nirmaan.pr-loop.plist
  launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/online.nirmaan.pr-loop.plist
  ```

  The plist holds no settings. Its command first sources
  `~/.nirmaan/pr-loop/env`, a shell file shared with the ip-nirmaan loop, so
  copying a newer plist keeps them. The file holds paths and IDs only, never
  a key's contents:

  ```sh
  export PATH="$HOME/.nirmaan/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  export NIRMAAN_CLAUDE_CODE="$HOME/.nirmaan/bin/claude"
  export NIRMAAN_REVIEW_APP_ID=<the App ID>
  export NIRMAAN_REVIEW_APP_INSTALLATION_ID=<the installation ID>
  export NIRMAAN_REVIEW_APP_PRIVATE_KEY_FILE=<path to the PEM, outside every repository>
  ```

  `PATH` must reach `node`, `git`, `gh` and `claude`. Without the file, a
  run stops before the loop starts and the log says so. To re-install after
  the plist changes on `main`: `launchctl bootout
  gui/$(id -u)/online.nirmaan.pr-loop`, then the `cp` and `launchctl
  bootstrap` lines above. Every minute it resets the clone to
  `origin/main` and runs `--once`; output, including the `git` steps', goes
  to `~/.nirmaan/pr-review/loop.log`. To stop it:
  `launchctl bootout gui/$(id -u)/online.nirmaan.pr-loop`.
- **Claude Code `/loop`:** in a session opened in the dedicated clone, run
  `/loop 10m git fetch origin main && git reset --hard origin/main && node
  .github/scripts/pr-loop/pr-loop.mjs --once, then report its last line`. The
  session only starts the script; it never reviews or fixes a PR itself. It
  spends a little of the plan on the session's own turns, which launchd does
  not.

**Settings** (environment): `NIRMAAN_REVIEW_MODEL_PROXY` (the Founder Proxy's
model, default `opus`), `NIRMAAN_LOOP_MODEL_FIXER` (default `sonnet`),
`NIRMAAN_LOOP_FIXER_TIMEOUT_SECONDS` (1800),
`NIRMAAN_LOOP_CHECK_TIMEOUT_SECONDS` (1200), `NIRMAAN_LOOP_GIT_NAME` and
`NIRMAAN_LOOP_GIT_EMAIL` (the commit identity; otherwise the clone's git
config, otherwise the PR head commit's author), plus the review script's
variables above. Under launchd, set them in `~/.nirmaan/pr-loop/env`. The
local checks, forbidden paths, round limit and authors are in
`.github/scripts/pr-loop/config.json`.

**What the loop does not do.** It never merges a PR whose Founder Proxy verdict
is `needs-founder` without the founder's own GitHub review approving its head,
never changes review configuration or workflows, never pushes over someone else's
push, never runs on a fork or another author's PR, never turns auto-merge on
for the repository, and never treats a deferred review as a pass. A fix the
loop pushed is an agent's change like any other: both keys review it again.

## Small, urgent and revert PRs

- **Size never changes the number of keys.** A typo fix still gets both keys;
  only the checklist is shorter.
- **Urgent security fix:** the founder merges it by hand. Both keys review it
  within 24 hours afterwards, and the review is recorded.
- **Exact revert:** checked for exactness only, that it undoes the named
  commit and nothing else.
- **No fast path** for migrations, auth code, the send gate or the control
  plane.

## Merging

The ruleset on `main` does not require branches to be up to date with `main`
before merge: its `strict_required_status_checks_policy` is `false` (read it
with `gh api repos/nirmaansoftware/Nirmaan/rules/branches/main`), although
[pr-review-decisions.md](pr-review-decisions.md) still records it as
required. So CI and both keys run on the
branch head, not on the result of merging it with the latest `main`: a PR
whose branch is behind can merge without being tested against the newer
`main`, and Vercel publishes `main` directly. Requiring up-to-date branches
again is a ruleset setting and the founder's decision (F3 in
[2026-10-18-review-loop-decisions.md](2026-10-18-review-loop-decisions.md),
R5.8, which records the gap and the recommendation); while it is on, the loop
updates a branch that is behind (step 1 of the loop). PRs merge with a merge
commit, one at a time.

## Rollback

After every push to `main`, the `site-smoke` workflow
(`.github/workflows/site-smoke.yml`) waits up to 5 minutes for Vercel to
publish, then checks that key www.nirmaan.online pages answer 200 and a
missing page answers 404. If it fails, or a merged change is wrong for any
other reason, roll back first and fix second, through the normal keys.

1. **Revert the merge commit as a PR.** Anyone on Platform and Quality (sre
   or devops-engineer) opens it:

   ```sh
   git switch main && git pull
   git switch -c revert/<short-name>
   git revert -m 1 <merge-commit-sha>
   git push -u origin revert/<short-name>
   ```

   This is the exact-revert fast path: key 1 (any Platform and Quality
   member) and key 2 (orchestrator) check only that it undoes the named merge
   commit and nothing else. Nothing else may be added to the PR; the fix goes
   in a later, normally reviewed PR. When it merges, Vercel publishes the
   reverted `main` and `site-smoke` runs again.
2. **Vercel Instant Rollback, if the site must come back before the revert
   merges.** The founder only, from the Vercel dashboard of the **nirmaan8**
   team: the project's Deployments, the last good production deployment,
   Instant Rollback. Never use the Vercel CLI for this: its default login on
   the founder's machine belongs to a client, not to nirmaan8. Merge the
   revert PR afterwards anyway, so `main` matches what is live; until then,
   Vercel keeps serving the rolled-back deployment and does not publish new
   pushes to `main` on its own, so promote the reverted `main` deployment from
   the same dashboard once it is built. `site-smoke` fails on that push until
   the promotion; run it again afterwards (Actions, Site smoke, Run workflow).

Neither path applies to the OS (os.nirmaan.online), which is paused and
deployed separately; see
[docs/engineering/deployment.md](../engineering/deployment.md).

## Status

IMPLEMENTED, live since 2026-10-18. The rollout order and owners are in
[pr-review-decisions.md](pr-review-decisions.md#6-rollout).

- The ruleset "main: two keys" on `main` is active. It requires the CI jobs
  `os-test`, `website-build` and `repo-checks`, and the checks
  `review/team-lead` and `review/executive` from the review App only;
  branches need not be up to date; code owner review is required, and a push
  dismisses an earlier approval. Since `.github/CODEOWNERS` was removed
  (Founder Proxy, 2026-10-18), the code owner setting has no effect; the
  founder can turn it off.
- "Allow auto-merge" is on for the repository.
- First automatic merge: #95. Both keys passed, the loop turned on
  auto-merge, and GitHub merged it with no human action.
- First founder-class merges, after the founder's approval on GitHub: #93
  and #96.
