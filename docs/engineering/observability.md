# Observability

| Signal | Status |
|---|---|
| Audit log of human and client actions | IMPLEMENTED (`/os/audit`) |
| Per-project activity feed (Event) | IMPLEMENTED |
| AI call ledger: model, tokens, cost, latency, success | IMPLEMENTED for discovery (`/os/ai`) |
| Founder exceptions: stale leads, unanswered proposals, old approvals, blocked tasks | IMPLEMENTED (Today screen) |
| Public site live after each push to `main` (key pages 200, missing page 404) | IMPLEMENTED (`site-smoke` workflow); not a continuous uptime check |
| App errors and uptime for the deployed OS | PLANNED: the host's logs plus a free uptime check; no paid APM until there's a reason |
| Client-project monitoring (uptime, errors, Web Vitals) | PLANNED, per maintenance plan |
