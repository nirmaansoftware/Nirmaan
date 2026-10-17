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

## Nirmaan OS on Fly.io · SCREENS ON, WORKER OFF (since 2026-10-18)

**The screens run; the worker does not.** Founder decision of 2026-10-17 (it
replaced the full stop agreed that morning): people can sign in with Google and see
the OS's data, but nothing reads the inbox, sends email, runs Claude or calls Google
Places. Since 2026-10-18 the deployed build is the patched one from `main` (the
dependency security update and the worker switch), with `NIRMAAN_WORKER = "off"`.
The old build (Fly release v10 of 2026-09-28) was never restarted. The email, inbox,
Places and Claude credentials were removed from Fly; only the Google sign-in
credentials remain, so even a button in the web app cannot send or run AI. The
machine and its data volume are kept. Decision:
[architecture decisions](architecture.md#decisions) and the
[2026-10-17 decision record](../operations/2026-10-17-inspection-decisions.md).

One machine in Singapore (`sin`, the nearest region offered to this account) runs the web app and, only when
`NIRMAAN_WORKER` is exactly `on`, the campaign worker beside it (`os/scripts/start.sh`).
`fly.toml` sets `NIRMAAN_WORKER = "off"`, so a deploy serves the web app alone, and
the web app's "Run one tick now" button answers "This feature is paused" instead of
doing the worker's work. A request wakes the machine (`auto_start_machines = true`),
it stops again when idle (`auto_stop_machines = "stop"`), and none is kept running
(`min_machines_running = 0`). Fly holds only `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` as secrets; `NIRMAAN_OS_URL` (the sign-in redirect address)
is in `fly.toml`. Without the other secrets the screens still work and those features
say they aren't set up. The database (`/data/nirmaan.db`) and project files
(`/data/projects`) live on a persistent volume. Config: `fly.toml` and `Dockerfile.os`
at the repo root; the image holds only `os/` and `agents/`.

First setup (once; the full list of secrets is for when the worker runs):

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
job. The deploy credential was removed from GitHub. A deploy is a deliberate act by
the founder (`fly deploy` from the repo root); never restart an older image. Logs:
`fly logs`. When the worker runs, its ticks appear there once a minute.

Backups: when the worker runs, every night after 02:00 India time it emails a
gzipped copy of the whole database to our own mailbox ("Nirmaan OS backup <date>",
`src/lib/backup.ts`; `BACKUP_EMAIL` to send it elsewhere). With the worker off that
email does not come (if it does, the worker is running). Fly keeps volume snapshots
for only 5 days, so the copy that counts is the encrypted backup taken on
2026-10-18, checked by a local restore and kept outside any repository; take
further backups by hand (`fly volumes snapshots create`, or download
`/data/nirmaan.db` with `fly ssh sftp get`).

### Worker off, and turning it back on

**How the worker was turned off** (2026-10-18, outside the sending hours of Mon to
Sat 10:00 to 19:00 India time and the nightly backup, so no message was half-sent):

1. Checked the send queue for approved, failed and active-campaign items.
2. Backed up the database and project files, downloaded them, checked them with a
   local restore (integrity check, row counts), and stored them encrypted outside
   any repository.
3. Removed the email, inbox, Places and Claude credentials from Fly, deployed the
   patched build from `main` with `NIRMAAN_WORKER = "off"`, and confirmed sign-in
   works, the logs show no worker ticks, and the nightly backup email stops.

**Checklist for turning the worker back on.** Every item, in order; the Principal
Architect owns the list and the founder approves.

- [ ] **Dependency security update deployed** (N5): the patched build is what
      runs. Never restart the old v10 build.
- [ ] **Backup restore checked** (N1): the 2026-10-18 backup restores locally and
      passes its integrity check, so there is a known-good copy before anything
      changes.
- [ ] **Approved queue cleared or re-reviewed:** every message left approved from
      before the worker went off is cancelled or approved again by a person;
      nothing old sends by itself.
- [ ] **Credentials reissued:** the email, inbox, Places and Claude credentials
      retired at their providers are issued again and set on the host
      (`fly secrets set`), and, if CI should deploy again, a new deploy token is
      created (`fly tokens create deploy`), scoped to this app only.
- [ ] **Inbox processed before the first send:** replies and stop requests that
      arrived while the worker was off are read, and every stop is on the
      do-not-contact list, before any message goes out.
- [ ] **Restart hardening merged** (N19): the worker stops cleanly mid-tick
      without re-sending, old approvals expire back to draft, and build inputs are
      pinned.
- [ ] **Uptime and "machine started" alert in place** (N20).
- [ ] **Worker switched back on:** `NIRMAAN_WORKER = "on"` in `fly.toml` (it is
      `off` now, so a deploy serves the web app alone), with
      `auto_stop_machines = "off"` and `min_machines_running = 1` so the machine,
      and the worker in it, keeps running between requests.
- [ ] **Founder approval**, recorded with the date.

Then deploy by hand, watch the first worker ticks in `fly logs`, and update this
section and the architecture decision row.

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
