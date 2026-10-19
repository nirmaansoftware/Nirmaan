# Decision: the review loop under the new hierarchy (2026-10-18)

**Chair:** Orchestrator (agent). **Process:** [decision-meetings.md](decision-meetings.md), round 2.
**Read at:** `main` df42feb (Founder Proxy merged as #111 to #113); Nirmaan #117 open.
**Facts re-checked:** `main` 645933d, 2026-10-19, after both #117s merged. Where
the facts moved after the meeting, a dated note says so; the decisions are left
as the meeting took them.
**Status:** decided by the meeting, except the items marked **FOUNDER DECIDES**,
which wait for the founder. Nothing here is IMPLEMENTED until its PR merges.

> **Note (2026-10-19): verdict carry-over did not ship.** Both #117s merged
> (Nirmaan 645933d, IP Nirmaan f650396) without verdict carry-over. Key 2 found
> that carrying a verdict to a new head went against decision M4 of
> [pr-review-decisions.md](pr-review-decisions.md) ("a new push voids both"),
> and the CTO decided to keep M4 as it is: with strict up-to-date branches off,
> the loop no longer updates branches, so carry-over would save little. #117
> as merged steps every open PR each pass, and a pass runs every 60 s. The
> parts of this record that assume carry-over (R5.2, R5.8, R7, R9, F3 and
> R-G1) carry their own note below.

## The founder's goal

Every pull request reviewed correctly, with the quickest turnaround, and
preferably exactly two reviews per head commit (minimum and maximum). CI stays as
it is.

## Who sat

Thirteen seats gave independent positions: ai-ml-engineer, backend-engineer,
brand-strategist, devops-engineer, frontend-engineer, legal-compliance,
performance-engineer, principal-architect, product-manager, qa-engineer,
security-engineer, sre and technical-writer. For usage reasons the meeting seated
the roles that run the review loop or depend on it. The Design, content, finance
and sales roles (creative-director, ux-designer, ui-designer,
design-system-engineer, content-strategist, seo-specialist, finance-estimation,
tax-accounts, sales-partnerships, client-communication) and business-analyst,
market-research, database-engineer and legal-counsel were not seated; they were
represented by their leads' "Key 1 review" checklists and their own checklists
as they stand on `main`, which the composite key 1 below loads unchanged.
brand-strategist spoke for Brand and Content and legal-compliance for Business.
The meeting brief listed the Founder Proxy as both merged and open; it is merged
(technical-writer).

## R1. Exactly two reviews: one composite key 1, then key 2

**Decided (all 13 seats agree on the composite):**

1. Key 1 becomes one review per head commit that speaks for every owning team.
   The review script, not the model, builds it from `main`'s map: the base
   checklist once; each owning lead's "Key 1 review" section (with its "Fails
   when" list); and every member checklist that a path rule or a content rule
   names. Every checklist a rule names always loads (the per-team member filter
   goes).
2. The verdict schema gains a required entry per owning team and per loaded
   checklist, each marked "ran" with what was checked or "not run" with a
   reason. Structured output asks for it and the script enforces it: a verdict
   that leaves out any owning team or loaded checklist is a deferral, never a
   pass.
3. Every finding names the checklist it comes from, so a fail still names its
   team and fix routing stays per team.
4. The frontend-engineer checklist is attached by path rule to `website/src/**`
   and to the OS screen paths, not only through Engineering ownership. Today no
   rule names it (frontend-engineer).
5. One key-1 comment and one `review/team-lead` check for all teams. The check
   names and the ruleset do not change.
6. When Brand and Content owns any file, the brand fail list and its member
   checklists load in full, the review reads the built HTML for page PRs, and
   every added public claim cites its source (brand-strategist). Legal-compliance
   labelling ("Technical observation"; "not a legal sign-off") survives into the
   composite text (legal-compliance).
7. The prompt puts the stable parts (specs and checklists, ordered by team id)
   before the diff and the PR text.
8. The composite ships behind a switch that is off. It is turned on only after
   the A/B run on seeded defects in R6 shows it catches, per checklist, at least
   what the per-team reviews catch, with no more false fails.

**Rejected:** key 1 as the lowest common department head (brand-strategist,
frontend-engineer, principal-architect: that head does not carry the
checklists, and it collides with key-2 derivation); per-path specialists (one
review per specialist again).

**Not adopted now:** a deterministic workflow pre-check that fails key 1 before
any model review (security-engineer). Recorded as later work (work item 14).

## R2. Who holds the keys

- During P1, key 1 is the set of interim team leads that own the changed paths,
  in the one composite review. Key 2 stays the Orchestrator on every PR until
  the derived key 2 passes gate G7 (P0 decision D4.1).
- After P1, the department heads take key 1 on their paths by changing the map;
  the composite mechanism is the same. Domain expertise travels with the
  checklists, which are bound to paths and content rules, not to the holder
  (frontend-engineer, legal-compliance).
- Key 1 on `.github/**`, the review scripts and lockfiles always loads the
  security-engineer checklist (security-engineer).
- The Business checklist stays a file on `main`, founder class A, since Legal and
  Compliance has no deputy (legal-compliance).

## R3. Key 2: in sequence, with a cap on its output

**Decided: sequence.** Key 2 runs after key 1 on the same head and reads key 1's
verdict. If key 1 fails, key 2 does not run on that head.

- **For sequence:** backend-engineer, performance-engineer, principal-architect,
  sre, and devops-engineer (who backed parallel only if key 2 does not read key
  1). Key 2's own fail rules check that key 1 ran for every team, that key-1
  findings are answered, and re-test one key-1 claim; those need key 1's
  output. Running key 2 on a head key 1 already failed spends the strongest
  model on a head that will change.
- **Dissent, for parallel and independent:** security-engineer and
  ai-ml-engineer. Their reason: two blind reads are more independent, and an
  injection that steers key 1 cannot reach key 2. **Why not adopted:** the
  turnaround is set by stops, not by the gap a parallel run would save. The risk
  is handled instead by: key 1's verdict reaching key 2 as delimited untrusted
  data, as it does today; key 2 reading the diff itself; and key 2 being
  calibrated alone, on the seeds key 1 misses and on injection seeds (R6). If
  that calibration shows key 2 anchoring on key 1, the meeting reopens this.
- **Dissent, on stopping at a key-1 fail:** performance-engineer preferred running
  key 2 anyway so the author gets one combined fix round. Not adopted now; the
  per-phase log (R5) records whether a second fix round follows key 2 after a
  key-1 fix, and the meeting revisits it on that data.
- **Output cap on key 2 (adopted, ai-ml-engineer):** a fixed maximum number of
  findings, each with one line of evidence, worst first. If more exist, the
  verdict says so; the cap never turns a fail into a pass.
- Models are unchanged: key 1 on the standard model, key 2 on the strongest,
  until calibration data says otherwise.

## R4. The Founder Proxy

**Recommended: fold the proxy into key 2 on founder-class heads.** On a head with
a founder class, key 2 is one review that loads the proxy's spec and reserved
list and returns `pass`, `fail` or `needs-founder`. `needs-founder` blocks and
labels exactly as today, and the comment keeps the wording "Founder Proxy
(agent), acting under the founder's delegation of 2026-10-18; not the founder".
That makes two reviews on every PR.

- **For folding:** ai-ml-engineer, backend-engineer, devops-engineer,
  legal-compliance, performance-engineer, principal-architect,
  security-engineer, sre, technical-writer; brand-strategist agrees if the
  reserved list and the wording carry over unchanged.
- **Dissent, keep it separate:** product-manager, who holds that the proxy stands
  in for the founder's approval and is not a review, and that this is the
  founder's call.
- **FOUNDER DECIDES (F1).** The founder's delegation of 2026-10-18 names a
  separate proxy review after key 1 and key 2. Folding changes that delegation,
  so the meeting recommends and the founder decides. Until then the proxy runs
  as today. If the founder agrees, the fold ships behind a switch and is turned
  on only after an A/B run on founder-class seeds and on replays of recent real
  founder-class heads, with no live third review (principal-architect asked for
  a live shadow; the offline replay meets the same purpose without a third
  review on live PRs).

**Gaps found and decided:**

1. **Reserved list (legal-compliance).** The decision record of 2026-10-18
   reserves "licence terms and export control" for the founder; the proxy's
   reserved list does not name them. The list gains them. Decided; the PR is
   founder class and goes to the founder as usual.
2. **Legal pages (legal-compliance).** Whether a wording change to the terms or
   privacy notice changes an obligation is legal interpretation, which an agent
   may not make. Any change to the rendered text of the terms or privacy pages
   becomes `needs-founder` by script rule, whatever the model says. Decided; it
   adds to the founder's queue, so the founder may overrule.
3. **Founder floor on the review machinery (security-engineer).** With
   CODEOWNERS removed, whether a change weakens a gate is now judged by a model
   reading that change. **Recommended:** for a fixed list of review-machinery
   paths (workflows, the review map, the review and loop scripts and what they
   import, the secret scan, the proxy spec, the review skill and the loop
   schedule file), `review/executive` passes only with the founder's own GitHub
   approval on the head commit, enforced by the script whatever any model
   returns. **FOUNDER DECIDES (F2):** this restores part of what the founder
   removed on 2026-10-18. The meeting recommends F1 and F2 together: two
   reviews on founder-class PRs, and the founder's own approval kept only where
   a model would otherwise judge changes to its own gates.
4. **Before the floor relies on it:** security-engineer verifies that no agent
   session can use the founder's GitHub credential.

## R5. Speed

1. **Metric.** Agent turnaround: from the last required CI check passing on the
   head that merges, to merge. Time waiting for the founder is a separate
   clock, reported and never counted against the loop (product-manager). A
   second measure is stops per reviewed head, by kind. Targets and results are
   internal and never go in the public repos (technical-writer).
2. **Baseline first.** The baseline is taken from the existing review log
   before #117 merges, so its effect can be shown. No change is claimed faster
   without a before and after on the same log (performance-engineer).
   *Note (2026-10-19):* #117 merged before a baseline was written. The
   baseline is still to be computed from log entries dated before #117's merge
   commit, so it measures the loop as it was.
3. **Per-phase log.** Every review log line records the CI-green time, the lock
   wait, each key's start and end, the verdict, findings by severity, the
   validation error if any, and the stop reason and class (qa-engineer,
   performance-engineer, sre, devops-engineer). The log stays on the machine,
   outside the repos.
4. **Stops are the critical path.** The script tags each finding as fixable by
   the loop, the author or the founder, from the finding's path against the
   fixer's forbidden list, not from the model. A fail whose findings are on
   protected paths gets an `author-fix` label with the proposed change and no
   fixer run, instead of a fix round that cannot succeed. Transient errors retry
   on later passes before stopping. A PR stacked on another waits for its base
   (sre, performance-engineer).
5. **Locks.** The review lock is held only for review calls, never during the
   fixer or local tests (sre). The single cross-repo lock becomes one lock per
   repo with a global cap on concurrent model runs, behind a switch that starts
   at today's setting and is raised only while rate-limit outcomes stay flat
   (devops-engineer; sre asked to keep one slot until limits are measured,
   which the starting setting does).
6. **Schedule file.** `main`'s loop schedule file matches the installed one
   (devops-engineer); #117 does this. *Note (2026-10-19):* done; #117 set
   `docs/operations/pr-loop.plist` to a pass every 60 s, as installed.
7. **PR shape rules** (product-manager), in `pr-review.md` and the base
   checklist: one owning unit per PR where the change allows; more than two
   owning teams needs a stated reason; control-plane or `agents/**` paths never
   mixed with product paths (a key-2 fail unless the PR is mechanical and says
   so); a size limit counting changed lines and files, excluding generated
   files, which frontend-engineer asked to count checklists too; the body states
   the owning teams and founder classes from `main`'s map and the test commands
   run. Size limits are guidance until the log shows their effect.
8. **Up-to-date branches.** The ruleset does not require branches to be up to
   date with `main`, while `pr-review.md` says it does (security-engineer;
   checked against the ruleset). The docs are corrected to say what is true now.
   **FOUNDER DECIDES (F3):** the meeting recommends requiring up-to-date branches
   once carry-over (#117) is running, so the merge result is what was reviewed.
   It is a ruleset change.
   *Note (2026-10-19):* strict up-to-date is still off in the ruleset "main:
   two keys active", and `pr-review.md` still says it is required; that
   correction is still to be made. Carry-over did not ship, so the condition
   "once carry-over is running" no longer applies as written; F3 remains the
   founder's decision.

## R6. Quality with two reviews

1. **Calibration sets, blinded, per key holder** (qa-engineer): one seed per
   "Fails when" item in that holder's checklists, plus clean controls; several
   runs per seed with posting off; seed titles and bodies never reveal a seed.
   Seeds and results are kept outside the repos, so no reviewer can read them.
   The runner uses the same reviewer arguments as production.
2. **Measured:** catch (a fail with a finding near the planted line, for the
   right reason), false fails on clean controls, deferrals, and valid citations.
   Seeds are planted per checklist, so the composite's coverage is measured per
   checklist (principal-architect).
3. **Key 2 and the proxy are tested alone**, on the seeds key 1 misses,
   cross-team seeds, prompt-injection seeds (PR body, code comment, Markdown
   file) and founder-class seeds that expect `needs-founder`
   (qa-engineer, security-engineer).
4. **Seeds named by the seats:** untraced claim on an existing page, vaguer but
   still unsourced claim, generic and comparative claims, client named without
   consent, duplicate title in built HTML (brand-strategist); form field not in
   the privacy notice, price and terms mismatch, legal draft missing its draft
   label (legal-compliance); hand-edited `website/public/`, missing
   reduced-motion fallback in a Brand-led page PR, missing empty state on an OS
   screen (frontend-engineer); unsupported status claim (product-manager); the
   workflow items on Platform's fail list, a secret, and a map read from the
   head (security-engineer).
5. **Thresholds** are set in the internal minutes (owner qa-engineer): every
   blocking-class seed must be caught, majors at a set floor, false fails under
   a set ceiling.
6. **Reruns.** The calibration runs again before any change to a reviewer, a
   spec section, a checklist, a prompt, the review script or a model. It is also
   part of gate G7 and of every PR that changes a key holder.
7. **Audit off the merge path:** a monthly sample of merged PRs, including every
   PR the proxy passed, gets an offline third review; reverts and hotfixes are
   traced to their PR; every escaped defect becomes a new seed. A weekly
   turnaround report by phase, internal (performance-engineer, sre). The audit
   does not add a review to any PR.
8. **Switches only after A/B:** the composite key 1 and the proxy fold are each
   turned on only after their A/B run passes the thresholds.

## R7. Carry-over (#117)

*Note (2026-10-19):* this section no longer applies. Carry-over was removed
from both #117s before they merged (see the note at the top), so there is no
carry-over key, void list or carry rule to amend, and the IP patch-id issue in
item 4 has no carry-over code to sit in. The meeting's decision is kept below
as it was taken.

#117 is amended before it merges (security-engineer, sre, principal-architect),
in both repos:

1. The carry-over key includes the role, not only the key and team
   (principal-architect).
2. The void list adds `.github/scripts/secret-scan.mjs`,
   `docs/company/principles.md` and `docs/operations/decision-meetings.md`, and
   also voids on any file the prompt builder loads, so later hierarchy files
   void a carried verdict without a list edit (security-engineer, sre).
3. A head in founder class A is never carried.
4. The IP version compares the exact diff, not `git patch-id`, which ignores
   whitespace; that was reproduced, and whitespace is meaningful in Python and
   YAML. The Nirmaan version already compares the exact diff.

**Dissent:** principal-architect wanted #117 merged unchanged and fixed after.
Not adopted: a follow-up on the same files costs a second founder approval and
leaves a window in which class A verdicts carry.

## R8. Citation validation

1. A finding of major, minor or info severity with a citation that does not
   exist at the cited side is dropped, with a posted note. Those findings never
   block, so the verdict cannot change (qa-engineer, technical-writer,
   security-engineer, ai-ml-engineer).
2. A blocker or critical finding with a bad citation: if the fail already stands
   on other validly cited blockers, the bad one is posted as "citation
   unverified" with no extra run (backend-engineer). Otherwise one repair run
   with the validator's exact error; if it still fails, the key defers. A bad
   citation never becomes a pass.
3. A citation may name the head, the base (removed lines) or `main`, and is
   checked against that tree (technical-writer).
4. Claim citations of the form `file:line` are resolved like findings, not only
   type-checked (technical-writer).
5. Findings from the legal checklist and from the claims checklists stay strict
   at every severity: repair, then defer; never dropped (legal-compliance,
   brand-strategist).
6. No fuzzy re-anchoring to a nearby line (devops-engineer proposed it;
   technical-writer opposed; not adopted). A later check requires a short quoted
   snippet matched near the cited line (qa-engineer).

## R9. Order of work

One open PR at a time on `.github/scripts/pr-review/**`,
`.github/scripts/pr-loop/**` and `docs/operations/pr-review.md` (product-manager).
#117 lands first, amended. *Note (2026-10-19):* #117 landed first in both
repositories, without carry-over, so the R7 amendments were not needed. The
ordered list, with owners and verification, is in the work items, kept with the
internal minutes. P1 item 2 carries the per-phase log; P1 item 17 carries the
turnaround report; P1 items 6 and 7 follow the loop changes; P1 item 5 and the
frontend-engineer checklist rule go together in one map PR, outside the queue.
Each code PR updates the lines of `pr-review.md` it makes true; anything not
running is labelled PLANNED, never IMPLEMENTED (technical-writer). The IP
repository mirrors these changes on its own record.

## What waits for the founder

| Id | Decision | Meeting's recommendation |
|---|---|---|
| F1 | Fold the Founder Proxy into key 2 on founder classes | Yes, behind a switch, after A/B |
| F2 | Founder's own approval required on review-machinery paths, enforced by the script | Yes, together with F1 |
| F3 | Ruleset requires up-to-date branches | Yes, once carry-over runs (carry-over did not ship; see the note at the top) |
| F4 | Legal-page text changes always `needs-founder` | Decided by the meeting; the founder may overrule |
| F5 | Approve each class A PR in the work items | Approve in the order listed |

## Gates

| Gate | Condition | Owner |
|---|---|---|
| R-G1 | Baseline taken from the existing log before #117 merges (#117 merged first; the baseline uses log entries dated before its merge) | performance-engineer |
| R-G2 | Composite switch on only after A/B passes per checklist | qa-engineer |
| R-G3 | Proxy fold on only after F1 and its A/B | qa-engineer, security-engineer |
| R-G4 | Floor relies on no agent being able to use the founder's credential | security-engineer |
| R-G5 | Calibration rerun before any reviewer, prompt, script or model change | qa-engineer |
| R-G6 | No turnaround claim without a before and after | performance-engineer |

## The founder's answers

The founder's decisions on F1 to F4 are to be recorded by the founder, in a
record the founder commits. Agents do not write that record, and this record
does not state the founder's answers. Until the founder's record merges, F1 to
F4 stand above as items that wait for the founder.
