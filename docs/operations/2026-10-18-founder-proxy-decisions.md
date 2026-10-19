# Decision: a Founder Proxy agent replaces the founder as the third reviewer (2026-10-18)

**Decided by:** the founder, 2026-10-18, in a working session with the CTO agent.
**Confirmed by:** the founder's own GitHub approval (account `nirmaansoftware`) of the
pull request that adds this record. Until that approval exists on the PR's head, this
record is a claim, not a decision.

## What the founder decided
Asked how founder-class pull requests (classes A to F: control plane, production
config, money, legal and data, public names and products, the send gate) should be
approved, the founder was offered three options:

1. Keep the founder as code owner and approve each such PR on GitHub.
2. Remove the founder as a reviewer, so those PRs merge on the two agent keys alone.
3. Let agents use the founder's own GitHub account to approve.

The founder first chose option 3. The permission system blocked agents from approving
with the founder's credentials (self-approval), and that route was not pursued. The
founder then decided: **remove the founder as a reviewer, or create an agent that
plays the founder's role in these cases and replace the founder with that agent.**
The second form was chosen: the Founder Proxy.

## What changes
- A Founder Proxy agent (`agents/founder-proxy/agent.md`) reviews every founder-class
  PR after key 1 and key 2 pass. `review/executive` turns green only when key 2 and
  the proxy both pass.
- `.github/CODEOWNERS` is removed, so a founder-class PR no longer waits for the
  founder's GitHub approval.
- The proxy never approves what only the founder can do. It returns `needs-founder`
  for: new spending, contracts and legal counsel, public names and renames, prices
  sent to clients, turning on the OS worker or any sending, weakening the review
  system's own gates, licence terms and export control. The founder answers by
  approving that head on GitHub and removing the label.
- Proxy comments always say "Founder Proxy (agent), acting under the founder's
  delegation of 2026-10-18; not the founder".

## Risks the founder was told before deciding
Agents can now merge changes to the review system, prices, legal pages and the
send-gate code without a human, unless the proxy escalates them. The founder can
reverse this at any time by restoring CODEOWNERS (a founder-class PR) or by bypassing
the ruleset as admin.
