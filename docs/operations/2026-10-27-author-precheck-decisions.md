# Author pre-check decisions, 2026-10-27

The founder asked on 2026-10-27 that author sessions check their own diffs
before the review loop sees them, so that plain bugs do not cost the keys
review calls. This is a routine process change that one role can own
([decision-meetings.md](decision-meetings.md), "When to call one"), so no
meeting was called. Capability owns how the organisation reviews
(`.github/review-teams.yml`, rule `governance-docs`); the Head of Capability
(agent role) decided the points below. It is an agent decision, not the
founder's approval and not a sign-off.

## Decisions

1. **The pre-check.** Before opening a PR, or pushing a fix to one, an author
   session runs Claude's code review on its own diff and fixes the findings
   first. The tool is the `code-review` skill that ships with Claude Code (not
   a skill in this repository), at effort `low`. The author fixes the code; the
   review's output is not pasted into the PR text.
2. **Who runs it.** Author sessions only. The loop's fixer is exempt: it has
   only file tools and cannot run a skill, and its pushes are reviewed again
   by both keys like any other change.
3. **It is not a gate.** Nothing enforces it and no reviewer checks whether it
   ran. It adds no key, removes no key and changes no check: both keys, the
   Founder Proxy and the loop work as before. A claim in PR text that it ran is
   not evidence and reviewers give it no weight.
4. **Where it is written.** `AGENTS.md` (the PR rule) and
   [pr-review.md](pr-review.md) ("In short").

## Reasons and dissent

Reasons: the loop spends up to three or four review calls on a PR that fails
on a plain bug; a cheap check by the author first saves those calls and
shortens the wait. Dissent: none recorded. Reversal: drop the two sentences
and add a dated "Superseded by" note here.
