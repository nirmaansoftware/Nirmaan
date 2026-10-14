# Target architecture

```text
                  nirmaan.online (static, Vercel)            Nirmaan OS (/os, Next.js 16)
                  ───────────────────────────────            ─────────────────────────────
 Visitor ──► Eleventy pages ──"Tell us your problem"──► POST /api/intake ──► Lead (LEAD-###)
                                                              │
 Team ─────────────────────────────────────────────────► /os/* (sessions + RBAC)
                                                              │  services (src/lib/*) ── Prisma ── SQLite
                                                              │  agents (/agents/*.md) ── model router ── claude CLI / API
 Client ──── private links ───────────────────────────► /p/<token>  /status/<token>
```

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
