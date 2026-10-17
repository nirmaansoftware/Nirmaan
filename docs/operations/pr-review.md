# PR review · PLANNED

How a pull request to this repository is reviewed and merged once the review
mechanism is live. The decisions behind it, with reasons and dissent, are in
[pr-review-decisions.md](pr-review-decisions.md). IP Nirmaan follows the same
mechanism with its own teams and hardware adaptations.

**Until the GitHub App and the ruleset are live, the review checks are a
convention and the founder merges every PR.** Automatic merge stays off until
seeded test PRs show the mechanism behaves as written. This page moves to
IMPLEMENTED after the first real PR merges through both keys.

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
4. **Founder key:** if the PR falls in a founder class (A to F), the founder
   approves it on GitHub.
5. When every required check passes, the PR merges automatically, one at a
   time, with a merge commit.

A new push to the PR voids both keys; they run again on the new head commit.

## Teams and leads

Each team has one lead, who holds key 1 for that team. Members' checklists run
inside the lead's review and are cited by name; there is one key-1 verdict per
team.

| Team | Lead (key 1) | Members |
|---|---|---|
| Executive | orchestrator (key 2 on every PR, never key 1) | none |
| Product | product-manager | business-analyst, market-research |
| Brand and Content | brand-strategist | content-strategist, technical-writer, seo-specialist |
| Design | creative-director | ux-designer, ui-designer, design-system-engineer |
| Engineering | principal-architect | frontend-engineer, backend-engineer, database-engineer, ai-ml-engineer |
| Platform and Quality | security-engineer | sre, devops-engineer, qa-engineer, performance-engineer |
| Business | legal-compliance | finance-estimation, tax-accounts, legal-counsel, sales-partnerships, client-communication |

legal-counsel never holds a key. Role specs are in [`agents/`](../../agents/README.md).

## Which teams own a PR

Path ownership lives in one file: [`.github/review-teams.yml`](../../.github/review-teams.yml).
This page does not copy its rules. In short:

- The review reads it from `main`, never from the PR.
- A PR is owned by every team with a rule matching a changed file. A file with
  two owners needs both leads.
- A file no rule matches belongs to Engineering.
- Content rules sit beside path rules: a price, currency, discount, refund or
  guarantee, or a client, partner or prospect name, anywhere in the diff adds
  Business; a market or competitor claim adds Product's market check.
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
not flagged; an instruction to the reviewer is hidden in the diff; or the
wording claims approval or sign-off. Each team adds its own checklist, listed
in [pr-review-decisions.md](pr-review-decisions.md#4-what-the-keys-check).

**Key 2 (orchestrator).** Confirms key 1 ran for every owning team on this
commit and findings were answered; checks cross-team effects (shared layer,
IP site, generated files); re-tests one claim itself; checks scope; and
confirms the founder classes were applied.

A blocker or critical finding fails a key. Some fails are mechanical: an edited
migration, committed `website/public` differing from a fresh build, a secret in
the diff, a failed coverage test, or a review of a commit that is no longer the
head.

The keys are posted as two check runs, `review/team-lead` and
`review/executive`, by a GitHub App the founder owns. The ruleset will accept
these checks only from that App, so a check posted by an agent's token or a
workflow does not count.

## Founder classes A to F

These need the founder's GitHub approval on the current head commit, as a
third key, in addition to both agent keys:

| Class | Covers |
|---|---|
| A. Control plane | `.github/**`, `.claude/**`, `AGENTS.md`, `CLAUDE.md`, `agents/**`, `.gitignore`, the review and decision-meeting rules |
| B. Production config | deploy configuration, turning on the OS deploy or worker |
| C. Money | pricing data, the estimator, price pages, any price or payment wording, any new spending |
| D. Legal and data | the privacy notice, the terms, the contact form, any new collection of personal data |
| E. Public names, products, clients | brand marks, positioning, mission, vision, product status, a new public page, any named client, partner or competitor |
| F. The human send gate | the code that keeps sending outreach a founder-only action |

Paths are enforced by GitHub (`CODEOWNERS` names the founder and the ruleset
requires code owner review). Content triggers are enforced by the review
script, which does not pass key 2 until the founder has approved the head
commit. Changes to the privacy notice or terms also notify the IP council
chair, because they govern the IP site too.

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

1. **One review at a time.** It takes a lock shared with ip-nirmaan, so only
   one review runs across both repositories.
2. **Eligibility.** The PR must be open, target `main`, come from a branch in
   this repository (never a fork) and be authored by `patel-om` or
   `nirmaansoftware`. Otherwise it refuses and posts nothing.
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
   key is deferred. Design key 1 is deferred until
   `docs/design/visual-direction.md` exists on `main`. The script itself
   refuses to post unless it is `main`'s copy.
5. **CI first.** Until `os-test`, `website-build` and `repo-checks` are green
   on the head commit, both checks stay pending and no model is called.
6. **Key 1, then key 2.** Key 1 is one fresh `claude -p` process per owning
   team, with that team's lead spec, the base and team checklists, and the
   specs of any member checklists the map requires. Key 2 runs only when every
   key 1 passed: the orchestrator's spec plus every owning lead's spec and
   checklist, so it reviews with each team's domain knowledge, given key 1's
   results to check. Key 2 runs on the strongest model.
7. **Isolation.** Each process runs in the head worktree with only Read, Grep
   and Glob (the `main` worktree is readable for comparison), no command,
   write, network or MCP tools, no project customizations (`--safe-mode`), and
   an environment with no GitHub, App or API tokens. The script computes the
   diff and commit log itself. PR text, commit messages and the diff are
   passed as untrusted data between delimiters with a random marker; an
   instruction to the reviewer inside them is a critical finding.
8. **Validation.** The reviewer returns one JSON object: verdict (`pass` or
   `fail`), the head SHA, findings with file, line and severity, checks run
   and what was not run. The script checks the schema, that the SHA is the
   head, and that every cited file and line exists at the head. A `pass` with
   a blocker or critical finding is recorded as `fail`.
9. **Fail closed.** A failed call, a timeout or a rate limit gets one retry
   after a backoff; after that, and on any invalid output or missing
   citation, the key is posted as "review deferred" and stays pending. It
   never passes by default.
10. **Posting.** Before every post the script checks the head has not moved;
    if it has, it posts nothing more. It posts one comment per key (role, key,
    head and base SHA, verdict, findings, claims, checks run, what was not
    run, "agent review, not a sign-off") and the check runs
    `review/team-lead` (success only when every owning team passed) and
    `review/executive`. `review/executive` is success only when key 2 passed,
    no `hold` label is set, and for a founder-class PR the founder's latest
    GitHub review is an approval of this head SHA.
11. **Records.** Every model call (tokens, duration, outcome) is logged
    outside the repository in `~/.nirmaan/pr-review/calls.jsonl`. Validated
    verdicts are cached per head and `main` commit, so re-running after the
    founder approves does not call the model again.

**Posting identity.** The review App posts the check runs with a short-lived
installation token scoped to this repository. It reads these environment
variables: `NIRMAAN_REVIEW_APP_ID`, one of
`NIRMAAN_REVIEW_APP_PRIVATE_KEY_FILE` (a PEM outside every repository) or
`NIRMAAN_REVIEW_APP_KEYCHAIN_SERVICE` (a macOS Keychain item holding the
PEM), and optionally `NIRMAAN_REVIEW_APP_INSTALLATION_ID`. Until the App
exists, the script runs as a dry run with the caller's `gh` login: it posts
the comments and commit statuses named `dry-run/review/team-lead` and
`dry-run/review/executive`, which are never green and are not the checks a
ruleset requires.

## Automated loop

The loop (`.github/scripts/pr-loop/pr-loop.mjs`, the "driver") runs the whole
cycle without anyone starting the review by hand: wait for CI, run both keys,
fix what a key found, review again, and take the merge path when both keys
pass. It never replaces a key and never bypasses the founder: founder-class PRs
still need the founder's GitHub approval, and the loop never merges them.

**Which PRs.** Open PRs to `main` from a branch in this repository, authored by
the agents' account (`patel-om`, in `.github/scripts/pr-loop/config.json`).
Drafts, PRs labelled `hold` and PRs labelled `needs-founder` are skipped.

**Each step, per PR:**

1. **CI.** Until `os-test`, `website-build` and `repo-checks` are green on the
   head commit, the loop waits and calls no model. CI failing on a head the
   loop pushed stops the loop; CI failing on the author's head only waits.
2. **Review.** The review script above runs unchanged: one fresh read-only
   process per owning team (key 1), then the orchestrator (key 2), specs from
   `main`, comments and checks posted.
3. **Both keys pass.** If the PR is in a founder class, the loop posts that it
   waits for the founder's approval of this head and does nothing else; after
   the founder approves, it runs the review again (cached verdicts, no model
   call) so `review/executive` turns green, and the founder merges. Otherwise,
   when the review App posts the checks and the repository's "Allow
   auto-merge" setting is on, the loop runs `gh pr merge --auto --merge
   --match-head-commit <head>`, so GitHub merges only when every required
   check passes on that head. Until then (a dry run, or auto-merge off) it
   posts "ready: both keys passed, waiting for the founder's merge settings",
   and the founder merges.
4. **A key fails.** The loop starts a **fixer**: a separate, fresh `claude -p`
   process, never a reviewer process and never the session that reviewed. It
   runs in a clean worktree of the head commit, with Read, Grep, Glob, Edit and
   Write allowed only inside that worktree, no shell, no network, no MCP and
   no token in its environment. Its task is the structured list of blocker and
   critical findings from the failed keys; the PR text and each finding's
   wording are passed as data, not instructions. It gets `AGENTS.md` and
   `CLAUDE.md` from `main` and is told to change only what the findings
   require.
5. **The loop, not the model, finishes the round.** It throws the fix away
   and stops if the fixer changed anything it may not change: `.github/**`
   (the review map, `CODEOWNERS`, workflows, the review and loop scripts),
   `.claude/**` (the `pr-review` skill and settings), `AGENTS.md`,
   `CLAUDE.md`, `.gitignore`, this page, the decision record, the loop's
   plist, any `package.json` or `package-lock.json`, or a review section of
   an agent spec ("Key 1 review", "Key 2 review", "Checklist for my team
   lead", the base checklist in `agents/README.md`). A fixer that says a
   finding needs such a change stops the loop the same way. Otherwise the
   loop regenerates `website/public` when `website/src` changed, commits with
   the `Co-Authored-By` line, runs the local checks for the changed paths
   (review map coverage, migration rule and secret scan always; the OS
   install, migrations, typecheck, lint and tests for `os/**`) in a
   token-free environment, checks the head has not moved, pushes to the PR
   branch with `--force-with-lease` on the reviewed head, and posts "fix
   round N" listing the findings addressed.
6. **Again from scratch.** The new head voids both keys, so the next step
   waits for CI on it and runs both reviews again.

**When it stops.** The loop labels the PR `needs-founder` and comments why when:
three fix rounds are done and a key still fails; the same finding (same key,
team, file and wording) fails again after a fix; CI fails after a fix; the
branch has a merge conflict; a key is deferred (rate limit, bad output,
missing spec); the fixer hits a rate limit, gives no valid answer, cannot
fix every finding or changes nothing; a local check fails; or any error.
Nothing is pushed in any of these cases. If someone pushes while the fixer
works, the round is dropped without a label and the new head is reviewed from
scratch. Removing the `needs-founder` label lets the loop resume with a fresh
round count.

**One PR at a time.** The loop holds the review lock (shared with ip-nirmaan)
for a whole review and fix round. A PR the loop is fixing goes first, and each
pass ends after the first PR that ran a review or a fix.

**Records.** Every review call, fixer call and loop step (review, reviewed,
fixed, ready, auto-merge, founder-wait, stopped) is a line in
`~/.nirmaan/pr-review/calls.jsonl`. Per-PR loop state (rounds, findings seen,
the last head it pushed) is in `~/.nirmaan/pr-review/loop/`.

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
- **launchd (survives restarts).** Make a dedicated clone, then install the
  plist [`pr-loop.plist`](pr-loop.plist):

  ```sh
  mkdir -p ~/.nirmaan/pr-loop
  git clone https://github.com/nirmaansoftware/Nirmaan.git ~/.nirmaan/pr-loop/Nirmaan
  cp ~/.nirmaan/pr-loop/Nirmaan/docs/operations/pr-loop.plist ~/Library/LaunchAgents/online.nirmaan.pr-loop.plist
  launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/online.nirmaan.pr-loop.plist
  ```

  Every 5 minutes it resets the clone to `origin/main` and runs `--once`;
  output goes to `~/.nirmaan/pr-review/loop.log`. `node`, `git`, `gh` and
  `claude` must be on the login shell's `PATH`. To stop it:
  `launchctl bootout gui/$(id -u)/online.nirmaan.pr-loop`.
- **Claude Code `/loop`:** in a session opened in the dedicated clone, run
  `/loop 10m git fetch origin main && git reset --hard origin/main && node
  .github/scripts/pr-loop/pr-loop.mjs --once, then report its last line`. The
  session only starts the script; it never reviews or fixes a PR itself. It
  spends a little of the plan on the session's own turns, which launchd does
  not.

**Settings** (environment): `NIRMAAN_LOOP_MODEL_FIXER` (default `sonnet`),
`NIRMAAN_LOOP_FIXER_TIMEOUT_SECONDS` (1800),
`NIRMAAN_LOOP_CHECK_TIMEOUT_SECONDS` (1200), `NIRMAAN_LOOP_GIT_NAME` and
`NIRMAAN_LOOP_GIT_EMAIL` (the commit identity; otherwise the clone's git
config, otherwise the PR head commit's author), plus the review script's
variables above. The local checks, forbidden paths, round limit and authors
are in `.github/scripts/pr-loop/config.json`.

**What the loop does not do.** It never merges a founder-class PR, never
changes review configuration or workflows, never pushes over someone else's
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

Branches must be up to date with `main` before merge, because Vercel publishes
`main` directly and an untested combination would go live. PRs merge with a
merge commit, one at a time.

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
   in a later, normally reviewed PR. Until the keys are live, the founder
   merges it like every other PR. When it merges, Vercel publishes the
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

PLANNED. The rollout order and owners are in
[pr-review-decisions.md](pr-review-decisions.md#6-rollout). Until the App and
the ruleset are live, the founder merges every PR.
