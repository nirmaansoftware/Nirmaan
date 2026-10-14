> **Historical record.** This is the original Agency OS plan (phases 0–9). The current plan is
> [`strategy/roadmap.md`](strategy/roadmap.md) and the current state is [`assessment/current-state.md`](assessment/current-state.md).
> Where they differ (9 gates instead of 6, `/os` instead of `/dashboard`, auth now implemented,
> the public Agency OS page removed), the newer documents are correct.
> Paths in it (`/app`) predate the 2026-10 restructure: `/app` is now `os/`.

# Agency OS — Architecture & Implementation Plan

## Context

The repo (`gunatit178/antigravity_proj_1`) is currently a small static marketing site — five HTML pages, hand-written CSS, a Tailwind build step, and a handful of vanilla JS scripts (page transitions, a Three.js scene, tilt effects, a contact form, a device switcher). Two commits total, no backend, no database, no CI, no deployment config, no AI functionality. It was vibe-coded quickly and works, but it's just a brochure site.

The owner wants to turn this repo into the foundation of an **AI-native software agency**: a system where a client requirement goes in, and a coordinated team of specialized AI agents carries it through discovery → requirements → design → architecture → implementation → QA → deployment → monitoring → maintenance, with the owner as the human approver at key gates. The public website stays, but becomes one part of a larger system rather than the whole repo.

This is explicitly a **plan-first** engagement: produce the audit + target architecture, get sign-off, then build incrementally per milestone (inspect → implement → test → verify → document → report) rather than attempting the whole system in one pass. Nothing described in Phases 1+ below gets built until this plan is approved, and even after approval each phase ships and is verified independently.

---

## A. Repository Audit

**Structure** (confirmed by direct inspection, not assumption):
- Root: `index.html`, `contact.html`, `process.html`, `projects.html`, `services.html`, `technology.html` — 5 content pages, ~4,960 lines of HTML/CSS/JS total.
- `styles.css` (hand-written, 509 lines) + `tailwind.css` (generated, minified single-line output from the Tailwind build step).
- JS: `page-transitions.js`, `layers-3d.js` (729 lines, Three.js-based hero/architecture scenes, vendored copy in `/vendor/three.module.min.js` with CDN fallback), `tilt.js`, `contact-form.js`, `device-switcher.js`.
- `contact-form.js` is honest and well-built: validates client-side, has a honeypot spam trap, posts to a `data-endpoint` attribute (Formspree-style), and explicitly refuses to claim success if no endpoint is configured. No backend exists — forms only work once a third-party endpoint is wired in.
- `package.json`: one devDependency (`tailwindcss@^3.4.17`), two scripts (`build:css`, `watch:css`). No other tooling.
- `tailwind.config.js`: `content: ['./*.html', './*.js']` — scoped to repo root only, which matters for later (adding subdirectories won't leak into this build unless the glob is widened).
- No CI/CD config (no GitHub Actions, no `vercel.json`/`netlify.toml`), no environment files, no routing framework, no CMS/data layer, no tests, no auth, no database, no existing AI functionality.
- Git history: 2 commits at the time of this audit (`Initial commit of website source`, a layout-compaction commit). Only `main` existed locally and on the remote; no other branches, no open PRs — this was genuinely greenfield beyond the static site.
- SEO scaffolding present: `robots.txt`, `sitemap.xml`, `og-image.jpg`. Placeholders (`[YOUR STUDIO NAME]`, `[YOUR-DOMAIN]`) are still unfilled per the README.

**What should be preserved:** the entire public site as-is — content, visual direction, the Three.js scenes, the contact form pattern (honest-failure behavior is worth keeping as a model for the rest of the system: never claim success without evidence). The Tailwind build step and its root-only content glob.

**What should be refactored:** nothing yet — there's no backend or agent code to refactor. The only near-term structural change is *where new things live* relative to the existing files (see Target Architecture).

**What should be replaced:** nothing in the public site. The gap isn't bad code, it's *absence* — there was no orchestration layer, no agent framework, no data model, no persistence, at all.

**What's weak architecturally:** there was no architecture to be weak yet, which is actually the simplest possible starting point — no legacy decisions to unwind.

**What can be implemented immediately vs. deferred:** covered in the Implementation Roadmap (Section I). Short version: scaffolding, data model, and 2-3 real agents first; the full 23-agent roster, tool integrations, evaluation harness, and cost/observability tooling come later, gated on the earlier phases actually working.

---

## B. Target Architecture

Two systems in one repo, cleanly separated, deployed independently:

```
/                         Public marketing site — UNCHANGED, stays static, stays on its current host
/app/                     Agency OS — the internal multi-agent platform (Next.js + TypeScript)
  src/app/                 routes: dashboard, projects, agents, tasks, artifacts,
                            approvals, knowledge, clients, infrastructure, costs, settings
  src/lib/orchestrator/    the CTO/Orchestrator agent's planning + dispatch logic
  src/lib/model-router.ts  provider-agnostic model routing (Section 36)
  src/lib/db/              Prisma schema + client
  src/lib/agents/          runtime that loads /agents/*/agent.md and executes an agent turn
/agents/                   Agent definitions — portable markdown, not tied to any framework
  orchestrator/agent.md
  product-manager/agent.md
  ...  (one folder per agent, Section C)
/projects/{project-id}/    Shared project knowledge — git-tracked, human-readable artifacts
  project.md  requirements.md  decisions/  research/  design/
  architecture/  implementation/  testing/  deployment/  documentation/  client/  reports/
```

Why this split, concretely:
- The public site keeps deploying exactly how it does today. Nothing in `/app` touches that pipeline. Tailwind's `content` glob stays root-scoped so `/app`'s own styling never leaks into the public bundle.
- `/app` is a **separate deploy target**, gated behind auth, never linked from public nav — satisfying the doc's "don't turn the public site into an ugly internal dashboard" requirement.
- `/agents` is plain markdown, not application code. This is the "skill architecture" from Section 21 — each `agent.md` has mission, expertise, inputs, outputs, tools, constraints, decision rules, quality criteria, escalation rules. It's readable/editable without touching the app, and it's what makes agents *reviewable* by a human before they're ever run.
- `/projects/{id}` is where artifacts actually live, as files, not as database blobs. This gets you **versioning for free** (Section 39) via git history, keeps artifacts human-readable and diffable, and matches Section 22's exact spec. The database only stores metadata and pointers (see Data Model) — it doesn't duplicate document content.

---

## C. Agent Architecture

25 agents total (the source spec's 23-folder example list in its Section 21 compressed two roles — Content Strategist and Technical Content Writer — into one `/content` folder; this table keeps them distinct per the spec's own Section 6 detail, which is why the total here is 25, not 23). Each becomes an `/agents/<slug>/agent.md`. Table below is the condensed mission/output/review map — full agent.md files (with constraints, decision rules, escalation rules) are written during Phase 4.

| Agent | Mission | Key outputs | Reviewed by |
|---|---|---|---|
| Orchestrator (CTO) | Break objective into workstreams, assign agents, enforce gates, never blindly trust output | Execution plan, task assignments, gate decisions | Human (owner) |
| Product Manager | Discovery, requirements, MVP scope | PRD, personas, journeys, acceptance criteria | Business Analyst, Orchestrator |
| Business Analyst | Turn vague asks into precise requirements | Requirements spec, process diagrams, open questions | Product Manager, Orchestrator |
| Market Research | Competitor/market/pricing/tech landscape research | Research report (fact vs. inference vs. assumption, sourced) | Orchestrator |
| Brand Strategist | Positioning, voice, differentiation | Brand positioning doc, messaging framework | Creative Director |
| Senior Content Strategist | IA, messaging hierarchy, conversion copy strategy | Content strategy doc | Brand, SEO |
| Technical Content Writer | Docs, case studies, blogs — technically accurate only | Written content (no invented stats/customers) | Content Strategist, SEO |
| SEO Specialist | Keyword/technical/on-page SEO | SEO recommendations, metadata, sitemap changes | Content, Performance |
| Creative Director | Overall visual direction, brand consistency | Visual direction doc | Orchestrator |
| Senior UX Designer | Research, IA, flows, accessibility | Sitemap, user flows, wireframes, UX spec | UI, QA |
| Senior UI Designer | Visual system, typography, components, states | Design spec (system, not one-offs) | Creative Director, Design System Eng |
| Design System Engineer | Tokens, components as reusable code | Implemented design system | UI, Frontend |
| Principal Architect | System architecture, ADRs, tech selection | ADRs, architecture diagrams, dependency maps | Security, Orchestrator |
| Frontend Engineer | React/Next.js/TS implementation | Components, pages (with error/loading/empty/mobile states) | UI, UX, QA |
| Backend Engineer | API design, auth, background jobs | API spec, implementation | Architect, Security, QA |
| Database Engineer | Schema, indexing, migrations | ER diagram, schema, migrations | Backend, Architect |
| AI/ML Engineer | LLM apps, RAG, agentic workflows, eval strategy | Model architecture, prompts, tool defs, eval plan | Security, QA |
| DevOps/Cloud Engineer | CI/CD, infra, cost-classified recommendations | Deployment plan (each infra item tagged FREE/LOW/MED/HIGH cost) | Security, SRE |
| Security Engineer | OWASP review before every production deploy | Security report | Orchestrator |
| QA Engineer | Real test strategy, not "run npm test" | Test plan, bugs w/ repro steps, release recommendation | Orchestrator |
| Performance Engineer | Core Web Vitals, low-end device targets | Performance report | QA |
| SRE/Observability | Monitoring plan, alert thresholds, runbooks | Monitoring plan, incident runbook | DevOps |
| Legal/Compliance | Flag areas needing real legal review (never gives legal advice) | Compliance flags, clearly labeled "not legal advice" | Orchestrator |
| Client Communication | Client-facing updates/proposals/reports | Client messages (never promises without project-state evidence) | Orchestrator |
| Finance/Estimation | Effort/infra/AI-cost estimates, margin modeling | Estimates (assumptions explicitly marked) | Orchestrator |

## D. Agent Dependency Graph

```
CLIENT
  │
INTAKE  ──────────────────────────────────────────────┐
  │                                                    │
ORCHESTRATOR (breaks work into workstreams)            │
  │                                                    │
  ├─▶ DISCOVERY:  Product Manager ↔ Business Analyst ↔ Market Research
  │        │
  │        ▼  (PRD, requirements)
  ├─▶ BRAND/CONTENT:  Brand Strategist → Content Strategist → Technical Writer → SEO
  │        │                                    ▲
  │        ▼                                    │  (reviewed by Content+SEO+Brand)
  ├─▶ DESIGN:  Creative Director → UX Designer → UI Designer → Design System Engineer
  │        │
  │        ▼  (UX spec, design spec, design system)
  ├─▶ ARCHITECTURE:  Principal Architect  (reviewed by Security)
  │        │
  │        ▼  (ADRs, API contracts, schema requirements)
  ├─▶ IMPLEMENTATION:  Frontend ↔ Backend ↔ Database ↔ AI/ML
  │        │                (Frontend reviewed by UI+UX+QA; Backend by Architect+Security+QA;
  │        │                 Database by Backend+Architect; AI system by AI/ML+Security+QA)
  │        ▼
  ├─▶ REVIEW/QA:  QA Engineer ↔ Security Engineer ↔ Performance Engineer
  │        │
  │        ▼  (test report, security report, perf report)
  ├─▶ DEPLOYMENT:  DevOps Engineer  (reviewed by Security+SRE)
  │        │
  │        ▼
  ├─▶ MONITORING:  SRE/Observability Agent
  │        │
  │        ▼
  └─▶ ITERATION  ──────────────────────────────────────┘  (feeds back to Orchestrator)

Cross-cutting, consulted as needed (not sequential):
  Legal/Compliance · Client Communication · Finance/Estimation
```

The Orchestrator sits at every handoff — it does not just route messages, it reviews outputs and can reject/escalate ("insufficient information," "architecture conflict," "QA insufficient," etc.).

---

## E. Data Model

Metadata lives in the DB; document *content* lives in `/projects/{id}/...` files. Core entities (Prisma-style field summary, not final schema):

- **Project**: id, name, clientId, stage (see state machine), createdAt, updatedAt, artifactsPath
- **Client**: id, name, contact info, projects[]
- **Task**: id, title, description, projectId, ownerAgent, status (`BACKLOG|READY|IN_PROGRESS|BLOCKED|REVIEW|APPROVED|DONE`), priority, dependencies[], estimate, actual, blockers[], artifacts[], createdAt, updatedAt
- **Agent**: id, slug (matches `/agents/<slug>`), role, permissions (see Permission Model), status
- **Artifact**: id, projectId, taskId?, type (PRD, ADR, spec, report...), filePath (points into `/projects/{id}/...`), version, createdBy (agentId), createdAt — content is NOT duplicated in the DB
- **Approval**: id, projectId, gate (`REQUIREMENTS|DESIGN|ARCHITECTURE|IMPLEMENTATION|QA|PRODUCTION` — matches Section H's six Quality Gates exactly; an earlier draft of this doc had 5 values here that didn't line up with Section H, fixed in Phase 6), status (`PENDING|APPROVED|REJECTED`), requestedBy, decidedBy, decidedAt
- **Event**: id, projectId, agentId, taskId?, message, timestamp — the persistent activity log
- **Knowledge**: id, scope (`GLOBAL|PROJECT|AGENT`), title, content/pointer, tags
- **Evaluation**: id, agentId, testCase, expectedOutcome, actualOutcome, passed, runAt
- **Deployment**: id, projectId, environment, status, deployedAt, rollbackPlan, artifactId (link to deployment plan)

Every agent output also carries handoff metadata (`PROJECT, TASK, AGENT, STATUS, CONFIDENCE, ASSUMPTIONS, INPUTS, OUTPUTS, DECISIONS, RISKS, OPEN QUESTIONS, NEXT AGENT, REVIEW REQUIRED`) — stored as frontmatter on the artifact file itself, not a separate table, so the artifact is self-describing.

---

## F. Permission Model

Least privilege, per agent, independent flags: `READ | WRITE | EXECUTE | DEPLOY | DELETE`. Representative examples (full matrix defined per-agent in Phase 4):

| Agent | Tools/scope |
|---|---|
| Content/Research agents | Web research, read project files — no write to code, no deploy |
| Frontend/Backend/Database Engineers | Filesystem (project workspace only), terminal, test runner, package manager — no deploy |
| DevOps Engineer | Deployment tools, infra config — deploy requires human approval gate |
| Security Engineer | Read-only across the project + dependency scanning tools |
| Finance Agent | Cost data only |
| Orchestrator | Read everything, write task/approval state, cannot itself deploy or delete |

Hard rule: nothing ever deploys destructive infra changes, exposes secrets, deletes production data, sends client-facing communications, or incurs significant external cost without an explicit human approval gate.

---

## G. Project Lifecycle (Workflow State Machine)

```
LEAD → DISCOVERY → REQUIREMENTS → ESTIMATION → PROPOSAL → APPROVED → PLANNING →
DESIGN → ARCHITECTURE → IMPLEMENTATION → QA → SECURITY REVIEW → DEPLOYMENT →
MONITORING → MAINTENANCE
```

Each stage has entry/exit criteria; the six quality gates (Section H) map onto the stage transitions that actually matter (Requirements→Planning, Design→Architecture, Architecture→Implementation, Implementation→QA, QA→Security Review, Security Review→Deployment).

## H. Quality Gates

| Gate | Must have before passing |
|---|---|
| 1 — Requirements | Clear problem, target users, scope, acceptance criteria, assumptions |
| 2 — Design | UX flow, responsive behavior, component system, accessibility requirements |
| 3 — Architecture | Architecture, data model, API design, security considerations, deployment strategy |
| 4 — Implementation | Tests, error handling, documentation, code review |
| 5 — QA | Functional, responsive, accessibility, regression testing |
| 6 — Production | Security review, deployment plan, monitoring, rollback plan, backup strategy where relevant |

---

## I. Implementation Roadmap

- **Phase 0 — Repository audit** — ✅ done (this document).
- **Phase 1 — Foundational architecture** — ✅ done (PR #1). `/app` (Next.js + TS), `/agents`, `/projects` scaffolded; public site untouched.
- **Phase 2 — Agent framework** — ✅ done (PR #2). `runAgent()` proven against Product Manager, using a mock provider — no live model has ever actually been called (no API credits in this environment; see app/README.md).
- **Phase 3 — Project/task/artifact system** — ✅ done (PR #3). Prisma/SQLite, the Projects/Tasks/Artifacts dashboard, the Approvals UI.
- **Phase 4 — Core agents** — ✅ done (PR #4). All 25 agents (not 23 — see Section C's note) written, each structurally validated against the real `loadAgent()` runtime. None run against a live model yet.
- **Phase 5 — Agent orchestration** — ✅ done (PR #5). `dispatchTask()` wires Phases 2–4 together; doesn't yet decide which agent a task goes to, and doesn't enforce gates (that's Phase 6).
- **Phase 6 — Quality gates** — ✅ done (PR #6). `advanceProjectStage()` enforces the six gates against real `Approval` records; found and fixed a drift between this section's gate names and the Data Model's `Approval.gate` enum along the way.
- **Phase 7 — Tool integrations** — ✅ done (PR #7). Scoped filesystem read/list/write + a fixed test-runner tool. Deliberately no deploy tool, git-write tool, or arbitrary-command tool — enforced by absence, backed by a standing test.
- **Phase 8 — AI evaluation** — ✅ done (PR #8). Real eval cases matching this section's named examples; checkers are structural/keyword heuristics, proven to actually discriminate via mock-provider fixtures — not a substitute for live-model evaluation.
- **Phase 9 — Production hardening** — ✅ done (PR #9). Real cost estimation (from actual token usage, never guessed), a project activity/cost summary utility, and secret redaction on every durable log write.
- **Phase 10 — Public website refinement** — ⛔ blocked. This phase is explicitly gated on the Design System Engineer agent identifying real improvements — which requires an actual live run of that agent against the current site, and this environment has no Anthropic API credits (the same limitation Phases 2 and 8 hit). Per this section's own rule — "not a redesign for its own sake" — nobody should freelance UI changes here standing in for what's supposed to be the agent's own, reviewable recommendation. Unblocks once a live API key with credits is available: run `design-system-engineer` (Phase 4) against the real site content, get its structured, versioned recommendation as a normal artifact, then route it through the Phase 6 gates like any other agent output.

Each phase shipped independently: inspect current state → implement → test → verify build → review architecture/security → update docs → report exactly what changed → identify remaining work. No phase claimed done without verification — see each PR's description for the specific verification performed.

---

## J. Risk Register

| Risk | Mitigation |
|---|---|
| Scope creep — a 23-agent platform before a single client project exists | Phased roadmap above; Phase 1-3 prove the pattern on one agent before building 22 more |
| Agent hallucination in client-facing deliverables | Confidence system + mandatory human approval gates on anything client-facing |
| Uncontrolled agent-loop cost | Cost estimates per task from Phase 9 onward; until then, keep usage manual/supervised |
| Solo founder = single point of failure, no backup reviewer | Orchestrator + QA + Security are designed to *disagree* with other agents, not rubber-stamp — partial substitute, not a full mitigation |
| Storing client data in git-tracked markdown | `/projects/{id}` must live in a **private** repo or private storage — do not reuse this public repo for real client artifacts |
| Vendor lock-in to one model provider | Model routing abstraction from Phase 2 — never hardcode a provider inside agent logic |
| Premature infra spend | Every DevOps recommendation cost-tagged (FREE/LOW/MED/HIGH); start on SQLite + single deploy target, not managed Postgres/queues/K8s |

---

## K. Technology Decisions

| Decision | Why | Alternatives considered | Tradeoff | Cost | When to scale |
|---|---|---|---|---|---|
| Next.js + TypeScript for `/app` | Needs server routes for orchestration + auth-gated internal pages; one deploy target instead of separate API+SPA | Plain Node/Express API + separate SPA | More moving parts for no current benefit | Free (self-hosted) / free-tier Vercel | If Agency OS needs to scale beyond one deploy target's limits |
| SQLite + Prisma for persistence (Phase 3) | Zero infra, zero signup, single-founder scale, trivial backup (one file) | Supabase/managed Postgres now | Won't handle concurrent multi-user writes | Free | When a second person needs concurrent write access, or app moves off a single machine/needs remote access |
| File-based artifacts in `/projects/{id}` (git-tracked) | Free versioning via git history, human-readable, diffable | Blob storage in DB | Requires a private repo for real client data | Free | If artifact volume/size makes git impractical — use object storage for those specifically |
| Model routing abstraction, not a hardcoded provider | Avoids lock-in | Hardcode a provider's API calls everywhere | Slightly more upfront structure | N/A (design cost only) | N/A — cheap to do early, expensive to retrofit |
| Public site stays on its current static host, unchanged | Zero risk to a working, deployed asset | Merge into the Next.js app as one deployment | Two deploy pipelines instead of one | Free (unchanged) | Only if there's a concrete reason to unify (there isn't one now) |
| Agent definitions as markdown (`agent.md`), not embedded in app code | Human-reviewable without touching app code; portable | Prompts embedded in TS files | Slightly more indirection to load at runtime | N/A | N/A |

---

## Verification

- Phase 1: `/app` builds and runs locally; root site's `npm run build:css` still works unmodified; `/app` deploy target is separate from the public site's.
- Phase 2: one agent (Product Manager) takes a sample client brief and produces a PRD artifact file with correct handoff metadata frontmatter — inspected by hand.
- Phase 3: Prisma schema migrates cleanly on a fresh SQLite file; dashboard shows a seeded project/task/artifact.
- Every later phase: inspect → implement → test → verify build → review architecture/security → update docs → update project state → report what changed → identify remaining work. No phase is marked done without this.
