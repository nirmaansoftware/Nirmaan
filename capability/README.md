# Capability records and levels

How a skill's level is recorded and computed. Decisions behind it: D6.7 to
D6.9 of
[`docs/operations/capability-hierarchy-decisions.md`](../docs/operations/capability-hierarchy-decisions.md).

**Status.** The records format, the generator and its CI checks exist. No
record exists yet, so every skill's level is `none`. No level is shown on any
page, and none may be: levels are internal (decision record D7.4 and gate G8).

## Levels

| Level | What it needs |
|---|---|
| Checked | A passing `check` record by the skill's checker role (`owners.checker` in its front matter), on the skill file's current git blob SHA |
| Tested | Checked, plus a passing tool-judged `eval_run` on the current SHA, with `n` of at least 3 and exit code 0 |
| Used | Tested, plus a `pr_use` record: a passing key-1 review verdict that cites the skill |

- An edit to the skill file changes its SHA, so its Checked and Tested lapse
  and the level drops until it is checked and tested again. `stale: true`
  in `levels.json` marks a skill that was checked on an older SHA.
- Heuristic runs (keyword or structure checkers, `os/src/lib/evaluation`)
  never count toward Tested, and neither does a run whose model or provider
  is `mock`. Rubric-judged runs are counted apart (`rubric_evals`) and never
  raise a level.
- A PR-text tag is not a use. Only a key-1 verdict that cites the skill is,
  written as a record by the review script. A revert is recorded as a new
  line that supersedes the use.

## Records

`records/*.jsonl` hold one JSON object per line, in the shape of
[`records/schema.json`](records/schema.json). Events:

- `check`: written by the checker role's session (`written_by: checker`),
  never by the skill's writer.
- `eval_run`: written by the tool run (`written_by: tool`), with the judge,
  command, exit code, `n`, model and provider.
- `pr_use`: written by the review script (`written_by: review`), with the PR,
  `key: 1` and the verdict.

The files are append-only: CI fails when a line that is on the base branch is
edited, reordered or removed. A correction is a new line whose `supersedes`
names the record it replaces; the replaced line then no longer counts.
Evidence from client work stays private: a record points to it and never
copies it.

## The generator

`capability/levels.json` is generated, never edited by hand:

```sh
node capability/tools/levels.mjs --write   # regenerate
node capability/tools/levels.mjs           # check records and that levels.json is current
```

It is a pure function of the records and the skill files, with sorted keys
and no dates, so the same inputs give the same bytes. repo-checks runs it
with `--base`, which also checks the append-only rule against the base
branch. Not computed here yet: the `review_by` date of a skill (a stale file
cannot gain a level) and a change of model route, because both would make the
output depend on the day or on settings outside the repository; the checker
applies them when writing a record.
