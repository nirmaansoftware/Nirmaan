# Lead to project (customer lifecycle) · IMPLEMENTED

```text
Website intake / call ─► LEAD-### (NEW)
        │  Business Analyst discovery (AI) + team notes
        ▼
   DISCOVERY: FACT · ASSUMPTION · QUESTION · RECOMMENDATION (each needs a human decision)
        │  facts, confirmed items, answered questions → REQ-###
        ▼
   QUALIFIED ─► PROP-### draft (scope from MUST/SHOULD, exclusions from WONT)
        │  price, schedule, milestones, maintenance option, internal estimate
        ▼
   SENT (one-time capability link) ─► client: approve · ask for changes · decline
        │ approve (PROPOSAL gate, recorded as the client's decision)
        ▼
   WON ─► client + PRJ-### workspace created automatically, requirements attached,
          client gets a private status link
```

## Stages and who moves them

| Lead status | Meaning | Moved by |
|---|---|---|
| NEW | Arrived, untouched | Intake API or manual entry |
| DISCOVERY | We're working out the problem | Team, or automatically when discovery runs |
| QUALIFIED | Real problem, fit, worth a proposal | Team |
| PROPOSAL | Proposal with the client | Automatically on send |
| WON | Client approved | **Only** the client's approval; can't be set by hand |
| LOST | Not proceeding | Team; a reason is **required** (it feeds pricing and ICP reviews) |
| SPAM | Junk | Team |

## Service levels (policy)

- Reply to a new lead within 24 hours (stated publicly on the contact page).
- The Today screen flags leads idle for 3+ days and proposals unanswered for 7+ days.

## Client decisions on a proposal

- **Approve:** needs their typed name. Creates the project in one transaction.
  The link then stops working.
- **Ask for changes:** needs a note. The proposal returns to the team as
  CLARIFICATION_REQUESTED. Sending again issues a new link and retires the old one.
- **Decline:** needs a short reason. The lead returns to QUALIFIED.
- Expired proposals (past "valid until") can't be approved.

<!-- Seed S10: hand-posted status test. Do not merge. -->
