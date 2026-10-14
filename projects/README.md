# Projects

Each subdirectory here is one client/internal project's shared knowledge base — the artifacts agents read from and write to, git-tracked for free versioning and human readability. The database (Phase 3) stores only metadata and pointers into these files; it never duplicates artifact content.

## Convention

```
/projects/{project-id}/
  project.md          — what the project is, client, stage, key contacts
  requirements.md      — pointer/summary; full PRDs live under requirements/
  requirements/
  decisions/            — ADRs and other decision records, versioned (v1, v2, ...)
  research/
  design/
  architecture/
  implementation/
  testing/
  deployment/
  documentation/
  client/               — intake notes, correspondence (never the raw place for outbound messages — see Client Communication agent)
  reports/               — status reports, escalation notes
```

Every artifact file carries frontmatter per the Agent Handoff Protocol: `project, task, agent, status, confidence, assumptions, inputs, outputs, decisions, risks, open_questions, next_agent, review_required`. This makes each file self-describing — a reader (human or agent) doesn't need conversation history to understand what it is, who made it, or what's still open.

## Important — before any real client data goes in here

**Do not use this public repository for real client project data.** This convention was designed to live in a **private** repository or private storage. Client briefs, contracts, and correspondence should not be committed to a public repo. This is flagged as an explicit risk in [`/docs/history/agency-os-plan.md`](../docs/history/agency-os-plan.md) (Risk Register, Section J).

## Status

No real project exists here yet. `demo-project/` is fixture data created by `os/prisma/seed.ts` (Phase 3) to exercise the dashboard — a fake client ("Riverside Bread Co."), not a real engagement, clearly labeled as such in its own files. The first real project directory gets created once there's an actual client engagement to run through the system, at which point the private-repo requirement above must be resolved first.
