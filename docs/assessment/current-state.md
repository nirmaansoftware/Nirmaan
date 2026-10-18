---
status: IMPLEMENTED
date: 2026-09-23
scope: Whole repository, before the Nirmaan OS transformation (Phase 0)
---

# Current-state audit

Audited by direct inspection of every file under `/`, `/os`, `/agents`, `/docs`
and `/projects`, and by running the existing test suite (107/107 passing,
~4.5 min), typecheck and lint. Nothing here is assumed.

```text
CURRENT STATE
├── What exists
├── What works
├── What is incomplete
├── What is fragile
├── What should be preserved
├── What should be refactored
└── What should be replaced
```

## What exists

| Area | Where | Notes |
|---|---|---|
| Public website | `/` (Eleventy → static HTML, deployed on Vercel) | 7 pages, redesigned on 2026-09-23 ("block by block"). Contact form posts to a configurable `data-endpoint`, which is **not yet connected**. |
| Internal platform ("Agency OS") | `/os` (Next.js 16, React 19, Prisma 6, SQLite) | Local-only, never deployed. Two screens: Projects list/detail and Approvals. |
| Agent specs | `/agents/<slug>/agent.md` (25 agents) | Markdown specs with frontmatter permissions, loaded by `loadAgent()`. |
| Agent runtime | `os/src/lib/agents`, `providers`, `model-router.ts` | `runAgent()` → provider (default: the founder's `claude` CLI, sandboxed with no tools) → versioned artifact file with handoff frontmatter. |
| Orchestration | `os/src/lib/orchestrator` | `dispatchTask()`, complexity-based model tiering, six quality gates enforced against `Approval` rows. |
| Tools | `os/src/lib/tools` | Project-scoped filesystem tools plus a fixed `npm test` runner. No deploy or git tool, enforced by a standing test. |
| Evaluation | `os/src/lib/evaluation` | 7 eval cases with checkers proven to tell good output from bad (mock provider). |
| Cost and safety | `os/src/lib/ai/costs`, `security/redact.ts`, `db/logEvent.ts` | Real cost from provider when reported; secret redaction on every Event write. |
| Architecture doc | `docs/history/agency-os-plan.md` | Phase 0–9 record of the Agency OS build. Honest about what's mock-only. |

## What works (verified)

- Public site builds (`npm run build` at root) and deploys to Vercel from `main`.
- `/os`: 107 tests pass. Gate enforcement, dispatch, tools, eval harness and
  redaction all have real tests against the real SQLite database.
- A live agent run has been performed once (Product Manager via the `claude`
  CLI; $0.23, ~81 s) and produced a usable PRD.

## What is incomplete

- **No authentication or authorization** anywhere in `/os`. Every approval is
  attributed to the literal string `"human"`. This is the single largest gap:
  the app cannot be deployed or shown to anyone as it stands.
- **No lead or client pipeline.** The data model starts at `Project`; there is
  nowhere to put an inbound enquiry, a discovery conversation, or a proposal.
- **No proposals, pricing, payments, change requests or economics.**
- **No customer-facing surface** beyond the static site. Clients can't review a
  proposal or see progress.
- **No traceability.** Requirements live only inside markdown artifacts; there
  are no IDs (REQ-/FEAT-/TEST-) and no links between requirement, work, test
  and deployment.
- **No AI-usage ledger.** Cost is written into free-text Event messages and
  parsed back out (`observability/projectSummary.ts`). That works, but it can't
  answer "AI cost by task, model or project" reliably.
- Business Analyst's spec starts from a PRD. There is no agent that starts from a
  customer's raw problem statement.

## What is fragile

- **Public repository.** `nirmaansoftware/Nirmaan` (formerly `gunatit178/Nirmaan`) is public. `/projects/*` and
  `/docs/*` are readable by anyone. The existing plan already warns about client
  data; the same now applies to internal pricing, margins and strategy (see
  Risks below).
- Tests share the developer's `dev.db` (fixture rows are created and cleaned up
  per test). This is acceptable, but a crashed test run can leave fixture rows
  behind.
- The test suite is slow (~4.5 min), dominated by process-spawning tests.
- Inline styles throughout the two dashboard pages; there is no UI system.
- `os/src/app/layout.tsx` still has the create-next-app title ("Create Next App").

## What should be preserved

Nearly all of `/os/src/lib`. It's careful, tested and honest about its
limits: the model router, the provider abstraction (including the `claude`
CLI decision), sandboxed providers, gate enforcement, the tool registry and its
"no deploy tool" invariant, redaction, the eval harness, and the file-based
artifact convention. Also the 25 agent specs, and the public site.

## What should be refactored

- Dashboard pages: move from inline styles to one small, shared CSS system that
  reuses the public site's tokens (same brand, calmer treatment).
- `/dashboard` becomes `/os`. The old URLs redirect, so nothing that links there
  breaks.
- Approvals: attribute decisions to a real user, and check capability, not
  just UI visibility.
- The gate list grows from 6 to 9 so it covers the prompt's business gates
  (proposal, implementation plan, handover). The six existing transitions keep
  their exact semantics.
- `business-analyst` gains an explicit discovery mode that starts from a raw
  customer problem, with the facts / assumptions / questions / recommendations
  split required by the operating model.

## What should be replaced

- The public **Agency OS** page. It publishes the internal agent roster,
  pipeline and gate structure. The operating model (section 36) says internal
  agent architecture and proprietary workflow must not be public. Its
  customer-relevant ideas (human approval at key decisions, evidence before
  "done") move into the Process page, and `/agency-os.html` redirects there.
- The public site's positioning. It currently leads with "We build software,
  block by block" and a project-type-first form. The operating model leads
  with the problem: "You bring the problem. We build the system." The intake
  must start from the problem, not from a solution menu.

## Risks found

| Risk | Severity | Mitigation taken in this work |
|---|---|---|
| Internal pricing, margins and strategy published via a public repo | High | Docs describe models, formulas and policy, **never real figures**. Real numbers live only in the database. Recommendation to the founder: make the repo private (not done automatically, because it changes who can see the project). |
| `/os` has no auth | High | Phase 1 adds database sessions, hashed passwords and capability-based RBAC before anything else. |
| Client data in git | High | Client and lead data live only in the database (gitignored). `/projects/*` stays fixture-only. |
| AI agents writing requirements from guesses | Medium | Discovery items are typed FACT / ASSUMPTION / QUESTION / RECOMMENDATION. Code refuses to promote an unconfirmed assumption to a requirement. |
