# Agents

Each subdirectory is one Agency OS agent, defined as plain markdown rather than embedded in application code. This keeps agents human-reviewable and portable — see the architecture plan for the full rationale.

Every `agent.md` follows the same structure:

- **Mission** — one sentence, what this agent exists to do
- **Expertise** — what it knows
- **Responsibilities** — what it's on the hook for
- **Inputs** — what it needs to start work, and from where
- **Outputs** — what artifact(s) it produces, and where they're written (`/projects/{id}/...`)
- **Tools** — what it's allowed to touch (filesystem, web research, terminal, etc.) — least privilege
- **Constraints** — hard rules it must never break
- **Decision rules** — how it resolves ambiguity on its own vs. when it must ask
- **Quality criteria** — what "done well" looks like for this agent's output
- **Escalation rules** — when it must stop and hand off to the Orchestrator or a human, and why

## Status

All 25 agents from the architecture plan's Agent Architecture table (Section C) exist as `agent.md` specs, and all load cleanly through the real Phase 2 runtime (`os/src/lib/agents/loadAgent.ts` — see `os/src/lib/agents/allAgentsLoad.test.ts`):

- **Orchestrator** — [`orchestrator/`](orchestrator/agent.md)
- **Discovery**: [`product-manager/`](product-manager/agent.md), [`business-analyst/`](business-analyst/agent.md), [`market-research/`](market-research/agent.md)
- **Brand/Content**: [`brand-strategist/`](brand-strategist/agent.md), [`content-strategist/`](content-strategist/agent.md), [`technical-writer/`](technical-writer/agent.md), [`seo-specialist/`](seo-specialist/agent.md)
- **Design**: [`creative-director/`](creative-director/agent.md), [`ux-designer/`](ux-designer/agent.md), [`ui-designer/`](ui-designer/agent.md), [`design-system-engineer/`](design-system-engineer/agent.md)
- **Engineering**: [`principal-architect/`](principal-architect/agent.md), [`frontend-engineer/`](frontend-engineer/agent.md), [`backend-engineer/`](backend-engineer/agent.md), [`database-engineer/`](database-engineer/agent.md), [`ai-ml-engineer/`](ai-ml-engineer/agent.md)
- **Ops/Quality**: [`devops-engineer/`](devops-engineer/agent.md), [`security-engineer/`](security-engineer/agent.md), [`qa-engineer/`](qa-engineer/agent.md), [`performance-engineer/`](performance-engineer/agent.md), [`sre/`](sre/agent.md)
- **Cross-cutting**: [`legal-compliance/`](legal-compliance/agent.md), [`client-communication/`](client-communication/agent.md), [`finance-estimation/`](finance-estimation/agent.md)

**What this does NOT mean yet:** none of these agents have been run against a real or realistic input and had their output inspected — that only happened for Product Manager, in Phase 2, using a mock model response. Every agent here is a reviewed, structurally-valid *specification*; none has been exercised end-to-end against a live model. That's Phase 5+ work (orchestration) and Phase 8 (evaluation harness) — see `/docs/history/agency-os-plan.md`.

No production deploy/execute capability is live anywhere in this repo. A few agents (DevOps Engineer, Design System Engineer, AI/ML Engineer, Frontend/Backend/Database Engineers) declare `execute` or `deploy` permissions in their frontmatter — those describe what the agent *would* be authorized to do once the permission-enforcement runtime exists (Phase 7) and, for anything destructive or production-facing, once a human-approval-gate runtime exists (referenced throughout as a hard constraint, not yet built as code). Declaring a permission in `agent.md` is not the same as the platform actually granting or enforcing it today.
