# Nirmaan

This repository holds the code Nirmaan runs in production, plus the company's
documentation. Each deployable has its own folder, and each folder explains itself.

| Folder | Runs at | What it is |
| --- | --- | --- |
| [`website/`](website/README.md) | nirmaan.online (Vercel) | The marketing site. Eleventy sources are in `website/src/`. The built site in `website/public/` is what Vercel serves. |
| [`os/`](os/README.md) | os.nirmaan.online (Fly.io): screens on, worker off since 2026-10-17 | Nirmaan OS: the team's operating system, the client portal and the intake API. Next.js and Prisma on SQLite. |
| [`agents/`](agents/README.md) | read by the OS at runtime | The agent specifications, one `agent.md` per agent. The OS image includes them. |

ip.nirmaan.online is a separate repository, IP Nirmaan, and is not part of this one.

Shared, not deployed:

- [`docs/`](docs/README.md): company, product, engineering, AI, finance, operations
  and strategy. Finished records are in `docs/history/`.
- [`projects/`](projects/README.md): the workspace the OS writes project files into.
  Only the demo fixture is committed. Real client material must never be.
- [`CHANGELOG.md`](CHANGELOG.md): what changed, by date.

Deployment:

- **nirmaan.online**: Vercel, with the Root Directory set to `website/public`. Vercel
  runs no build. Rebuild and commit `website/public/` after any change to `website/src/`.
- **os.nirmaan.online**: Fly.io app `nirmaan-os`, **screens on, worker off** since
  2026-10-17: people sign in with Google and see the data; nothing reads the inbox,
  sends email, runs Claude or calls Google Places. The patched build from `main` is
  deployed and the old v10 build was never restarted; the email, inbox, Places and
  Claude credentials were removed. `Dockerfile.os` and `fly.toml` sit at the root
  because the image needs both `os/` and `agents/`. CI in `.github/workflows/os.yml`
  (job `os-test`) tests pull requests and pushes to `main`; it deploys nothing.
  Turning the worker back on follows the checklist in
  [deployment](docs/engineering/deployment.md#worker-off-and-turning-it-back-on).

Working on it:

```bash
cd website && npm ci && npm run build   # the marketing site
cd os && npm ci && npm run dev          # the OS, http://localhost:3000
```

For coding agents, read [AGENTS.md](AGENTS.md) first.
