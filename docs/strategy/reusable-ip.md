# Reusable IP library · IMPLEMENTED (Phase 4, `/os/ip`)

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

Already reusable today (internal): the `/os` auth, RBAC, audit, ID, intake
validation and traceability modules, and the public site's design system
and glyph shortcode.
