# Coding standards · IMPLEMENTED (followed by Phase 1 code)

- **TypeScript, strict.** No `any` at boundaries; validate every external input
  (forms, JSON, model output) by hand or with a small parser, and reject
  rather than guess.
- **Business rules live in services** (`src/lib/<domain>`), each taking an
  `Actor` and calling `assertCan` first. Pages and actions stay thin.
- **Errors are for people:** say what went wrong and how to fix it. Internal
  details (IDs, stack traces, Prisma codes) never reach the UI.
- **Every mutation that matters is audited** (`os/src/lib/audit.ts`).
- **Honesty in code:** no fabricated numbers (cost `null` rather than a guess), no
  claims of success without evidence, no silent fallbacks.
- **Tests for every rule** that protects money, access or truth, including the
  "must fail" case.
- **Comments explain why**, not what. Keep the surrounding file's style.
- **No new dependency** without a line in the PR saying why the platform
  can't do it.
