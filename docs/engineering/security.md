# Security architecture

## Implemented

| Control | How |
|---|---|
| Authentication | Email + password; scrypt (N=2^15, per-hash salt and parameters); constant-time comparison; the same work is done for unknown emails (no account enumeration by timing) |
| Sessions | 256-bit random token in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production); only its SHA-256 is stored; 14-day expiry; deleted on logout, deactivation and role change |
| Brute force | Login limited to 10 attempts per 15 minutes per IP + email |
| Google sign-in | OpenID Connect code flow with PKCE (S256) and a random state, both in a 10-minute `httpOnly` cookie scoped to `/api/auth/google`; the ID token's issuer, audience, expiry and `email_verified` are checked. It signs in only an **existing, active** user with that exact email: nobody gets an account by signing in. Refusals are audited. (`src/lib/auth/google.ts`) |
| Google-only mode | `NIRMAAN_PASSWORD_LOGIN=off` turns password sign-in off on the server (not just in the UI). Accounts created without a password store a marker that no password can match. |
| Owners only | The Growth dashboard (every outreach message, reply and lead) and autopilot settings need `growth:read`, which only the founder role has |
| Authorization | Capability-based RBAC (`src/lib/auth/permissions.ts`), checked in **every** service function and page. The UI only hides what the server already refuses. |
| Least privilege | e.g. engineers can't see economics or send proposals; PMs can't decide gates or accept change-request costs; clients have no internal capabilities |
| Client access | Capability links scoped to one object and one action, 256-bit, stored hashed, shown once, revocable, invalidated on use or re-send; pages send `no-referrer` |
| Public intake | Hand-written validation with length caps and control-character stripping, honeypot, 32 KB body cap, CORS locked to the site's origins, 5 per 10 minutes per IP |
| Audit | Append-only `AuditLog` of sign-ins, decisions, links, status changes and user management; details pass through secret redaction |
| Headers | `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, a restrictive `Permissions-Policy`, and COOP on the OS; a sensible baseline on the public site, plus a Content-Security-Policy (inline scripts allowed by sha256 hash only, checked in CI by `.github/scripts/check-csp.mjs`), sent as Report-Only until a preview check passes |
| Secrets | Nothing in git (`.env*` ignored); the first account's password comes from an env var, not argv; agent model calls have no tool access (`--allowedTools ""`) |
| Data separation | Client and lead data only in the database (gitignored), never in `/projects` or `/docs` |
| Internal data | Economics never in client components; AI prompts and agent specs are never served to clients |

## Roles and capabilities (the RBAC model)

| Role | Capabilities (summary) |
|---|---|
| Founder / Admin | Everything, including user management |
| CTO | Everything except user management |
| Project manager | Leads, discovery, requirements, proposals (write and send), economics, projects, tracing, change requests (log and assess), dashboard, AI usage |
| Engineer | Read projects, write traceability and evidence |
| Designer | Read projects, write traceability |
| QA | Read projects, write traceability and evidence |
| Finance | Read leads, proposals, economics, projects, dashboard, AI usage |
| Support | Read leads and projects, log change requests |
| Client admin / Client user | `client:proposal:respond` / `client:project:status`, through capability links, and with accounts (Phase 4): `client:invoices:read`, `client:support:write`, `client:change:request` for admins; status and support for users. Every portal query is scoped by the user's `clientId`; client roles can't be changed into internal roles or reach `/os` |

The authoritative list is `ROLE_CAPABILITIES`; the Team screen shows it live.

## Planned

- Environment separation (preview / production databases), backups with
  tested restores, and a retention policy (client data kept for the contract
  term plus a defined period, then deleted on request): **PLANNED** with the
  first deployment.
- Shared-store rate limiting when there's more than one server instance.
- MFA for founder and CTO accounts, or moving to a maintained auth library
  if the auth surface grows (SSO, MFA, client accounts).
- Security review of every client project before the PRODUCTION gate (the
  Security Engineer agent plus human sign-off).
