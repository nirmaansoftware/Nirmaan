/**
 * SQLite has no native enum type, so schema.prisma stores these as plain
 * String columns. This file is the actual source of truth for allowed
 * values at the application layer — every write path should go through
 * these, not raw strings.
 */

export const PROJECT_STAGES = [
  "LEAD",
  "DISCOVERY",
  "REQUIREMENTS",
  "ESTIMATION",
  "PROPOSAL",
  "APPROVED",
  "PLANNING",
  "DESIGN",
  "ARCHITECTURE",
  "IMPLEMENTATION",
  "QA",
  "SECURITY_REVIEW",
  "DEPLOYMENT",
  "MONITORING",
  "MAINTENANCE",
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const TASK_STATUSES = [
  "BACKLOG",
  "READY",
  "IN_PROGRESS",
  "BLOCKED",
  "REVIEW",
  "APPROVED",
  "DONE",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const AGENT_STATUSES = ["ACTIVE", "DRAFT", "DISABLED"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

// Matches the six Quality Gates in /docs/history/agency-os-plan.md Section H
// exactly (Requirements, Design, Architecture, Implementation, QA,
// Production) — an earlier version of this list had 5 values
// (IMPLEMENTATION_PLAN/DEPLOYMENT instead of IMPLEMENTATION/QA/PRODUCTION)
// that didn't line up with Section H. Fixed in Phase 6, which needed the
// two to actually match to write gate-enforcement code.
//
// Phase 1 (Nirmaan OS) adds three business gates from the operating model:
// PROPOSAL (the client approves scope and price), PLAN (the implementation
// plan is approved before design work starts) and HANDOVER (the client
// accepts delivery before the project moves into monitoring). The original
// six keep their exact transitions; see orchestrator/qualityGates.ts.
export const APPROVAL_GATES = [
  "REQUIREMENTS",
  "PROPOSAL",
  "PLAN",
  "DESIGN",
  "ARCHITECTURE",
  "IMPLEMENTATION",
  "QA",
  "PRODUCTION",
  "HANDOVER",
] as const;
export type ApprovalGate = (typeof APPROVAL_GATES)[number];

export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const KNOWLEDGE_SCOPES = ["GLOBAL", "PROJECT", "AGENT"] as const;
export type KnowledgeScope = (typeof KNOWLEDGE_SCOPES)[number];

export const DEPLOYMENT_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "SUCCEEDED",
  "FAILED",
  "ROLLED_BACK",
] as const;
export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

// ---------------------------------------------------------------------
// Phase 1: Business OS
// ---------------------------------------------------------------------

/** Internal roles. CLIENT_* roles are defined for the permission model but
 * have no accounts in Phase 1 — clients act through capability links. */
export const INTERNAL_ROLES = [
  "FOUNDER",
  "CTO",
  "PROJECT_MANAGER",
  "ENGINEER",
  "DESIGNER",
  "QA",
  "FINANCE",
  "SUPPORT",
] as const;
export const CLIENT_ROLES = ["CLIENT_ADMIN", "CLIENT_USER"] as const;
export const ROLES = [...INTERNAL_ROLES, ...CLIENT_ROLES] as const;
export type InternalRole = (typeof INTERNAL_ROLES)[number];
export type Role = (typeof ROLES)[number];

export const LEAD_STATUSES = ["NEW", "DISCOVERY", "QUALIFIED", "PROPOSAL", "WON", "LOST", "SPAM"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
/** Statuses a lead is still being worked in. */
export const OPEN_LEAD_STATUSES: readonly LeadStatus[] = ["NEW", "DISCOVERY", "QUALIFIED", "PROPOSAL"];

// OUTBOUND: converted from a prospect Nirmaan reached out to (src/lib/prospecting).
export const LEAD_SOURCES = ["WEBSITE", "MANUAL", "REFERRAL", "OUTBOUND"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const DISCOVERY_KINDS = ["FACT", "ASSUMPTION", "QUESTION", "RECOMMENDATION"] as const;
export type DiscoveryKind = (typeof DISCOVERY_KINDS)[number];
export const DISCOVERY_SOURCES = ["CLIENT", "AGENT", "TEAM"] as const;
export type DiscoverySource = (typeof DISCOVERY_SOURCES)[number];
export const DISCOVERY_STATUSES = ["OPEN", "CONFIRMED", "REJECTED", "ANSWERED"] as const;
export type DiscoveryStatus = (typeof DISCOVERY_STATUSES)[number];

export const REQUIREMENT_KINDS = ["BUSINESS", "FUNCTIONAL", "NON_FUNCTIONAL", "CONSTRAINT"] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];
export const REQUIREMENT_PRIORITIES = ["MUST", "SHOULD", "COULD", "WONT"] as const;
export type RequirementPriority = (typeof REQUIREMENT_PRIORITIES)[number];
export const REQUIREMENT_STATUSES = ["DRAFT", "APPROVED", "CHANGED", "DROPPED"] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export const FEATURE_STATUSES = ["PLANNED", "IN_PROGRESS", "DONE"] as const;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

export const TEST_LEVELS = ["STATIC", "UNIT", "INTEGRATION", "E2E", "SECURITY", "PERFORMANCE", "SMOKE", "QA"] as const;
export type TestLevel = (typeof TEST_LEVELS)[number];

export const EVIDENCE_RESULTS = ["PASS", "FAIL"] as const;
export type EvidenceResult = (typeof EVIDENCE_RESULTS)[number];

export const TRACE_RELATIONS = ["SATISFIED_BY", "IMPLEMENTED_BY", "VERIFIED_BY", "SHIPPED_IN"] as const;
export type TraceRelation = (typeof TRACE_RELATIONS)[number];

export const PROPOSAL_STATUSES = [
  "DRAFT",
  "SENT",
  "CLARIFICATION_REQUESTED",
  "APPROVED",
  "REJECTED",
  "SUPERSEDED",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const CHANGE_REQUEST_STATUSES = ["OPEN", "ASSESSED", "APPROVED", "REJECTED", "CONVERTED"] as const;
export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];

export const AUDIT_ACTOR_TYPES = ["USER", "CLIENT_LINK", "SYSTEM", "AGENT", "PUBLIC"] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

/** Narrowing helper: is `value` one of `allowed`? */
export function isOneOf<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------
// Phase 3: Financial OS
// ---------------------------------------------------------------------

/** Kinds of work, for comparing estimate vs actual by service type. Mirrors the pricing packages plus service areas. */
export const SERVICE_TYPES = [
  "WEBSITE",
  "ECOMMERCE",
  "WEB_APP",
  "INTERNAL_TOOL",
  "AUTOMATION",
  "AI_SYSTEM",
  "MOBILE_APP",
  "INTEGRATION",
  "PLATFORM",
  "MODERNISATION",
  "OTHER",
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const INVOICE_KINDS = ["MILESTONE", "CHANGE", "RECURRING", "OTHER"] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];
export const INVOICE_STATUSES = ["DRAFT", "ISSUED", "PAID", "VOID"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const PAYMENT_METHODS = ["BANK", "UPI", "CARD", "CASH", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
/** AI spend from the ledger is added automatically; EXTERNAL_AI is for API bills paid outside the ledger. */
export const COST_CATEGORIES = ["HUMAN", "INFRA", "EXTERNAL_AI", "OTHER"] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];
export const SUBSCRIPTION_STATUSES = ["ACTIVE", "PAUSED", "CANCELLED"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

// ---------------------------------------------------------------------
// Phase 4: Knowledge and IP
// ---------------------------------------------------------------------

export const ASSET_CATEGORIES = [
  "UI_COMPONENTS",
  "AUTHENTICATION",
  "PAYMENTS",
  "DASHBOARDS",
  "ADMIN_PANELS",
  "FORMS",
  "EMAIL",
  "NOTIFICATIONS",
  "AI_INTEGRATIONS",
  "DATABASE_PATTERNS",
  "DEPLOYMENT_TEMPLATES",
  "MONITORING",
  "TESTING",
  "SECURITY",
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

/** EXPERIMENTAL until first used on a project, USED_ONCE after one, PROVEN after three. */
export const ASSET_MATURITY = ["EXPERIMENTAL", "USED_ONCE", "PROVEN"] as const;
export type AssetMaturity = (typeof ASSET_MATURITY)[number];
export const PROVEN_AFTER_PROJECTS = 3;

export const SUPPORT_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export const SUPPORT_PRIORITIES = ["LOW", "NORMAL", "URGENT"] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export function isClientRole(role: string | null | undefined): boolean {
  return role === "CLIENT_ADMIN" || role === "CLIENT_USER";
}

// Prospecting (src/lib/prospecting, /docs/product/prospecting.md)
export const PROSPECT_SEGMENTS = ["LOCAL_SERVICE", "RETAIL_D2C", "SME_OPS"] as const;
export type ProspectSegment = (typeof PROSPECT_SEGMENTS)[number];
export const PROSPECT_SEGMENT_LABELS: Record<ProspectSegment, string> = {
  LOCAL_SERVICE: "Local service businesses",
  RETAIL_D2C: "Shops, restaurants, D2C",
  SME_OPS: "SMEs on spreadsheets / WhatsApp",
};

export const PROSPECT_SOURCES = ["PLACES", "WEB", "MANUAL"] as const;
export type ProspectSource = (typeof PROSPECT_SOURCES)[number];

export const PROSPECT_STATUSES = ["NEW", "AUDITED", "DRAFTED", "CONTACTED", "REPLIED", "CONVERTED", "DISMISSED", "DO_NOT_CONTACT"] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];
/** Still worth working: shown by default on the prospects list. */
export const OPEN_PROSPECT_STATUSES: readonly ProspectStatus[] = ["NEW", "AUDITED", "DRAFTED", "CONTACTED", "REPLIED"];

export const OUTREACH_CHANNELS = ["EMAIL", "WHATSAPP"] as const;
export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];
// APPROVED: an email a person approved, waiting for its paced send slot (src/lib/prospecting/worker.ts).
export const OUTREACH_STATUSES = ["DRAFT", "APPROVED", "SENT", "FAILED", "CANCELLED"] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export const CAMPAIGN_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "DONE"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
