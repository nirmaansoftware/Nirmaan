# Decision meetings · IMPLEMENTED (first run 2026-10-16)

How Nirmaan makes a decision that is hard to reverse, public, priced, legal, or
crosses several roles: the agent roles in [`agents/`](../../agents/README.md)
meet, and a chair decides. First used to launch
[Nirmaan Outreach](../product/nirmaan-outreach-decisions.md). To run one in a
Claude Code session, ask for a meeting; the `decision-meeting` skill
(`.claude/skills/decision-meeting/`) follows this page.

## When to call one

Call a meeting for pricing, launching or naming a product, anything that goes on
a public page, a legal or data question, or an architecture choice that is
expensive to undo. Don't call one for routine code or copy fixes: one role can
own those.

## How it runs

1. **Brief.** One file states the facts (with numbers and file paths), the rules
   that apply (`company/positioning.md`, `company/principles.md`), the agenda
   (numbered questions) and the answer format. Every seat reads the same brief.
2. **Round 1: independent positions.** Every seat answers at once, from its own
   role spec, without seeing anyone else's answer, so nobody anchors on the
   first opinion. Read only: no seat changes the repo. Format:
   `ROLE / POSITION / MUST-HAVE / CONFIDENCE`, about 250 words. "No view" is a
   good answer outside a seat's area. Facts, inferences and assumptions are
   labelled as such, and sources are cited.
3. **Round 2: the chair decides.** The Orchestrator reads every position and
   decides each agenda item. Where seats disagree, it says who wanted what,
   what it chose and why. It records dissent, and it sets gates with an owner
   role for each.
4. **Follow-up questions go to the owner.** If a decision depends on a number,
   the chair or the implementer asks the seat that owns it (for example Finance
   confirming an allowance) instead of guessing.
5. **Implement, then verify by the owner.** Whoever implements applies the
   decisions; the owning seat checks the result before it ships (for example
   QA checking every page claim against the code).

## Records

| Record | Where | Contains |
|---|---|---|
| Public decision record | `docs/<area>/<topic>-decisions.md` in this repo | Decisions, page changes, gates with owners, open questions, dissent |
| Internal minutes and every position | `~/Nirmaan-internal/<date>-<topic>/`, outside the repo | Margins, costs, effort estimates, anything the public repo must not hold |

This repository is public. The public record never contains margins, internal
costs, per-unit AI arithmetic, or effort estimates.

## What stays with the founder

The meeting decides; the founder can overrule, and the record says so (the
founder renamed the first product the meeting had named). These always wait for
the founder: signing a contract, spending money (including paying for legal
counsel), and changing a public name.

Merging follows [pr-review.md](pr-review.md): every PR needs two keys, the lead
of each owning team (key 1) and the orchestrator (key 2), and a PR in a founder
class (A to F) also needs the founder's approval on GitHub. That mechanism is
IMPLEMENTED: the ruleset on `main` requires both keys' checks.

## Lessons from the first meeting

- The seats caught claims the implementer had written that the code doesn't
  support. Have the claim-checking seats (Technical Writer, Legal / Compliance,
  QA) read the actual code, not the docs.
- Parallel runs are capped at 20 at a time; queue the rest and seat them as
  places free up.
- Measure what can only be measured live (for example page speed) after the
  merge, and record the result.
