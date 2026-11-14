# hq: hq.nirmaan.online

The founder's live view of the Nirmaan ecosystem: progress, live agents and the model each
uses, reviews, eval batches, staff (roles, skills, levels) and what waits on the founder.
Internal and login-only. Never indexed.

**Status: BUILT, NOT DEPLOYED.** The publisher builds real snapshots on the founder's Mac every
15 s. Locally hq reads that file (`HQ_SNAPSHOT_FILE`); deployed, it reads the store. With
neither, every screen shows a labelled sample (`src/lib/sample.ts`). Still to do: the store
account, the GitHub OAuth app, and the Vercel project with its DNS record (founder steps below).

## Security

- `src/proxy.ts` gates every page and API route: a signed session cookie (HMAC, 7 days,
  `src/lib/session.ts`) for a login in `HQ_ALLOWED_LOGINS`. No database; the GitHub token is
  read once at sign-in and dropped. **It fails closed:** missing settings serve 503.
  `HQ_AUTH=off` exists only for running on the founder's Mac; the code ignores it wherever Vercel runs the app.
- The login page renders no data: the screens live in the `(hq)` route group, whose layout
  loads the snapshot, and `/login` is outside it.
- The site reads the store with a read-only token, server-side only. The publisher holds the
  write token in `~/.nirmaan/hq/upstash.env`, outside the repository.
- Snapshots are sanitised by contract; the publisher refuses to write a forbidden field and
  the site refuses to serve one.

## Settings (Vercel, Production only)

| Variable | What |
| --- | --- |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | the "Nirmaan HQ" OAuth app under nirmaansoftware; callback `https://hq.nirmaan.online/api/auth/callback` |
| `HQ_SESSION_SECRET` | 32+ random characters (`openssl rand -hex 32`) |
| `HQ_ALLOWED_LOGINS` | the founder's GitHub logins, comma-separated (set in Vercel, never committed) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_READONLY_TOKEN` | the store (read-only token) |

Production only: preview deployments get no settings, so they fail closed.

## How it works

```
publisher (Mac launchd, later the cloud review loops)
  └─ sanitised snapshot every ~15 s ──► store (free tier)
                                          └─► hq server (getSnapshot) ──► /api/snapshot
                                                                     └─► open page refreshes every 10 s
```

- `src/lib/snapshot.ts` is the contract: every screen reads one `Snapshot` and nothing else.
  It is sanitised by contract (no secrets, costs, legal drafts; clients only as project ids),
  and `snapshot.test.ts` fails on a forbidden field.
- `src/lib/data.ts` is the only place that knows where snapshots come from (today, the sample).
- `src/app/_components/Live.tsx` keeps the page live: it polls `/api/snapshot` every 10 s
  while the tab is visible, catches up when the tab is shown again, and flashes the stamp
  when a new snapshot arrives.

## Publisher

`publisher/publish.mjs` (Node, no dependencies; uses the `gh` CLI) reads, each on its own so
one broken source shows as a warning row and never blanks the page:

| Section | Source |
| --- | --- |
| Health | RESUME.md (paused?), review-loop heartbeats, the rate-limit pause file, `pmset`, latest Actions run on `main` |
| Progress | `progress.json` (kept by the orchestrator) + IP `capability/levels.json` |
| Waiting on you | `waiting.json` + open PRs labelled `needs-founder` |
| Live agents | `lanes.json` (written by the orchestrator when a lane starts or ends) |
| Feed | the tracker's last 40 lines + loop merges of the last 24 h |
| Models | the review-loop call log (7 days), live-eval record totals, and every Claude Code session on the machine (model and token counts only, from `~/.claude/projects` transcripts; cached 10 min) |
| Reviews | open PRs (`gh`) + their latest loop events |
| Evals | live-eval records in ip-nirmaan and its worktrees; another harness = stale |
| Staff | IP: `publisher/ip_staff.py` (departments holding skills with a level) |

It refuses to write if a forbidden field appears (`src/lib/forbidden.json`, shared with the
app), writes atomically, and writes a content digest so a store push can skip unchanged
snapshots. GitHub calls are cached (45 s PRs, 2 min Actions). Paths are set by `HQ_*`
environment variables (see the top of the file).

```
node publisher/publish.mjs --print                               # one snapshot to stdout
HQ_SNAPSHOT_FILE=~/.nirmaan/hq/snapshot.json npm run dev         # hq on live data
```

## Design

`src/app/os-system.css` is a byte-for-byte copy of `os/src/app/globals.css`, the OS's
internal design system, and the fonts are the OS's. Never restyle it here: change the OS
first, then copy the file again. hq's own parts (progress blocks, status lights, model chips,
share bars, feed) are in `src/app/hq.css`, built only from OS tokens.

## Commands

| Task | Command |
| --- | --- |
| Install | `npm ci` |
| Run | `npm run dev` (http://localhost:3030) |
| Check | `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` |
