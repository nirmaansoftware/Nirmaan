# Client handover · PLANNED (process defined; the HANDOVER gate is IMPLEMENTED)

Before requesting the HANDOVER gate:

1. Production deployment recorded (DEPLOY-###) with a rollback plan, and every
   MUST requirement shows a passing test in the traceability view.
2. Client has reviewed the staging or production system and accepted it in writing.
3. Handed over: source code repository access, database export or access,
   admin credentials (rotated, via a password manager share, never by email),
   domain/DNS/hosting ownership, and a short operating guide.
4. Data: a fresh export of the client's data restored into a clean database,
   with row counts matching, recorded as evidence.
5. Accounts: registrar, host and repository are in the client's name, with
   Nirmaan as a collaborator. Nirmaan's own access is removed and keys are
   rotated once the client takes over; both are logged.
6. AI features: for each AI feature built for the client, the eval results
   are recorded (cases, pass rate, known failure modes, the fallback, and the
   date). They are evidence at that date, not a promise about future output.
7. Maintenance plan offered if, and only if, there's real ongoing work.
8. Post-mortem scheduled (Phase 4 captures it in the OS).

After acceptance, and in a separate message so it never reads as a condition
of acceptance, ask for: consent to name the client and show the work, a
review, and an introduction to someone who might need us. A client is named
or shown only with written consent.

Steps 4 to 6 and the separate ask were added on 2026-10-18 (the
[market learnings decisions](../strategy/market-learnings-decisions.md)).

The client owns the code and deliverables once paid in full (stated publicly
in the Process FAQ).
