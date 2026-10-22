# Review loop runbook

How to run, watch, stop and restart the automated PR review loop, and what to
do when it stops a PR. How the review itself works is in
[pr-review.md](pr-review.md) ("Automated loop"); this page links to it and
never restates its rules. Thresholds live in
`.github/scripts/pr-loop/config.json` (`ops`, `rate_limit_pause_minutes`),
not here.

## Service level

The loop's service level is **turnaround**: the time from required CI going
green on a PR's merged head to the merge, with founder wait taken out and
reported apart. Founder wait runs from a stop of class `needs-founder` to the
PR's next resume, merge or close. The target is kept internally, not in this
repository. Measure it with the turnaround report (below), never by hand.

## Daily checks

1. **Health alerts:** `node .github/scripts/pr-loop/digest.mjs --alerts`
   (add `--notify` for a desktop notification on this Mac per alert). It
   alerts when the loop made no pass for `ops.alert_no_pass_minutes` (from the
   heartbeat the loop writes during every pass, or its newest record in
   `calls.jsonl`, so a long review step still counts as alive), or when a lock
   folder in `~/.nirmaan/pr-review/` has been held for over
   `ops.alert_lock_held_minutes`. Exit code 1 means at least one alert.
2. **needs-founder digest:** the same command without `--alerts`. It lists
   every PR whose last loop event is a stop and that has waited longer than
   `ops.needs_founder_digest_hours`, and, apart, the founder waits older than
   `ops.founder_wait_escalate_days`. It reads only the local records, so a PR
   closed by hand after a stop can still be listed: check it on GitHub.
3. **Turnaround report:** `node .github/scripts/pr-loop/turnaround.mjs`
   (`--since <date>`, `--repo <owner/name>`). It prints the median and p90
   turnaround, founder waits apart, and stops per head by class, and writes
   `~/.nirmaan/pr-review/reports/turnaround.json`. It never posts anything.

All three read only `~/.nirmaan/pr-review/` (or `--state-dir`). None of them
calls a model or GitHub.

## When a PR stops

Read the loop's stop comment on the PR, then the key comments it links. By
stop class (the `class` of the `stopped` line in `calls.jsonl`):

- **`needs-founder`** (the Founder Proxy's escalation): the founder decides on
  GitHub (approve the head, or not), then removes the label. Agents never
  clear this label.
- **`merge-conflict`, `update-failed`, `ci-failed-after-fix`:** the author
  merges `main` into the branch (for a CI failure, fixes it) and pushes; a new
  head is reviewed from scratch.
- **The `author-fix` label** (not a stop: a finding only the author may fix): the author fixes it and
  pushes; the label comes off on the new head.
- **`repeated-finding`, `rounds-used-up`, `fixer-*`, `loop-may-not-fix`,
  `no-findings`, `local-check`:** the author reads the findings, fixes the cause at the root
  and pushes.
- **`deferred`, `validation`, `call-failed`, `merge-failed`, `push-failed`,
  `error`, `transient`** (a review, call or GitHub step that gave no usable
  answer): look at the reason; once the cause is
  gone, remove the label to resume with a fresh round count.

Removing the `needs-founder` label is how any labelled stop resumes. A stop
the loop could not label (GitHub unreachable) resumes on the next new head.

## Rate-limit pause

A key, the Founder Proxy or the fixer hitting the plan's session or usage
limit does not stop the PR: the loop makes no model call for any PR for
`rate_limit_pause_minutes`, then reviews the same head again
([pr-review.md](pr-review.md), "Rate limits pause, they do not stop"). The
pause is the file `loop/rate-limit-pause.json` in the state directory and the
log line `rate-limit pause until ...`. Nothing needs doing; do not clear the
pause file by hand.

## Deputy try

When a key-1 lead's call times out or its process fails after its one retry,
the unit's deputy named in `main`'s org chart gets one try, named on the
comment and the `review/team-lead` check ([pr-review.md](pr-review.md), step
4). There is no deputy try for a rate limit, invalid output, failed
validation, a missing spec or the legal team. A deputy that does not answer
leaves the key deferred and the loop stops the PR as above.

## Stop and restart

- **Stop the loop:** `launchctl bootout gui/$(id -u)/online.nirmaan.pr-loop`.
  It ends a pass in progress. The loop pushes a fix only after its local
  checks pass, and the next pass starts that PR's step again; a lock left by
  the stopped process is cleared by the next acquire.
- **Start it:** `launchctl bootstrap gui/$(id -u)
  ~/Library/LaunchAgents/online.nirmaan.pr-loop.plist`. Check
  `~/.nirmaan/pr-review/loop.log` for a new pass line within a minute.
- **After the plist changes on `main`:** stop it, copy the new plist and start
  it ([pr-review.md](pr-review.md), "Running it").
- **A lock alert:** a lock whose process has died is cleared by the next
  acquire. If the alert names a live process, check `loop.log` for a hung
  call before stopping the loop; never delete a lock folder while its
  process is alive.
- **No-pass alert:** check that the service is loaded (`launchctl print
  gui/$(id -u)/online.nirmaan.pr-loop`), then the end of `loop.log` (a
  missing `~/.nirmaan/pr-loop/env`, a `gh` or `claude` login problem, or the
  "refusing to run: this copy differs from main" line).

Never edit the loop's state files under `~/.nirmaan/` by hand.
