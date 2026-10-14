# Recurring revenue · IMPLEMENTED (Phase 3)

Tracked per client: plan, monthly price, start date, renewal date, status, and
what's included. Company level: MRR, churn, and customer lifetime value
(project revenue plus recurring revenue to date).

Each completed project asks one question at handover: *is there a legitimate
recurring service here?* Hosting, maintenance, monitoring, security, backups,
analytics, SEO, content, AI/API management or support. If no, offer nothing.

In the OS: care plans (SUB-###) per client, optionally tied to a project, with
monthly price, status (active, paused, cancelled) and next billing date.
"Create due invoices" on `/os/finance` drafts one invoice per month owed; a
month can never be billed twice. MRR and client lifetime value are on the
same screen. The public care-plan tiers are in `website/src/_data/pricing.json`.
