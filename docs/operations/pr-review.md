# PR review · PLANNED

How a pull request to this repository is reviewed and merged once the review
mechanism is live. The decisions behind it, with reasons and dissent, are in
[pr-review-decisions.md](pr-review-decisions.md). IP Nirmaan follows the same
mechanism with its own teams and hardware adaptations.

**Until the GitHub App and the ruleset are live, the review checks are a
convention and the founder merges every PR.** Automatic merge stays off until
seeded test PRs show the mechanism behaves as written. This page moves to
IMPLEMENTED after the first real PR merges through both keys.

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

Path ownership lives in one file: `.github/review-teams.yml`. **That file does
not exist yet; it is added in a later rollout step.** This page does not copy
its rules. Once it exists:

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

- A fresh, read-only process per key, in a clean checkout of the head commit;
  never the session that wrote the PR. An agent never reviews its own
  session's PR.
- Rules and role specs are loaded from `main`, not from the PR.
- No network and no tokens for the model.
- Reviewers run locally through a `pr-review` skill and a posting script. No
  GitHub Action runs PR content with a model token, and
  `pull_request_target` is never used.
- The verdict is JSON. A script checks that every cited file and line exists
  and that the head has not moved before the App posts it.
- Same-repository branches only; one review at a time.
- **Fail closed:** if a review cannot finish, the check stays pending. It never
  passes by default.

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
