# Deployment

## Public site · IMPLEMENTED

Vercel from `main`. The Vercel project's **Root Directory is `website/public`**: that
folder is the built site (Eleventy output, committed), so Vercel runs no build and
publishes nothing else. Sources live in `website/src/`; rebuild with `npm run build`
in `website/` and commit `public/`. `vercel.json` (in `website/src/static/`, copied to
`public/`) holds redirects, for example `/agency-os.html` → `/process.html#honest`, and
baseline headers.

CI (`.github/workflows/website.yml`, job `website-build`) rebuilds `public/` from an
empty folder on every pull request and push to `main` and fails if it differs from the
committed files, then checks every internal link. Each 1 January the footer year
changes, so rebuild and commit `public/` then (see the comment in the workflow).

## Nirmaan OS on Fly.io · IMPLEMENTED (os.nirmaan.online)

One machine in Singapore (`sin`, the nearest region offered to this account) runs the web app and, only when
`NIRMAAN_WORKER` is exactly `on`, the campaign worker beside it (`os/scripts/start.sh`).
`fly.toml` sets `NIRMAAN_WORKER = "off"`, so a deploy serves the web app alone. While
the OS is paused (since 2026-10-17), `fly.toml` also keeps no machine running
(`min_machines_running = 0`) and never starts one on a request
(`auto_start_machines = false`). The database (`/data/nirmaan.db`) and project files
(`/data/projects`) live on a persistent volume. Config: `fly.toml` and `Dockerfile.os`
at the repo root; the image holds only `os/` and `agents/`.

First setup (once):

```text
brew install flyctl && fly auth login
fly apps create nirmaan-os
fly volumes create nirmaan_data --region sin --size 1
claude setup-token                      # prints a long-lived token for the server
fly secrets set CLAUDE_CODE_OAUTH_TOKEN=… GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… \
  GOOGLE_PLACES_API_KEY=… OUTREACH_FROM=… SMTP_URL=… IMAP_URL=… \
  OUTREACH_SENDER_NAME=… OUTREACH_WHATSAPP_NUMBER=…
fly deploy
fly ssh console -C 'npm run user:create -- you@example.com "Your Name" FOUNDER'
fly certs add os.nirmaan.online          # then add the DNS record it asks for
```

Also add `https://os.nirmaan.online/api/auth/google/callback` to the Google OAuth
client's redirect URIs.

Nothing deploys by itself: `.github/workflows/os.yml` (job `os-test`) only tests (a
fresh database from `prisma migrate deploy`, typecheck, lint, unit tests, `next build`)
on every pull request and push to `main`, with no path filter, and has no deploy
job. While the OS is paused, do not run `fly deploy`; a restart goes through the
un-pause checklist. Logs: `fly logs`. When the worker runs, its ticks appear there
once a minute.

Backups: every night after 02:00 India time the worker (only when it runs) emails a gzipped copy of the
whole database to our own mailbox ("Nirmaan OS backup <date>", `src/lib/backup.ts`;
`BACKUP_EMAIL` to send it elsewhere). Fly also keeps daily volume snapshots for 5 days,
and `fly ssh sftp get /data/nirmaan.db` downloads the live file.

## Nirmaan OS: other hosts

The notes below were written before the Fly setup and still apply to any host.

Recommended first deployment (see `procurement.md`):

1. A small VM or container host with a **persistent disk** for SQLite (for
   example a basic Fly.io machine or a VPS), because serverless platforms
   don't keep a writable SQLite file. Or switch to managed Postgres first if
   the host must be serverless.
2. Environment: `NODE_ENV=production`, `NIRMAAN_OS_URL=https://os.nirmaan.online`,
   `NIRMAAN_INTAKE_ORIGINS=https://nirmaan.online,https://www.nirmaan.online`,
   and the `claude` CLI logged in, or `ANTHROPIC_API_KEY` plus a routing override.
   For prospecting, optionally `GOOGLE_PLACES_API_KEY`, and `OUTREACH_FROM` with
   `SMTP_URL` (or `RESEND_API_KEY`) to send approved emails
   (see `../product/prospecting.md`).
3. Ship `/agents` alongside the app (the runtime reads specs from `../agents`,
   or set `AGENTS_ROOT`).
4. `npx prisma migrate deploy`, then create the founder:
   `NIRMAAN_PASSWORD=... npm run user:create -- you@… "Name" FOUNDER`.
5. Set `intakeEndpoint` in the site's `website/src/_data/site.json` to
   `https://os.nirmaan.online/api/intake` and redeploy the site.
6. Nightly database backup off the machine, and a restore drill once.

## Sign in with Google · IMPLEMENTED (needs a Google OAuth client)

Only people who already have an OS account can sign in, and only with the Google
account whose email matches it.

1. In Google Cloud Console (the same project as the Places key), open
   **APIs & Services → OAuth consent screen** ("Google Auth Platform"):
   - User type **External**, app name **Nirmaan OS**, your support email.
   - Scopes: only `openid` and `email`. Leave it in **Testing** and add
     `nirmaansoftware@gmail.com` (and any other owner) as a test user.
2. **Credentials → Create credentials → OAuth client ID**, type **Web application**,
   name `Nirmaan OS`. Under **Authorized redirect URIs** add
   `http://localhost:3000/api/auth/google/callback`, and later the live one,
   `https://os.nirmaan.online/api/auth/google/callback`.
3. Put the client ID and secret in `os/.env.local` (never in git):
   `GOOGLE_CLIENT_ID=…` and `GOOGLE_CLIENT_SECRET=…`. Online, also set
   `NIRMAAN_OS_URL=https://os.nirmaan.online`.
4. Make sure the owner has an OS account with the same email. Without a password
   it's a **Google-only** account:
   `npm run user:create -- nirmaansoftware@gmail.com "Sahaj Patel" FOUNDER`.
5. **Google sign-in only (recommended):** set `NIRMAAN_PASSWORD_LOGIN=off`. The server
   refuses password sign-in, and the login page and Team screen stop asking for
   passwords. New team members are added on the Team screen with just their email.

The login page then shows **Sign in with Google**.

## Standard pipeline for client projects · PLANNED (Phase 2 automates it)

```text
Code → lint → typecheck → unit → build → integration → security checks → preview
→ human approval (PRODUCTION gate) → production → smoke test → DEPLOY-### recorded
```

Today the OS already enforces the human step: a production DEPLOY record
can't be created without an approved PRODUCTION gate and a rollback plan.

## GitHub Pages: keep it off

The public site is served only by Vercel (www.nirmaan.online). GitHub Pages
must stay disabled for this repository: its Jekyll build can't read the
Eleventy templates in `src/` (every push fails with "Unknown tag 'set'"), and
while it was on it kept serving an outdated copy of the site at
`nirmaansoftware.github.io/Nirmaan`. Only the repository owner can change
this, in Settings → Pages.
