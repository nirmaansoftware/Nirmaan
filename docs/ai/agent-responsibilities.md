# Agent responsibility matrix

The operating model's core roles mapped to the existing specs (full detail in
each `agents/<slug>/agent.md`). "R" = responsible, "A" = the human who approves.

| Operating-model role | Agent spec(s) | Produces | Human gate (A) |
|---|---|---|---|
| Business Analyst | `business-analyst` (discovery mode), `market-research` | Discovery items; requirement drafts | REQUIREMENTS (founder/CTO) |
| Product Manager | `product-manager` | PRD, prioritization, scope | PLAN |
| Solution Architect | `principal-architect` | ADRs, build vs buy, simplest safe architecture | ARCHITECTURE |
| UX/UI Designer | `ux-designer`, `ui-designer`, `creative-director`, `design-system-engineer` | Flows, UI spec (including motion), components | DESIGN |
| Frontend Engineer | `frontend-engineer` | UI implementation, including motion | IMPLEMENTATION |
| Backend Engineer | `backend-engineer` | APIs, business logic | IMPLEMENTATION |
| Database Engineer | `database-engineer` | Schema, migrations | ARCHITECTURE / IMPLEMENTATION |
| AI/ML Engineer | `ai-ml-engineer` | AI features, evals | ARCHITECTURE / QA |
| DevOps Engineer | `devops-engineer`, `sre` | Pipeline, deploy plan, monitoring | PRODUCTION |
| QA Engineer | `qa-engineer`, `performance-engineer` | Test plan, evidence | QA |
| Security Engineer | `security-engineer`, `legal-compliance` (flags only) | Security report | PRODUCTION |
| Technical Writer | `technical-writer` | Docs, handover guide | HANDOVER |
| Content Specialist | `content-strategist`, `brand-strategist`, `seo-specialist` | Content | DESIGN |
| Support Agent | `client-communication` (drafts only) | Client update drafts, support triage | Human sends; agents never send client messages |
| Estimation | `finance-estimation` | Effort and cost estimate inputs | Proposal send (`proposal:send`) |

Unassigned by design: no agent can approve a gate, send a client
communication, change a price, or deploy.
