# Maintenance · PLANNED (Phase 3 tracks plans and renewals)

A maintenance plan covers real, recurring work only:

| Included when relevant | Not included (quoted separately) |
|---|---|
| Hosting and backups (with a tested restore) | New features |
| Security and dependency updates | Redesigns |
| Uptime and error monitoring | Work on systems we didn't build, without an audit |
| Small changes, up to the plan's hours | |
| AI/API usage oversight for AI features | |

Incident handling: acknowledge within the plan's published response time
(`website/src/_data/pricing.json`), communicate plainly, record the incident
and its fix, and add a regression test.

Rules added on 2026-10-18 (the [market learnings decisions](../strategy/market-learnings-decisions.md)):

- **Care readiness gate.** No plan starts, and none is invoiced, until that
  system has a monitor, an alert route, a runbook (rollback and restore steps)
  and a restore drill on record. Monitoring for client systems is still
  PLANNED ([observability.md](../engineering/observability.md)), so this gate
  is what keeps the published plan promises true.
- **One change at a time.** Changes inside a plan's hours are worked one at a
  time, in the order agreed with the client.
- **Systems we did not build** start with a fixed-price, read-only assessment.
  Nothing is changed in production before it.
- **Client-owned accounts.** Client production lives in accounts in the
  client's name (registrar, host, repository), with Nirmaan as a collaborator,
  so a handover on cancellation is always possible.
