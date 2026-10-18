---
status: IMPLEMENTED (this plan) · phases marked individually
date: 2026-09-23
---

# Roadmap and implementation plan

Status legend used across every doc in `/docs`:

| Label | Meaning |
|---|---|
| **IMPLEMENTED** | Built, tested and merged. You can use it today. |
| **PLANNED** | Designed and committed to, not built yet. |
| **PROPOSED** | A recommendation that still needs a founder decision. |
| **EXPERIMENTAL** | Built, but not trusted for real client work yet. |

## Target state

```text
TARGET STATE
├── Product architecture   → two experiences over one data model (product/portal-architecture.md)
├── Business architecture  → services → recurring → products (company/business-model.md)
├── Agent architecture     → orchestrated specialists + human gates (ai/agent-architecture.md)
├── Data architecture      → traceable objects with human IDs (product/project-knowledge-graph.md)
├── Client workflow        → problem → proposal → approval → progress (operations/lead-to-project.md)
├── Internal workflow      → lead → discovery → … → maintenance (operations/project-lifecycle.md)
└── Financial workflow     → quote → estimate → actual → margin (finance/project-economics.md)
```

## Phases

### Phase 0: Foundation · IMPLEMENTED

- Audit of the current state (`assessment/current-state.md`).
- The full `/docs` structure, with every doc marked by status.
- Data model for phases 1–4, designed once so later phases don't reshape tables.
- Internal design system for `/os`, reusing the public site's tokens.

### Phase 1: Business OS · IMPLEMENTED (PR #18)

The highest-value phase: without it there is nowhere to put a customer, and
nothing can be shown to one.

| Capability | Scope in Phase 1 |
|---|---|
| Authentication | Email + password (scrypt), database sessions (hashed tokens, httpOnly cookie, 14-day expiry), login/logout. |
| RBAC | 10 roles, capability-based (`can(role, capability)`), checked in every server action and page, not just hidden in the UI. |
| Audit log | Every security-relevant action (login, lead status, proposal sent / decided, gate decisions, change requests). |
| Human-readable IDs | `LEAD-`, `REQ-`, `FEAT-`, `TASK-`, `TEST-`, `PROP-`, `CR-`, `PRJ-`, `DEPLOY-`, allocated atomically. |
| Leads | Public intake API (validated, honeypot, rate-limited, CORS-locked) plus manual entry, a pipeline list, detail pages and status changes. |
| Discovery | Business Analyst agent in discovery mode turns a raw problem into FACT / ASSUMPTION / QUESTION / RECOMMENDATION items. A human confirms or rejects each one. Only facts and confirmed assumptions can become requirements (enforced in code). |
| Requirements | `REQ-` items with kind, priority, acceptance criteria and a link back to the discovery item they came from. |
| Proposals | Structured proposal (problem, solution, scope, out of scope, deliverables, milestones, technology, price, payment schedule, maintenance option, assumptions, change policy) with internal-only estimated economics. |
| Client proposal review | Capability link (`/p/<token>`, token stored hashed): approve, reject or ask for clarification. |
| Project creation | Approving a proposal automatically creates the client, the project workspace (`PRJ-`), links requirements, records the PROPOSAL gate and logs it all. |
| Traceability | `REQ → FEAT → TASK → TEST → DEPLOY` links with evidence records. The project page shows which requirements are untested or undeployed. |
| Change requests | `CR-` with a scope decision. In scope becomes a task; out of scope carries cost and timeline impact and needs a decision. |
| Approvals | Existing gate engine, extended from 6 to 9 gates, with decisions attributed to a real user and capability-checked. |
| Client status page | Capability link (`/status/<token>`) with a simple progress bar and current milestone. No internal detail. |
| Today dashboard | Founder view of real Phase 1 numbers (leads, pipeline, conversion, projects, approvals, CRs, AI cost) and an exceptions list. Revenue, margin and MRR say "Phase 3" instead of showing fake numbers. |
| AI usage ledger | `AiUsage` rows (model, provider, tokens, cost, latency, task, success) for every discovery run. |
| Public site | Repositioned around "You bring the problem. We build the system." Progressive problem-first intake. Agency OS page removed from public view. |

### Phase 2: AI software factory · IMPLEMENTED (agents run live only with a configured model)

| Capability | Scope |
|---|---|
| Solution Architect | Approved requirements + proposal → structured architecture (simplest safe design, build-vs-buy, components, tradeoffs, risks, security, open questions). Stored privately as a PROPOSED run; a reviewer accepts or rejects it. |
| Planner | Requirements (+ accepted architecture) → features and tasks, each task owned by a specialist agent. Invented REQ codes or unknown agents are rejected; uncovered MUST requirements are flagged. Accepting creates FEAT-/TASK- rows and REQ→FEAT→TASK links in one transaction. |
| Orchestrator loop | Runs READY agent tasks whose dependencies are met, one by one, within a per-project AI budget; stops at the budget, the batch size, or the first failure (the task is marked BLOCKED with the reason). No budget, no automated runs. |
| Metering | Every `dispatchTask` run, success or failure, is now in the `AiUsage` ledger. |
| Criticality routing | Architect, security, DevOps, SRE and orchestrator runs never go below their baseline model and always create a human review task. |
| Evidence from CI | `POST /api/ci/evidence` with a per-project token (hashed, rotatable) records test results against TEST- codes, idempotent per run. |

Still **PLANNED** within Phase 2: agents writing code into a client repository
through the tool registry (today they produce reviewed artifacts), and
automated preview deploys.

### Phase 3: Financial OS · IMPLEMENTED

| Capability | Scope |
|---|---|
| Invoices | Client approval creates one DRAFT invoice per payment step, inside the approval transaction; amounts sum exactly to the price. Approved priced change requests get their own invoice. Manual invoices for anything else. Issue → due date from payment terms; void (never with payments). |
| Payments | Partial and full payments (bank, UPI, card, cash); overpayment refused; PAID when fully settled. |
| GST | Company settings hold GSTIN and rate; charging GST requires a GSTIN. Tax shown separately. |
| Actual costs | Human effort (hours × loaded hourly cost, or amount), infrastructure, external AI bills, other. AI spend from the usage ledger is added live (USD × settings rate), never re-entered. |
| Economics | Per project: contract (price + approved CRs), invoiced, collected, outstanding, estimated vs actual cost, hours and margin. Margins are blank, not 100%, when there are no cost figures. |
| Recurring | Care plans (SUB-) bill monthly as DRAFT invoices; each month can only be billed once; pause/cancel; MRR; client lifetime value. |
| CFO screen | `/os/finance`: collected, outstanding, overdue, MRR, actual gross margin, estimate vs actual by project and by kind of work, invoices, plans, settings. Today shows the same money figures to finance roles. |
| Client view | The status page lists sent invoices, what's due, and payment instructions. |

**PLANNED:** online payment collection (a gateway) and a scheduled job for
recurring invoices (today: a "Create due invoices" button).

### Phase 4: Knowledge and IP · IMPLEMENTED

| Capability | Scope |
|---|---|
| IP library | `/os/library`: reusable assets (IP-) with category, version, dependencies, owner, docs link and the projects using each. Maturity is computed, not claimed: experimental → used once → proven after 3 projects. |
| Knowledge base | `/os/knowledge`: searchable articles (playbooks, lessons, decisions, post-mortems) with source and author; linked from each project. |
| Post-mortems | Ten fixed questions; at least six answered. Saving snapshots the project's economics and publishes one POST_MORTEM article. The HANDOVER gate can't be approved without it. |
| Client accounts | Client Admin / Client User logins bound to one client. `/portal` shows only their projects, progress, sent invoices and support; admins can also ask for changes (which arrive as change requests). Client roles never reach `/os`. |
| Support | `/os/support`: client requests (SR-) with priority and status, answered by the team. |

Capability links still work for proposals and status pages; accounts are for
clients who need ongoing access.

### Phase 5: Productization signals · IMPLEMENTED (products themselves: PROPOSED)

| Capability | Scope |
|---|---|
| Patterns screen | `/os/patterns` (finance roles): won projects grouped by kind of work and checked against the four criteria in `strategy/productization.md`. Each is pass, fail or unknown; unknown (no costs or asset uses recorded) never counts as a pass. |
| Verdict | Candidate (all four pass), watch (repeat demand plus at least one other), not yet. |
| Decisions | "Pursue a configurable starter" or "not now", with reasoning, saved as a knowledge article with the signal snapshot at the time. |

Building an actual product stays **PROPOSED** until a kind of work is a
candidate and a decision to pursue it has been recorded.

## Build method (every phase)

```text
PLAN → IMPLEMENT → TEST → REVIEW → DOCUMENT
```

After every milestone: run all tests, typecheck, lint and build; check
responsive behaviour and permissions; update docs and `CHANGELOG.md`.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Over-building (a "platform" before revenue) | Phases gated on use. Phase 2 starts only when Phase 1 is in daily use for real leads. |
| Public repo leaks internal numbers | Docs hold models and policy only. Figures live in the database. **PROPOSED:** make the repo private. |
| Custom auth bugs | Small surface: scrypt, constant-time compare, hashed session tokens, `httpOnly`/`sameSite=lax`/`secure` cookies, tests. Move to a maintained library if the auth surface grows (SSO, MFA). |
| SQLite limits | Fine for one or two internal users. The migration trigger to Postgres is documented in `engineering/architecture.md`. |
| Agent output treated as truth | Discovery output is typed and always needs a human decision. Gates stay human-only. |
| Capability links forwarded to the wrong person | Tokens are unguessable (256-bit) and stored hashed. The founder can revoke or regenerate them. Links grant one action on one object, never an account. |
