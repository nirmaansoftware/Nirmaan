# hq: hq.nirmaan.online

The founder's live view of the Nirmaan ecosystem: progress, live agents and the model each
uses, reviews, eval batches, staff (roles, skills, levels) and what waits on the founder.
Internal and login-only. Never indexed.

**Status: SCAFFOLD.** Every screen renders from a labelled sample snapshot
(`src/lib/sample.ts`). Not deployed. Still to do: the publisher, the store, the GitHub login,
and the Vercel project with its DNS record.

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
