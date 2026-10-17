# Target architecture

```text
                  nirmaan.online (static, Vercel)            Nirmaan OS (/os, Next.js 16)
                  ───────────────────────────────            ─────────────────────────────
 Visitor ──► Eleventy pages ──"Tell us your problem"──► Web3Forms ──► email to Nirmaan
                                                              │  (OS POST /api/intake → Lead exists, unused by the site)
                                                              │
 Team ─────────────────────────────────────────────────► /os/* (sessions + RBAC)
                                                              │  services (src/lib/*) ── Prisma ── SQLite
                                                              │  agents (/agents/*.md) ── model router ── claude CLI / API
 Client ──── private links ───────────────────────────► /p/<token>  /status/<token>
```

The OS is **paused** (since 2026-10-18; see the last decision below and
[deployment](deployment.md#pause-and-un-pause)). The diagram shows the design it
returns to. The website's enquiry form sends through Web3Forms by email and does
not depend on the OS; the OS intake endpoint exists but the site is not pointed at it.

## Decisions

| Decision | Why | Revisit when |
|---|---|---|
| One Next.js app for the internal OS **and** the client pages | Same data, one deploy, and no data-sync layer. The experiences are separated by routes, layout and permissions, not by servers. | Client usage grows to need its own scaling or domain |
| Public site stays static and separate | Fast, cheap, SEO-friendly, zero risk from app deploys | Never, unless there's a concrete reason |
| Service layer in `src/lib/<domain>/service.ts` | Business rules live in one place, tested without a browser. Pages and actions are thin. | — |
| Every service takes an `Actor` | Permission checks and audit attribution never depend on where the call came from | — |
| SQLite + Prisma | Zero infrastructure at one-to-three internal users | A second concurrent writer on another machine, or hosting on a platform without persistent disk → Postgres (the schema is portable; enums are app-level strings) |
| Capability links for clients (Phase 1) | Clients act on one object without account friction; the tokens are 256-bit and stored hashed | Clients need ongoing access to several things (deliverables, support) → client accounts (Phase 4) |
| Agents as markdown specs | Human-reviewable, versioned in git, portable across model providers | — |
| OS paused (decided 2026-10-17, stopped 2026-10-18): data backed up and restore-checked, machine stopped with automatic start off, machine and data volume kept, no deploy from CI | It was only used on Nirmaan itself and was found running an outdated build; stopping it removes the exposure, and keeping the stopped machine and volume is the smallest reversible change ([decision record](../operations/2026-10-17-inspection-decisions.md)). Not chosen: scaling to zero (discards the machine's configuration; a later deploy would create a fresh machine) | Every item of the [un-pause checklist](deployment.md#pause-and-un-pause) is done and the founder approves |

## What deliberately doesn't exist

No microservices, queues, event bus, Kubernetes, second database, paid
observability, or UI component library. Each would add cost and moving parts
with no current problem to solve (`engineering/procurement.md`).

## Layers inside `/os`

```text
src/app/          routes: /os (internal), /p & /status (client), /api/intake (public), /login
src/app/os/actions/  server actions: resolve actor → call service → revalidate → plain-language result
src/lib/<domain>/    leads, discovery, proposals, projects, changes, trace, dashboard, team, ai
src/lib/auth/        password, tokens, sessions, permissions, actor
src/lib/             ids, audit, orchestrator, agents, providers, model-router, costs, security, evaluation
```
