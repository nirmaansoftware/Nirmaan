# Agent guide: Nirmaan

Read [README.md](README.md) for the map. This file adds the rules and commands.

## Rules

- **`website/public/` is generated.** Edit `website/src/` (or `website/src/static/` for
  hand-written files), run `npm run build` in `website/`, and commit both.
- **Applied migrations are history.** Never edit, rename or delete a folder in
  `os/prisma/migrations/`. Add a new migration instead.
- **Secrets go in `os/.env.local`** (git-ignored) and nowhere else. This repository is
  public.
- **Real client data never goes in this repository.** Client material lives in the
  OS database and private storage. Only fixtures are committed.
- **Ignore and delete iCloud duplicates** such as `file 2.ts` or `node_modules 2`. They
  come from the synced folder and are not part of the project.
- **Every PR gets two keys** (`docs/operations/pr-review.md`, IMPLEMENTED): the lead of
  each owning team, then the orchestrator; founder classes A to F also need the founder's
  approval. Reviews run through the `pr-review` skill and the automated loop. Never review
  a PR your own session wrote. The ruleset on `main` requires both keys' checks before
  merge.
- **The OS must pass its checks before merge:** `typecheck`, `lint`, `test` and
  `next build`. Tests sit beside the code as `*.test.ts`.

## Commands

| Task | Where | Command |
| --- | --- | --- |
| Build the site | `website/` | `npm ci`, then `npm run build` |
| Serve the site with rebuilds | `website/` | `npm run watch` (http://localhost:8080) |
| Refresh the page-transition masks | `website/` | `npm run masks` |
| Run the OS | `os/` | `npm ci`, then `npm run dev` (http://localhost:3000) |
| Test the OS | `os/` | `npm test`, `npm run typecheck`, `npm run lint` |

## Where to look

- Product and company decisions: `docs/`, starting at `docs/README.md`.
- What is built today: the "Current status" section of `README.md`. The plan:
  `docs/strategy/roadmap.md`. `docs/assessment/current-state.md` is a dated snapshot
  (2026-09-23), not the current state.
- Agent behaviour: `agents/<slug>/agent.md`. The OS loads these at runtime.
- Finished records (may describe old paths): `docs/history/`.
- Big decisions (pricing, launches, naming, legal, public pages): run a decision meeting,
  `docs/operations/decision-meetings.md` (the `decision-meeting` skill runs it).
