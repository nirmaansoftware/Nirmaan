# Engineering (lead: principal-architect; members frontend-engineer, backend-engineer, database-engineer, ai-ml-engineer)

FAIL when: a claim is not backed by code; behaviour changes without a test;
lockfile drift or a new dependency without a reason; an action not pinned by
commit SHA; the OS deploy or worker is turned on; new spending; a schema, auth
or boundary change without an ADR; next build missing from CI. Website:
no-JS and reduced-motion paths complete, docs/engineering/list.md items named.
database-engineer (os/prisma/**): a new migration matches schema.prisma (no
drift), destructive SQL flagged with a rollback note, seed still runs, new
indexes cite a query, no document content in the database, dev.db never in a
diff. backend-engineer: each new route or worker covers failure, idempotency,
concurrency, validation, abuse and server-side auth.
