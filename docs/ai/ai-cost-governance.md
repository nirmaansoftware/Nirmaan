# AI cost governance (AI cost model)

Every model call made through `callModel()` writes one `AiUsage` row:
**task, agent, provider, model, input/output tokens, cost, cost source, latency,
success/error, lead/project.**

Tokens include prompt-cache reads and writes (`cacheReadInputTokens`,
`cacheCreationInputTokens`) when the provider reports them, and null when it
does not. `inputTokens` counts uncached input only, so the total input of a
call is the sum of the three. `runAgent()` also returns `durationMs`, the
time of the model call alone.

Cost source, in order of trust:

1. `REPORTED` by the provider (the `claude` CLI reports the real cost).
2. `ESTIMATED` from real token counts × `costs/pricing.ts`.
3. `UNKNOWN`: stored as null. **Never guessed.**

| Capability | Status |
|---|---|
| Ledger plus `/os/ai` (by task, by model, recent calls, current routing) | IMPLEMENTED |
| AI cost on the Today screen (30 days) and per lead | IMPLEMENTED |
| Discovery metered | IMPLEMENTED |
| `dispatchTask`, architecture and planning runs metered in the same ledger | IMPLEMENTED (Phase 2) |
| Per-project AI budget with a stop at the cap | IMPLEMENTED (Phase 2): automated dispatch refuses to start without a budget and stops when spend reaches it |
| AI cost as a line in actual project economics | PLANNED (Phase 3) |
| Cache-read and cache-creation tokens on every ledger row, and `durationMs` on every agent run | IMPLEMENTED |
| Cache tokens in the pricing-table estimate and on `/os/ai` | PLANNED |

Rules: use the cheapest model that does the job; strong models for
architecture and security, always with human review; no automatic retry
loops without a cap (the CLI provider also enforces a per-call USD ceiling).
