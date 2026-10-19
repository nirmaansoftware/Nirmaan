# Skills

A skill file is the written knowledge an agent role uses to do one kind of
work well: what the work covers, how it is done here, the standards it
follows, how it fails, and how a reviewer checks it. Skills teach the work;
they never sell it.

Decisions behind this format: D6.1 to D6.6 of
[`docs/operations/capability-hierarchy-decisions.md`](../docs/operations/capability-hierarchy-decisions.md).
These style rules are owned by Brand and Content. The validator, [`.github/scripts/skills.mjs`](../.github/scripts/skills.mjs),
runs in repo-checks and fails a file that breaks a rule marked
**(checked)** below. Start from [`_template.md`](_template.md).

No skill file exists yet, and no skill is loaded by any agent at runtime
(PLANNED: the prompt composer and its byte budget come first). No level is
shown for any skill until the records generator exists.

## Where a skill lives

- **Path:** `skills/<unit>/<skill-id>.md`. `<unit>` is the id of an active
  unit, which today means a key-1 team in
  [`.github/review-teams.yml`](../.github/review-teams.yml) (a planned unit
  owns no skill), and equals the front matter `unit` **(checked)**.
- **Id:** lower-case words joined by hyphens, equal to the file name, unique
  across `skills/` and never containing the unit **(checked)**. An id is
  immutable: a reorganisation moves the file to another unit folder and never
  renames it.
- **Review:** `.github/review-teams.yml` has a rule `skills/<unit>/**` whose
  team is that unit **(checked)**. The first skill in a unit adds the rule in
  the same PR. These two files (`README.md`, `_template.md`) are Brand and
  Content's.

## Front matter **(checked)**

Exactly these fields, in a YAML block at the top of the file:

| Field | What it holds |
|---|---|
| `id` | the skill id |
| `name` | a short plain name |
| `unit` | the owning unit's id |
| `tier` | `runnable` (has a worked example and eval cases) or `knowledge-only` |
| `prerequisites` | skill ids to know first; each must exist |
| `related` | related skill ids, including the other organisation's (not checked) |
| `tools` | each tool with its access: `(free, connected)` or `(paid, known only)` |
| `eval_cases` | eval case ids; at least one for a `runnable` skill |
| `held_by` | the agent roles that hold the skill; each is a lead or member of a review team |
| `owners` | `writer` (role), `checker` (a different role) and `unit` |
| `volatility` | `fast`, `medium` or `stable` |
| `as_of` | the date the sources were last checked (not in the future) |
| `review_by` | at most 3 months after `as_of` when fast, 6 when medium, 12 when stable |

There is no level and no sign-off in the front matter. Levels (Checked,
Tested, Used) come only from records, never from the file.

## Body **(checked)**

- Line 1 of the body is `Use when: ...`, one sentence on when to load the
  skill.
- Then these eight headings, exactly and in this order:
  1. `## Scope`: what the skill covers and what it does not.
  2. `## Core concepts`: original writing.
  3. `## How we do it`: procedures and checklists; cite the repository paths
     they follow.
  4. `## Standards and specifications`: cited by number and summarised,
     never copied.
  5. `## Common failures and pitfalls`
  6. `## How good work is verified`: what a reviewer checks.
  7. `## Worked example`: a link to `examples/<skill-id>/` for a `runnable`
     skill. A `knowledge-only` skill writes `None:` and says why it has no
     example.
  8. `## Sources`
- A section with nothing to say is not left empty: it says `None: <reason>`.
- **Limits:** 700 to 2,500 words in the body, not counting Sources, and at
  most 16 KB for the whole file. A larger topic is split into several skills.

## Sources and citations

- Inline markers `[S1]`, `[S2]` resolve to the Sources list **(checked)**.
  Each source is one line:
  `- [S1] Title. Publisher. https://... Version 2.1 (or: accessed YYYY-MM-DD). Licence: <licence>.`
  with a URL, a version or access date, and the licence **(checked)**.
- Every factual sentence in Core concepts, Standards and Common failures
  carries a marker; procedures in How we do it cite a repository path.
- `[NEEDS SOURCE]` fails the validator, so it blocks merge **(checked)**.
- Model memory is never a source.
- No run of 12 or more words is copied from a source outside quotation marks,
  and quotations total at most 50 words per file (the checker's review).
- Content from another repository is linked, never copied. A knowledge PR
  lists the licences of the datasets, model weights and dependencies it
  relies on. A compliance skill says it is not legal advice.

## Voice **(checked)**

- No em or en dashes. Use a colon, a comma or two sentences.
- No "expert", and none of the phrases on the **Never** list in
  [`docs/company/positioning.md`](../docs/company/positioning.md) (the
  validator reads that list).
- No company-claim voice: a skill does not praise Nirmaan, its team, its
  clients or its track record.
- No currency amounts. Prices belong to Commercial and to the founder, not to
  a skill.
- No text that tells an agent to change its permissions, its escalation or a
  review: skipping or passing a review, approving or merging a PR, bypassing
  a gate, not escalating, or overriding the role spec. A skill is reference
  text; the role spec's constraints always win.

## Dates

`as_of` is when the sources were last checked. `review_by` follows the
volatility (fast 3 months, medium 6, stable 12). A file past its `review_by`
date is stale: it cannot gain a level until it is checked again.

## Running the validator

```sh
node .github/scripts/skills.mjs
```

It checks every `skills/<unit>/*.md`, and checks `_template.md` for its
structure and voice only (it has no subject, so word count, ids, dates, roles
and the review rule are not checked for it).
