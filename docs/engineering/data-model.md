# Data model · IMPLEMENTED (Prisma schema: `os/prisma/schema.prisma`)

```text
Client ─┬─ Lead ─┬─ DiscoveryItem (FACT|ASSUMPTION|QUESTION|RECOMMENDATION) ──promotes──► Requirement
        │        ├─ LeadNote
        │        ├─ Requirement (REQ-###) ─────────────────────────────┐ moves to project on approval
        │        └─ Proposal (PROP-###) ──approved──► Project (PRJ-###) │
        └────────────────────────────────────────────► Project ◄───────┘
                                                        ├─ Feature (FEAT-###)
                                                        ├─ Task (TASK-###)
                                                        ├─ TestCase (TEST-###) ── Evidence
                                                        ├─ Deployment (DEPLOY-###)
                                                        ├─ ChangeRequest (CR-###)
                                                        ├─ Approval (9 gates) · Event · Artifact
                                                        └─ TraceLink (REQ→FEAT→TASK→TEST→DEPLOY)
User ── Session            AuditLog (who did what, everywhere)      AiUsage (every model call)
Counter (atomic id sequences)
```

Conventions:

- **Money** is whole rupees (Int). Allowed values for status columns live in
  `src/lib/db/enums.ts` (SQLite has no enums).
- **Human-readable IDs** come from `Counter`, incremented atomically. IDs are
  never reused (re-seeding keeps the counters).
- **Secrets are stored hashed:** session tokens, proposal links and status links
  (SHA-256), and passwords (scrypt).
- **Internal economics** live on `Proposal` (`est*` columns) and are only
  rendered for `economics:read`. The client component can't receive them by
  construction.
- **Artifacts:** content lives on disk under `/projects/{path}`; the database
  holds pointers.

Migrations: `os/prisma/migrations/`. Phase 1's migration only adds tables
and nullable columns, so existing data and the original tests are untouched.
