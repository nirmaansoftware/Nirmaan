# ADR: hq, the founder's live view (hq.nirmaan.online)

Date: 2026-11-14. Status: accepted (built, not deployed).

## Context

The founder wants one private place to watch the programme (progress, agents and
models, reviews, evals, staff, what waits on the founder) from any device. The
sources are private and live on the founder's Mac. This adds a new deployable
(`hq/`), a new auth model and a new data boundary.

## Decision

1. **Deployable.** `hq/` is a separate Next.js app on its own Vercel project
   (root `hq`), not part of `os/`. It renders one typed, sanitised `Snapshot`.
2. **Auth.** A GitHub OAuth login ("Nirmaan HQ" app under nirmaansoftware). A
   signed HMAC session cookie is issued only for a login in `HQ_ALLOWED_LOGINS`.
   The GitHub token is read once at sign-in and dropped. Every page and API
   route is gated in `hq/src/proxy.ts`; missing settings serve 503 (fail
   closed). Settings are Production-only, so previews fail closed.
3. **Data path and boundary.** A dependency-free publisher on the founder's Mac
   (launchd, every 15 s) builds the snapshot and writes it to Upstash Redis
   (REST) on change, plus a 5-minute heartbeat. The site reads with a
   read-only token, cached 5 s. The write token stays on the Mac
   (`~/.nirmaan/hq/upstash.env`), outside the repository.

## Alternatives considered

- **Vercel password protection / Deployment Protection.** Shared password, no
  per-person identity, no allow-list by GitHub login. Rejected on that ground
  alone. ASSUMPTION (unverified, no dated primary source yet): the password
  feature may need a paid plan add-on; it does not drive the decision.
- **Cloudflare Access.** Good identity gate, but adds a second vendor and DNS
  move for one user; the domain is at Hostinger. Rejected for now; it can
  replace the login later without changing the snapshot.
- **File or SQLite store.** Vercel functions have no persistent shared disk, so
  the Mac cannot write to it and the site cannot read it. It would need a
  host we run. Rejected.
- **OS database (Postgres) as the store.** Couples a founder-only view to the
  OS schema and migrations, and exposes OS credentials to the Mac publisher.
  Rejected.
- **Redis REST (Upstash).** Chosen: HTTP-only (fits serverless), separate
  read-only and write tokens, no schema. Plan and price: see the labelled
  assumptions under "Cost and triggers".

## Data-sharing consequences

- Private-source facts leave the Mac for a third party (Upstash) and are served
  by Vercel. Only a sanitised snapshot goes: no secrets, tokens, prices, costs,
  margins or legal drafts; clients appear only as project ids.
- `hq/src/lib/forbidden.json` is shared: the publisher refuses to write a
  forbidden key and the site refuses to serve one. Tests include a must-fail
  control.
- The store holds only the latest snapshot, so a leak is bounded to what the
  contract allows. Rotate the Upstash tokens if the Mac is lost. No real client
  data is committed; `sample.ts` is illustrative.

## Cost and triggers

- ASSUMPTION (unverified; no dated primary source recorded): an Upstash free
  tier and the current Vercel plan cover one user. Before go-live, the founder
  step is to check Upstash and Vercel pricing pages, record the URL and date
  here, and confirm the plan terms allow this use.
- INFERENCE (rough, from the design, not measured): one user polling every
  10 s while a tab is visible is at most about 8,640 reads a day per open
  tab-day (the 5 s cache cuts store reads further); publishing is on change
  plus a 5-minute heartbeat, about 288 writes a day at minimum, more when the
  snapshot changes. Compare these with the verified free limit at go-live.
- Revisit if Upstash commands approach the free daily limit (to be confirmed
  from the source above), if a second
  person needs access (allow-list and plan), or if the snapshot needs fields
  outside the contract. Any such change gets a new ADR.
