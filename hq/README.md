# hq: hq.nirmaan.online

The founder's live view of the Nirmaan ecosystem: progress, live agents and the model each
uses, reviews, eval batches, staff (roles, skills, levels) and what waits on the founder.
Internal and login-only. Never indexed.

**Status: LOCAL.** The publisher builds real snapshots on the founder's Mac every 15 s and hq
serves them locally (`HQ_SNAPSHOT_FILE`). Without it, every screen shows a labelled sample
(`src/lib/sample.ts`). Not deployed. Still to do: the store, the GitHub login, and the Vercel
project with its DNS record.

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
| Models | the review-loop call log (7 days) + live-eval record totals |
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
