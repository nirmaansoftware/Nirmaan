# Nirmaan documentation

> **You bring the problem. We build the system.**

The operating manual for Nirmaan: what the company is, how work flows from a
customer's problem to a maintained system, and how the software behind it
(the Nirmaan OS in `/app`) is built.

**This repository is public.** These documents describe models, formulas and
policies. They never contain real prices, margins, costs, client data or
credentials; those live only in the Nirmaan OS database. See
`strategy/risks.md` for the recommendation to make the repository private.

## Status labels

Every document, and every capability inside one, is marked:

| Label | Meaning |
|---|---|
| **IMPLEMENTED** | Built, tested and merged. You can use it today. |
| **PLANNED** | Designed and committed to, not built yet. |
| **PROPOSED** | A recommendation that still needs a founder decision. |
| **EXPERIMENTAL** | Built, but not trusted for real client work yet. |

## Map

| Area | Documents |
|---|---|
| Start here | [assessment/current-state.md](assessment/current-state.md) · [strategy/roadmap.md](strategy/roadmap.md) |
| Company | [vision](company/vision.md) · [mission](company/mission.md) · [positioning](company/positioning.md) · [business model](company/business-model.md) · [ideal customer](company/ideal-customer-profile.md) · [principles](company/principles.md) |
| Operations | [lead to project](operations/lead-to-project.md) · [project lifecycle](operations/project-lifecycle.md) · [change requests](operations/change-requests.md) · [client handover](operations/client-handover.md) · [maintenance](operations/maintenance.md) |
| Finance | [pricing principles](finance/pricing-principles.md) · [project economics](finance/project-economics.md) · [margin model](finance/margin-model.md) · [recurring revenue](finance/recurring-revenue.md) · [cost governance](finance/cost-governance.md) |
| Engineering | [architecture](engineering/architecture.md) · [data model](engineering/data-model.md) · [coding standards](engineering/coding-standards.md) · [testing](engineering/testing.md) · [security](engineering/security.md) · [deployment](engineering/deployment.md) · [observability](engineering/observability.md) · [motion](engineering/motion.md) · [procurement](engineering/procurement.md) · [definition of done](engineering/definition-of-done.md) |
| AI | [agent architecture](ai/agent-architecture.md) · [agent responsibilities](ai/agent-responsibilities.md) · [orchestration](ai/orchestration.md) · [model routing](ai/model-routing.md) · [evaluation](ai/evaluation.md) · [AI cost governance](ai/ai-cost-governance.md) |
| Product | [portal architecture](product/portal-architecture.md) · [knowledge graph](product/project-knowledge-graph.md) · [client portal](product/client-portal.md) · [internal OS](product/internal-os.md) · [prospecting](product/prospecting.md) |
| Strategy | [moat](strategy/moat.md) · [productization](strategy/productization.md) · [reusable IP](strategy/reusable-ip.md) · [roadmap](strategy/roadmap.md) · [risks](strategy/risks.md) |
| History | [architecture-plan.md](architecture-plan.md): the original Agency OS plan (phases 0–9), kept as a record |

## Where the 20 required planning artifacts live

| # | Artifact | Document |
|---|---|---|
| 1 | Current-state audit | assessment/current-state.md |
| 2 | Target architecture | engineering/architecture.md |
| 3 | Information architecture | product/portal-architecture.md |
| 4 | Data model | engineering/data-model.md |
| 5 | Role / permission model | engineering/security.md |
| 6 | Agent architecture | ai/agent-architecture.md |
| 7 | Agent responsibility matrix | ai/agent-responsibilities.md |
| 8 | Project lifecycle | operations/project-lifecycle.md |
| 9 | Customer lifecycle | operations/lead-to-project.md |
| 10 | Financial model | finance/project-economics.md, finance/margin-model.md |
| 11 | AI cost model | ai/ai-cost-governance.md |
| 12 | Reusable IP strategy | strategy/reusable-ip.md |
| 13 | Security architecture | engineering/security.md |
| 14 | Testing strategy | engineering/testing.md |
| 15 | Deployment strategy | engineering/deployment.md |
| 16 | Documentation structure | this file |
| 17 | Phased roadmap | strategy/roadmap.md |
| 18 | Risks and mitigations | strategy/risks.md |
| 19 | Technology procurement | engineering/procurement.md |
| 20 | Definition of done | engineering/definition-of-done.md |
