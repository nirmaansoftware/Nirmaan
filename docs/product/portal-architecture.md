# Portal architecture (information architecture)

Two experiences, one data model, different permissions and UX.

**Status:** the OS is paused since 2026-10-18 (see
[deployment](../engineering/deployment.md#pause-and-un-pause)). "IMPLEMENTED" below
means built and tested in the code, not running for clients today.

## Customer surfaces

| Surface | Where | Status |
|---|---|---|
| Positioning, services, process, work | nirmaan.online (static) | IMPLEMENTED |
| Problem-first intake (3 progressive steps) | nirmaan.online/contact → Web3Forms (email) | IMPLEMENTED. The OS `/api/intake` endpoint exists but the site does not use it. |
| Proposal review: approve / request changes / decline | OS `/p/<token>` | IMPLEMENTED |
| Project progress | OS `/status/<token>` | IMPLEMENTED |
| Invoices due and paid, with payment instructions | OS `/status/<token>` | IMPLEMENTED (Phase 3) |
| Deliverables, support requests, multi-project view | OS client accounts (`/portal`) | IMPLEMENTED (Phase 4) |

## Internal OS (`/os`)

```text
Today (founder: exceptions + sales, delivery, money)
Pipeline
  Leads → lead detail (problem, discovery, requirements, proposals, notes)
  Proposals → editor (+ internal economics) → client preview → send
Delivery
  Projects → workspace (lifecycle, requirements & evidence, tests, change requests,
             deployments, tasks, artifacts, activity)
  Approvals (human gates)
Company
  Finance (CFO view, invoices, care plans, settings) · AI usage · Audit log · Team
```

The lifecycle drives the navigation: a lead is worked in Pipeline until
approval, then lives in Delivery. Nothing internal is reachable from the
customer surfaces: different routes, no shared navigation, `noindex`
everywhere, and server-side capability checks.
