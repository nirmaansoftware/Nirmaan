# Internal OS

Implemented screens: Today, Leads, Lead detail (discovery), Proposals,
Proposal editor and preview, Projects, Project workspace (with the AI
factory, money and knowledge panels), Approvals, Support, Knowledge, IP
library, Patterns, Finance, AI usage, Audit log, Team, Login. Clients sign in
to a separate `/portal`. See `portal-architecture.md` for the map
and `engineering/security.md` for who sees what.

Getting started locally (from the repo root):

```bash
cd os && npm ci && npx prisma generate && npx prisma migrate deploy && npm run db:seed
NIRMAAN_PASSWORD='a long passphrase' npm run user:create -- you@example.com "Your Name" FOUNDER
npm run dev   # http://localhost:3000 → sign in
```

Discovery uses the model router's default provider (the `claude` CLI, which
must be installed and logged in). Set `AGENCY_OS_MODEL_REQUIREMENTS_PROVIDER=mock`
to exercise the flow without a model.
