import type { Role } from "../db/enums";

/**
 * Capability-based access control.
 *
 * Code asks "can this actor do X?", never "is this actor a FOUNDER?". Roles
 * are just named bundles of capabilities, so a new role (or a changed
 * responsibility) is one edit here, not a hunt through pages and actions.
 *
 * Every server action and every page checks a capability on the server.
 * Hiding a button is a courtesy, never the control.
 */
export const CAPABILITIES = [
  // Pipeline
  "lead:read",
  "lead:write",
  "discovery:run", // spends AI budget
  "prospect:read",
  "prospect:run", // finds and audits businesses: spends AI and Google Places budget
  "outreach:send", // contacts a business in the company's name
  "growth:read", // owners only: the Growth dashboard (every outreach message, reply and lead) and autopilot settings
  "requirement:write",
  "proposal:read",
  "proposal:write",
  "proposal:send", // client-facing, commits the company to a price
  "economics:read", // internal cost / margin estimates
  // Delivery
  "project:read",
  "project:write", // stage moves, gate requests, client status links
  "trace:write", // features, test cases, links
  "evidence:write",
  "change:write",
  "change:decide", // accepts cost/timeline impact on behalf of the company
  "approval:decide", // quality gates
  // AI software factory (Phase 2)
  "factory:run", // spends AI budget on architecture, planning and task dispatch
  "factory:review", // accepts an architecture or plan, which creates real project structure
  // Money (Phase 3)
  "finance:read", // invoices, payments, costs, actual margins
  "finance:write", // issue invoices, record payments and costs, subscriptions, finance settings
  // Knowledge & IP (Phase 4)
  "knowledge:read",
  "knowledge:write",
  "ip:write", // reusable asset library
  "support:write", // respond to client support requests
  // Company
  "dashboard:read",
  "ai:read", // AI usage & cost ledger
  "audit:read",
  "user:manage",
  // Client capabilities (exercised through capability links in Phase 1)
  "client:proposal:respond",
  "client:project:status",
  "client:invoices:read",
  "client:support:write",
  "client:change:request",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const ALL_INTERNAL: Capability[] = CAPABILITIES.filter((c) => !c.startsWith("client:"));

export const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  FOUNDER: ALL_INTERNAL,
  CTO: ALL_INTERNAL.filter((c) => c !== "user:manage" && c !== "growth:read"),
  PROJECT_MANAGER: [
    "lead:read",
    "lead:write",
    "discovery:run",
    "prospect:read",
    "prospect:run",
    "requirement:write",
    "proposal:read",
    "proposal:write",
    "proposal:send",
    "economics:read",
    "project:read",
    "project:write",
    "trace:write",
    "change:write",
    "dashboard:read",
    "ai:read",
    "factory:run",
    "knowledge:read",
    "knowledge:write",
    "support:write",
  ],
  ENGINEER: ["project:read", "trace:write", "evidence:write", "knowledge:read", "knowledge:write", "ip:write"],
  DESIGNER: ["project:read", "trace:write", "knowledge:read", "knowledge:write", "ip:write"],
  QA: ["project:read", "trace:write", "evidence:write", "knowledge:read", "knowledge:write"],
  FINANCE: ["lead:read", "proposal:read", "economics:read", "project:read", "dashboard:read", "ai:read", "finance:read", "finance:write", "knowledge:read"],
  SUPPORT: ["lead:read", "project:read", "change:write", "knowledge:read", "knowledge:write", "support:write"],
  // Client accounts only ever see their own client's data (enforced in src/lib/portal).
  CLIENT_ADMIN: ["client:proposal:respond", "client:project:status", "client:invoices:read", "client:support:write", "client:change:request"],
  CLIENT_USER: ["client:project:status", "client:support:write"],
};

export function can(role: Role | string | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  const granted = ROLE_CAPABILITIES[role as Role];
  return granted ? granted.includes(capability) : false;
}

export class ForbiddenError extends Error {
  constructor(public readonly capability: Capability) {
    super(`You don't have permission to do this (needs "${capability}").`);
    this.name = "ForbiddenError";
  }
}

export function assertCan(role: Role | string | null | undefined, capability: Capability): void {
  if (!can(role, capability)) throw new ForbiddenError(capability);
}

/** Human labels for the team screen. */
export const ROLE_LABELS: Record<Role, string> = {
  FOUNDER: "Founder / Admin",
  CTO: "CTO",
  PROJECT_MANAGER: "Project manager",
  ENGINEER: "Engineer",
  DESIGNER: "Designer",
  QA: "QA",
  FINANCE: "Finance",
  SUPPORT: "Support",
  CLIENT_ADMIN: "Client admin",
  CLIENT_USER: "Client user",
};
