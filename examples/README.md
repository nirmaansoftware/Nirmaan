# Worked examples

A worked example is a small, real, tested build that shows a runnable skill
in use (decision record D6.1 and D6.9,
[`docs/operations/capability-hierarchy-decisions.md`](../docs/operations/capability-hierarchy-decisions.md)).
Each one lives in
`examples/<skill-id>/`, named by the id of the skill it belongs to, and that
skill's Worked example section links it.

No example exists yet.

## What an example holds

- Its own lockfile, so it installs the same way every time:
  - Node: `package.json` and `package-lock.json`, with a `test` script;
  - Python: `requirements.txt` with every requirement pinned by
    `--hash=sha256:...` (pytest included), and tests that `pytest` finds.
- No secret, token, model key or paid account. An example that would need one
  is not runnable in CI; its skill stays knowledge-only until it is.
- No client data, and the licences of its datasets, model weights and
  dependencies listed in the PR that adds it.

## How CI runs them

The Examples workflow (`.github/workflows/examples.yml`) runs
`.github/scripts/examples.mjs` on free GitHub-hosted runners:

- on a pull request, only the examples it changes (the rest are reported as
  skipped, and the job always reports);
- on every push to `main`, every week and by hand, all of them.

Node examples install with `npm ci --ignore-scripts` and run `npm test
--ignore-scripts`; Python examples install with `pip install
--require-hashes --no-deps` and run `python -m pytest -q`. Each example runs
in a clean environment with no tokens, within a time budget.

The workflow is not a required check: making it one is a change to the
repository's ruleset, which the founder makes.

## Review

Who reviews an example follows its skill's unit: the PR that adds a unit's
first example adds a rule `examples/<skill-id>/**` for that unit in
`.github/review-teams.yml`, and dependency manifests
(`examples/**/package.json`, `requirements.txt`) get the performance-engineer
checklist then. This README is Platform and Quality's, with the
devops-engineer checklist.
