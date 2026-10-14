# Nirmaan OS (os.nirmaan.online)

Nirmaan's internal operating system and client portal (formerly "Agency OS"). One
Next.js app, three audiences with different permissions:

- **Team** at `/os`: Today, leads and discovery, prospecting and campaigns,
  proposals, projects and traceability, approvals, finance, knowledge and the IP
  library, AI usage, audit log, team.
- **Clients** through private links: `/p/<token>` to review and approve a proposal,
  `/status/<token>` to follow progress.
- **The public website's intake** at `POST /api/intake`.

It runs on Fly.io as the app `nirmaan-os`; see [deployment](../docs/engineering/deployment.md).
This Next.js version has breaking changes: read [AGENTS.md](AGENTS.md) and the guides in
`node_modules/next/dist/docs/` before changing code.

Plans and decisions: [docs/README.md](../docs/README.md). Current roadmap:
[strategy/roadmap.md](../docs/strategy/roadmap.md). How the OS was built, phase by
phase: [history/os-build-log.md](../docs/history/os-build-log.md).

## Where things live

| Path | What it is |
| --- | --- |
| `src/app/` | Routes. `os/` is the team's screens. `p/[token]` and `status/[token]` are client links. `api/` holds the intake, Google sign-in and CI-evidence endpoints. |
| `src/app/os/actions/` | Server actions. Thin: check the capability, then call the domain module. |
| `src/lib/<domain>/` | Business rules, one folder per domain (`auth`, `leads`, `proposals`, `projects`, `trace`, `prospecting`, `finance`, ...). Each function takes an `Actor` and checks a capability first. Tests sit beside the code as `*.test.ts`. |
| `src/lib/ai/` | Everything that calls a model. `router.ts` picks the model per task, `providers/` are the implementations, `costs/` turns usage into dollars, `callModel.ts` is the metered call. |
| `src/lib/agents/` | Agent runtime. Loads `agents/<slug>/agent.md` (at the repo root) and runs it against structured input. |
| `src/lib/orchestrator/` | Dispatches tasks to agents and enforces the quality gates. |
| `src/lib/tools/` | The only tools an agent may use: project-scoped files and the fixed test run. |
| `src/lib/library/` | The reusable IP library (route `/os/library`). |
| `prisma/` | `schema.prisma`, `migrations/`, and `seed.ts` (demo fixtures). Migrations already applied in production are history: never edit or rename one. |
| `scripts/` | `start.sh` (container entry point), `campaign-worker.ts`, `create-user.ts`. |

## Getting started

```bash
npm ci                     # then generate the Prisma client:
npx prisma generate        # (npm may hold back install scripts pending approval)
npx prisma migrate deploy  # creates prisma/dev.db (gitignored)
npm run db:seed            # demo project + demo lead (fixtures)
NIRMAAN_PASSWORD='a long passphrase' npm run user:create -- you@example.com "Your Name" FOUNDER
npm run dev                # http://localhost:3000 → sign in
```

## Checks

All must pass before merging. CI runs the same checks on every pull request that
touches `os/`.

```bash
npm test                   # the full suite, a few seconds
npm run typecheck
npm run lint
npx next build
```

## Environment

Local values go in `.env.local`, which git ignores. `.env` holds only the local
database location.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite file. Local: relative to `prisma/` (set in `.env`). Fly: `file:/data/nirmaan.db`. |
| `PROJECTS_ROOT` | Where project folders are written. Default `../projects` (the repo's `projects/`). Fly: `/data/projects`. |
| `AGENTS_ROOT` | Agent specs. Default `../agents`. |
| `CLAUDE_CODE_EXECPATH` | The `claude` CLI the OS calls for model work. Default: `claude` on `PATH`. |
| `AGENCY_OS_MODEL_<TASKTYPE>_PROVIDER` / `_ID` | Model routing overrides, e.g. `AGENCY_OS_MODEL_REQUIREMENTS_PROVIDER=mock` to run discovery without a model. |
| `AGENCY_OS_DISABLE_COMPLEXITY_ROUTING` | `1` switches off per-task model up- and down-tiering. |
| `ANTHROPIC_API_KEY` | Only for the raw Anthropic provider, which nothing routes to by default. |
| `NIRMAAN_OS_URL` | Public base URL used in links the OS sends. Defaults to the request host. |
| `NIRMAAN_INTAKE_ORIGINS` | Comma-separated origins allowed to post to `/api/intake`. Default `https://nirmaan.online`. |
| `NIRMAAN_PASSWORD` | Password for the account `npm run user:create` makes. |
| `NIRMAAN_PASSWORD_LOGIN` | `off` refuses password sign-in, so only Google sign-in works (set in `fly.toml`). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | "Sign in with Google". Setup: [deployment](../docs/engineering/deployment.md). |
| `GOOGLE_PLACES_API_KEY` | Prospecting: Google Places search. Optional; without it, searches use the web only. |
| `OUTREACH_FROM`, `SMTP_URL` or `RESEND_API_KEY`, `IMAP_URL` | Prospecting: send approved outreach from our mailbox and read replies. Also `OUTREACH_SENDER_NAME`, `OUTREACH_WHATSAPP_NUMBER`, `OUTREACH_DAILY_LIMIT` (default 400) and more. See [prospecting](../docs/product/prospecting.md). |

## Campaign worker

`npm run campaigns:worker` runs a tick every minute. `npm run campaigns:tick` runs
one tick, for cron. On Fly the worker runs beside the web app (`scripts/start.sh`).
Never run a local worker while the server's is running: two workers on two databases
would contact the same businesses twice.
