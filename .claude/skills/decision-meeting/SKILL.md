---
name: decision-meeting
description: Run a Nirmaan decision meeting. The agent roles in agents/ give independent positions in parallel, then the Orchestrator chairs and decides, with dissent and gates recorded. Use when the user asks for a meeting, or for a decision that is hard to reverse, public, priced, legal, or crosses several roles. The process is docs/operations/decision-meetings.md.
---

# Decision meeting

Follow `docs/operations/decision-meetings.md`. Steps:

## 1. Brief
Write `brief.md` in a fresh folder in your scratchpad (not the repo). Include:
- the decision to make, and that the founder delegated it (or not);
- facts with numbers and file paths, read from the repo first, not recalled;
- the rules that apply: `docs/company/positioning.md`, `docs/company/principles.md`;
  the repository is public, so internal economics never go into it;
- the agenda as numbered questions;
- the output format: `ROLE / POSITION / MUST-HAVE / CONFIDENCE`, about 250 words,
  "no view" allowed, facts vs assumptions labelled, sources cited.

## 2. Round 1: every seat, in parallel
Seat every role in `agents/` except `orchestrator` (it chairs). One background
agent per role, all launched in one message; at most 20 run at once, so queue
the rest and seat them as notifications arrive. Prompt for each:

> You are attending a decision meeting as Nirmaan's <role>. Read your role spec
> at agents/<slug>/agent.md and adopt it. Then read the brief at <brief path>
> and the repo files it points to. Do not modify the repo. Focus: <what this
> role should judge>. Write your position in the brief's format to
> <folder>/<slug>.md and return it as your final message.

Tailor the focus line per role. Roles that check claims (technical-writer,
legal-compliance, qa-engineer) must check against the code, not the docs.
Wait for every position; don't summarise or predict a pending one.

## 3. Round 2: the Orchestrator chairs
One foreground agent with `agents/orchestrator/agent.md`. It reads the brief and
every position, decides each agenda item, names who disagreed and why it chose
as it did, records dissent, and sets gates with an owner role each. It writes:
- `minutes-internal.md`: may include margins, costs and effort;
- `decisions-public.md`: none of those.

## 4. Follow up, implement, verify
- If a decision rests on a number or fact a seat owns, ask that seat with
  SendMessage; don't guess.
- Apply the decisions. Then have the owning seat verify (for example QA checks
  every public claim against the code) and fix what it finds.

## 5. Records
- Public: `docs/<area>/<topic>-decisions.md`, from `decisions-public.md`. Grep it
  for margins, unit costs and hours before committing.
- Private: copy the minutes and every position to
  `~/Nirmaan-internal/<date>-<topic>/`.

## 6. Reserved for the founder
Merging anything that publishes, contracts, spending money, legal counsel, and
public names. Report the decisions and ask; if the founder overrules, record it
in the public record and mark the dissent resolved.
