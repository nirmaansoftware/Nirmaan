---
name: pr-review
description: Run the two-key agent review of a pull request (key 1 per owning team lead, key 2 by the orchestrator) through the posting script, which starts fresh read-only reviewer processes and posts the verdicts. Use when asked to review PR <n>, to run the review keys, or to re-run them after a push. Never for a PR this session wrote.
---

# PR review

The mechanism is `docs/operations/pr-review.md` (decisions:
`docs/operations/pr-review-decisions.md`). This skill only starts the
script; **you do not review the PR yourself**. The reviewers are separate
`claude -p` processes the script starts, with rules and specs from `main`.

## 1. Refuse your own PR

Do not run this for a PR whose branch, commits or text this session wrote or
edited, or a PR whose branch is checked out in this session. Say so and stop:
the founder or another session runs it. (The script also refuses when a
Claude Code session has the PR's branch checked out, but that check is a
guard, not a guarantee; the rule is yours to keep.)

## 2. Run the script from main

The script refuses to post unless it is `main`'s copy, so a PR cannot review
itself under a script it rewrote. From any clone of this repository:

```sh
git fetch origin main
git worktree add --detach "${TMPDIR:-/tmp}/pr-review-main" origin/main
node "${TMPDIR:-/tmp}/pr-review-main/.github/scripts/pr-review/review.mjs" <n>
git worktree remove "${TMPDIR:-/tmp}/pr-review-main"
```

Options: `--no-post` prints the comments and checks instead of posting
(allowed from any copy, for trying a change to the script); `--fresh` ignores
verdicts cached for the same head and main commits and the same PR title and body.

It takes a while: one model call per owning team for key 1, then one for
key 2, then, for a founder-class PR whose key 2 passed, one for the Founder
Proxy (agent), one at a time. Run it in the background and wait for it to exit.

## 3. Report what it printed, nothing more

Exit codes: 0 reviewed and posted (any verdict); 2 setup error; 3 another
review holds the lock (both repositories share one lock; try later, never in
parallel); 4 refused (fork, other author, wrong base, own branch); 5 the head
moved during the review (nothing posted; run again on the new head).

Tell the user the verdict per key, the head SHA, and the comment links. Use
the script's words: "agent review", "pass", "fail", "review deferred",
"needs the founder". The Founder Proxy is "Founder Proxy (agent), acting
under the founder's delegation of 2026-10-18; not the founder": never say
the founder approved anything because the proxy passed. Never say approved,
signed off or compliant; a pass is an agent review, not a sign-off. A deferred review is not a pass.
If no review App is configured, say it was a dry run: the statuses are named
`dry-run/...` and never count.

## 4. After a failure

The author fixes and pushes; the new head voids both keys; run the skill again
(from a session that did not write the fix). The automated loop
(`.github/scripts/pr-loop/`, "Automated loop" in `docs/operations/pr-review.md`)
does this on its own: a separate fixer process, checks, push, and both keys
again, at most three rounds before it labels the PR `needs-founder`. Founder-class PRs (A to F) also
get the Founder Proxy (agent) after key 2; `review/executive` passes only when
key 2 and the proxy pass. A proxy fail goes to the fixer like a key's; a proxy
"needs-founder" keeps `review/executive` pending until the founder's own
GitHub review approves the head, and the loop labels the PR `needs-founder`.
A `hold` label keeps it pending.

## Where things are

- Script: `.github/scripts/pr-review/` (`review.mjs`, tests in
  `review.test.mjs`, fake `claude` in `fixtures/`).
- Checklists, read from `main`: the base key-1 checklist in `agents/README.md`
  ("Every key 1 (base checklist)"), each lead's "Key 1 review" section, the
  orchestrator's "Key 2 review" section, and the "Checklist for my team lead"
  section of each member the map's `checklists:` names. Where a spec does not
  carry its section yet, the fallback is `checklists/<name>.md` beside this
  file; with neither, the key is deferred. Design key 1 is deferred (no model
  call) until `docs/design/visual-direction.md` exists on `main`.
- Env: `NIRMAAN_CLAUDE_CODE` (claude path), `NIRMAAN_REVIEW_MODEL_KEY1`
  (default `sonnet`), `NIRMAAN_REVIEW_MODEL_KEY2` (default `opus`, the
  strongest), `NIRMAAN_REVIEW_MODEL_PROXY` (default `opus`), `NIRMAAN_REVIEW_TIMEOUT_SECONDS` (1200),
  `NIRMAAN_REVIEW_BACKOFF_SECONDS` (90), `NIRMAAN_REVIEW_STATE_DIR`
  (`~/.nirmaan/pr-review`: lock, call log `calls.jsonl`, cached verdicts,
  temporary worktrees). The review App's variables are listed in
  `docs/operations/pr-review.md`.
