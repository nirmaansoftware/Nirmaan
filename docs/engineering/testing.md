# Testing strategy

```text
Static checks (tsc, eslint) → unit → integration (real SQLite) → E2E (browser) → security → performance → production smoke
```

## Nirmaan OS today · IMPLEMENTED

- `npm test` in `/os`: **173 tests** (107 original, 43 Phase 1, 7 Phase 2, 7 Phase 3, 5 Phase 4, 4 Phase 5),
  about 2 seconds. They cover auth, RBAC matrix invariants, sessions, IDs under
  concurrency, intake validation, the discovery promotion rule, proposal
  lifecycle (including two simultaneous approvals creating exactly one
  project), change-request rules, traceability gaps, stage/gate enforcement,
  client progress, rate limiting and team management.
- Tests use the developer's `dev.db` with fixtures that clean up every row
  they create (verified by row counts after a run).
- `npm run typecheck`, `npx eslint src scripts prisma` and `npx next build`
  must pass.
- E2E: a scripted headless-Chrome walkthrough (sign-in, discovery, proposal
  send, client approval, project creation, gate refusal) was run for this
  phase. Committing it as a repeatable Playwright suite is **PLANNED**.

## Client projects · IMPLEMENTED (as policy and data model)

- Acceptance criteria are written on each requirement (REQ-###).
- Tests are linked to what they verify (REQ/FEAT/TASK → TEST).
- **Evidence** is recorded per run: passed/total, summary, link. A run is PASS
  only if passed = total, whatever the summary says.
- The project page shows, per requirement, what's still unproven. The QA gate
  should not be approved while MUST requirements have gaps.
- Evidence from CI is **IMPLEMENTED** (Phase 2): issue a project CI token on the
  project page, store it as a CI secret, and post results:

  ```bash
  curl -X POST https://<os-host>/api/ci/evidence \
    -H "Authorization: Bearer $NIRMAAN_CI_TOKEN" -H "Content-Type: application/json" \
    -d '{"run":{"id":"'"$GITHUB_RUN_ID"'","url":"<run url>"},
         "results":[{"code":"TEST-031","passed":14,"total":14,"summary":"unit suite"}]}'
  ```

  Name tests after their TEST- code so the mapping is mechanical.
