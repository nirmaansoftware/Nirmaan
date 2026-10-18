# Productization · signals IMPLEMENTED (`/os/patterns`), products PROPOSED

Build a product only when the evidence says so:

1. The same problem appears in **3 or more** won projects (search leads and
   requirements by theme).
2. The solutions share **most** of their architecture and components.
3. Customers would pay a recurring fee for a configured version.
4. Margin on those projects shows the custom build is repeatedly
   underpriced or rebuilt.

How the OS measures each criterion (per kind of work, won projects only):

| Criterion | Measured as | Passes at |
|---|---|---|
| Repeat demand | Won projects of that kind | 3 or more |
| Shared components | IP-library assets used by at least half of them (and at least two) | 2 or more assets |
| Recurring willingness | Share of their clients who ever took a care plan | 50% or more |
| Underpriced or rebuilt | Median actual cost vs estimated cost, over projects with both | 10% or more over, needs 2 projects |

Missing data is shown as unknown, never as a pass. A candidate needs all
four; the decision itself is recorded as a knowledge article.

Path: extract components into the IP library → a configurable template →
an internal "starter" used on the next similar client → only then a
self-serve product. Candidate themes to watch (not commitments): order and
follow-up tracking for SMBs, booking and scheduling, document intake with AI
extraction, and our own repeated rework (measured from estimate versus actual
and from copies of the shared site layer).

## Products we built for our own use · PROPOSED (2026-10-18)

A product that started from Nirmaan's own use, like Nirmaan Outreach, fails
criterion 1 by construction, because the criteria count won client projects.
For such a product, criteria 1 to 4 are shown as unknown, never as a pass, and
its own gate is:

- **Success** is clients still paying after the three-month minimum term
  ([nirmaan-outreach-decisions.md](../product/nirmaan-outreach-decisions.md)),
  judged at the existing price review. Waitlist sign-ups never count.
- **No second product or new service** is built before Outreach passes this
  gate.

Decided in the [market learnings decisions](market-learnings-decisions.md)
(2.6). The client portal is not a product candidate for now: the OS has only
been used on Nirmaan itself, as a test, and it is single-tenant.
