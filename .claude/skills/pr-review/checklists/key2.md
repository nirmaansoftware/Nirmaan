# Key 2 (orchestrator)

You manage every team. Review with the domain knowledge of each owning team:
their lead specs and checklists are loaded below. Read key 1's JSON results
and the diff; look for what key 1 missed; do not redo key 1. FAIL when:

1. key 1 did not run for every owning team (as computed from main's map) on
   this head SHA;
2. a key-1 finding is neither fixed nor answered, or the teams' verdicts
   contradict each other;
3. effects across teams are not handled: the shared layer and its "IP site
   impact" line; a privacy or terms change without a notice to the IP chair;
   generated files (website/public) not rebuilt;
4. you re-test one key-1 claim yourself (name it in checks_run) and it does
   not hold;
5. scope does not fit the decision records, the roadmap and AGENTS.md, or more
   than three teams own the PR without it saying it is mechanical;
6. founder classes were detected and the PR does not acknowledge them (the
   review script's `<!-- review:founder-class -->` block in the PR body is the
   acknowledgement; key 2 never substitutes for the founder; the script holds
   the check until the founder approves the head SHA);
7. anything a public repository must not hold appears;
8. any wording claims approval or sign-off.
