# Evaluation

**IMPLEMENTED:** `src/lib/evaluation/`: 7 eval cases (planted SQL injection,
hardcoded secret, off-by-one, single point of failure, fabricated stats,
proceed-vs-flag judgement). Each checker is proven to tell good output from
bad with fixtures. Discovery parsing has strict tests (rejects prose, bad
JSON, unknown kinds, empties).

**IMPLEMENTED (judges and records):** those checkers are labelled
`heuristic`. A tool judge (`toolJudge.ts`) writes the agent's output to a
scratch folder and runs a hidden `node --test` suite or a command there, with
no token in its environment; exit code 0 passes, and the command and exit code
are kept. An eval case may name skills to load. `runEvalSuite` with `record`
appends one `eval_run` line per skill and judge to `capability/records/`
(`records.ts`), failures included. Only tool-judged, non-mock runs count
toward a skill's Tested level ([`capability/README.md`](../../capability/README.md)).
No eval case uses a tool judge yet.

**PLANNED:**

- Discovery eval set: 10 real (anonymized) leads with a human-written ideal
  split of facts, assumptions, questions and recommendations; score recall of
  questions and the rate of assumptions mislabelled as facts.
- Run evals on model or prompt changes before switching defaults.
- Track, per agent, the acceptance rate of its output (items confirmed versus
  rejected by humans), which is available from `DiscoveryItem` statuses today.
