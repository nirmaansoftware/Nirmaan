# Model routing · IMPLEMENTED (per task type + complexity nudge) / PLANNED (criticality)

`src/lib/ai/router.ts` maps task types to models:

| Task type | Used for | Default tier |
|---|---|---|
| classification | cheap triage | Haiku |
| requirements, content, research, code | most agent work, including discovery | Sonnet |
| architecture | architecture, security, orchestration decisions | Opus |

Plus `complexityHeuristic.ts` nudges one tier up or down per task from its
text (free, no extra model call), logged when it fires.

**IMPLEMENTED (Phase 2), criticality routing:** `CRITICAL_AGENTS` (orchestrator,
principal-architect, security-engineer, devops-engineer, sre) are never
down-tiered by the complexity heuristic, and every run creates a mandatory
human review task. **PLANNED:** pinning low-risk bulk work to the cheapest tier.
Overrides per task type via `AGENCY_OS_MODEL_<TYPE>_PROVIDER/_ID` env vars.
