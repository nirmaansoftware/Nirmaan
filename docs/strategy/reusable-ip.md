# Reusable IP library · IMPLEMENTED (Phase 4, `/os/library`)

> Build once. Reuse many times.

Categories: UI components, authentication, payments, dashboards, admin
panels, forms, email, notifications, AI integrations, database patterns,
deployment templates, monitoring, testing, security.

Each asset records: name, version, description, dependencies, usage,
projects using it, owner, maturity (experimental → used once → proven in 3+
projects), and documentation link. Maturity is derived from recorded uses,
so it can't be overstated.

Rules:

- An asset is harvested **after** a project proves it, not built speculatively.
- Client-specific code and data never enter the library.
- Library code lives in a **private** repository (this one is public).
- No asset is offered in a proposal or on the site as a ready-made module
  until it is rated proven. Proven should count delivered projects only
  (past HANDOVER); today the OS counts a use at any stage, so the count is
  being fixed first (backlog ML31 in the
  [market learnings decisions](market-learnings-decisions.md)).

Already reusable today (internal): the `/os` auth, RBAC, audit, ID, intake
validation and traceability modules, and the public site's design system
and glyph shortcode.
