import type { TaskType } from "@/lib/ai/router";

/**
 * Maps each agent to the model-router TaskType its work falls under. This
 * is deliberately a static, explicit table — not inferred from the agent's
 * role string — so a new agent requires a conscious decision here, per the
 * "no hidden magic" principle in the architecture plan.
 */
export const AGENT_TASK_TYPES: Record<string, TaskType> = {
  orchestrator: "architecture", // conflict resolution / gate decisions need the stronger reasoning tier, not cheap triage
  "product-manager": "requirements",
  "business-analyst": "requirements",
  "market-research": "research",
  "brand-strategist": "content",
  "content-strategist": "content",
  "technical-writer": "content",
  "seo-specialist": "content",
  "creative-director": "content",
  "ux-designer": "content",
  "ui-designer": "content",
  "design-system-engineer": "code",
  "principal-architect": "architecture",
  "frontend-engineer": "code",
  "backend-engineer": "code",
  "database-engineer": "code",
  "ai-ml-engineer": "code",
  "devops-engineer": "code",
  "security-engineer": "architecture",
  "qa-engineer": "code",
  "performance-engineer": "code",
  sre: "architecture",
  "legal-compliance": "content",
  "client-communication": "content",
  "finance-estimation": "content",
  "legal-counsel": "architecture", // contract drafting is high-stakes reasoning, like security review
  "tax-accounts": "content",
  "sales-partnerships": "content",
  "founder-proxy": "architecture", // reviews founder-class PRs only; the strongest tier, like key 2
  // Hires of the org chart (docs/operations/capability-hierarchy-decisions.md, section 4).
  "appsec-engineer": "architecture", // security review, like security-engineer
  "head-of-commercial": "content",
  "privacy-counsel": "architecture", // privacy drafting is high-stakes reasoning, like legal-counsel
  "licensing-counsel": "architecture", // licence analysis is high-stakes reasoning, like legal-counsel
  "head-of-capability": "architecture", // structural decisions about the organisation, like the orchestrator
  "org-designer": "content",
  "capability-programme-manager": "requirements",
  "knowledge-quality-reviewer": "content",
};

/**
 * Critical agents: their output shapes architecture, security or delivery
 * for the whole project. They always run on at least their role's baseline
 * model (the complexity heuristic may raise, never lower, it), and every
 * run of theirs gets a mandatory human review task. See
 * /docs/ai/model-routing.md ("criticality routing").
 */
export const CRITICAL_AGENTS: ReadonlySet<string> = new Set([
  "orchestrator",
  "principal-architect",
  "security-engineer",
  "devops-engineer",
  "sre",
]);

/**
 * Default artifact path (relative to /projects/{id}/) each agent writes
 * to when dispatched without an explicit override. Follows the folder
 * convention documented in /projects/README.md.
 */
export const AGENT_OUTPUT_PATHS: Record<string, string> = {
  orchestrator: "reports/orchestrator-notes.md",
  "product-manager": "requirements/prd.md",
  "business-analyst": "requirements/requirements-spec.md",
  "market-research": "research/market-research.md",
  "brand-strategist": "design/brand-positioning.md",
  "content-strategist": "documentation/content-strategy.md",
  "technical-writer": "documentation/technical-content.md",
  "seo-specialist": "documentation/seo-recommendations.md",
  "creative-director": "design/visual-direction.md",
  "ux-designer": "design/ux-spec.md",
  "ui-designer": "design/ui-spec.md",
  "design-system-engineer": "implementation/design-system.md",
  "principal-architect": "architecture/adr.md",
  "frontend-engineer": "implementation/frontend-notes.md",
  "backend-engineer": "implementation/backend-notes.md",
  "database-engineer": "architecture/schema.md",
  "ai-ml-engineer": "architecture/ai-ml-plan.md",
  "devops-engineer": "deployment/deployment-plan.md",
  "security-engineer": "testing/security-report.md",
  "qa-engineer": "testing/test-report.md",
  "performance-engineer": "testing/performance-report.md",
  sre: "deployment/monitoring-plan.md",
  "legal-compliance": "reports/compliance-notes.md",
  "client-communication": "client/communication-draft.md",
  "finance-estimation": "reports/estimate.md",
  "legal-counsel": "reports/legal-draft.md",
  "tax-accounts": "reports/tax-notes.md",
  "sales-partnerships": "reports/sales-plan.md",
  "founder-proxy": "reports/founder-proxy-review.md",
  "appsec-engineer": "testing/appsec-review.md",
  "head-of-commercial": "reports/commercial-review.md",
  "privacy-counsel": "reports/privacy-draft.md",
  "licensing-counsel": "reports/licensing.md",
  "head-of-capability": "reports/capability-review.md",
  "org-designer": "reports/org-design.md",
  "capability-programme-manager": "reports/capability-programme.md",
  "knowledge-quality-reviewer": "reports/knowledge-quality.md",
};

/** Artifact.type value each agent's primary output is recorded as. */
export const AGENT_ARTIFACT_TYPES: Record<string, string> = {
  orchestrator: "ORCHESTRATOR_NOTES",
  "product-manager": "PRD",
  "business-analyst": "REQUIREMENTS_SPEC",
  "market-research": "RESEARCH_REPORT",
  "brand-strategist": "BRAND_POSITIONING",
  "content-strategist": "CONTENT_STRATEGY",
  "technical-writer": "TECHNICAL_CONTENT",
  "seo-specialist": "SEO_RECOMMENDATIONS",
  "creative-director": "VISUAL_DIRECTION",
  "ux-designer": "UX_SPEC",
  "ui-designer": "UI_SPEC",
  "design-system-engineer": "DESIGN_SYSTEM",
  "principal-architect": "ADR",
  "frontend-engineer": "IMPLEMENTATION_NOTES",
  "backend-engineer": "IMPLEMENTATION_NOTES",
  "database-engineer": "SCHEMA",
  "ai-ml-engineer": "AI_ML_PLAN",
  "devops-engineer": "DEPLOYMENT_PLAN",
  "security-engineer": "SECURITY_REPORT",
  "qa-engineer": "TEST_REPORT",
  "performance-engineer": "PERFORMANCE_REPORT",
  sre: "MONITORING_PLAN",
  "legal-compliance": "COMPLIANCE_NOTES",
  "client-communication": "CLIENT_COMMUNICATION_DRAFT",
  "finance-estimation": "ESTIMATE",
  "legal-counsel": "LEGAL_DRAFT",
  "tax-accounts": "TAX_NOTES",
  "sales-partnerships": "SALES_PLAN",
  "founder-proxy": "FOUNDER_PROXY_REVIEW",
  "appsec-engineer": "APPSEC_REVIEW",
  "head-of-commercial": "COMMERCIAL_REVIEW",
  "privacy-counsel": "PRIVACY_DRAFT",
  "licensing-counsel": "LICENSING_ANALYSIS",
  "head-of-capability": "CAPABILITY_REVIEW",
  "org-designer": "ORG_DESIGN",
  "capability-programme-manager": "CAPABILITY_PROGRAMME",
  "knowledge-quality-reviewer": "KNOWLEDGE_QUALITY",
};

export function requireTaskType(agentSlug: string): TaskType {
  const taskType = AGENT_TASK_TYPES[agentSlug];
  if (!taskType) {
    throw new Error(`No model-router task type configured for agent "${agentSlug}" — add one to AGENT_TASK_TYPES.`);
  }
  return taskType;
}

export function requireOutputPath(agentSlug: string): string {
  const outputPath = AGENT_OUTPUT_PATHS[agentSlug];
  if (!outputPath) {
    throw new Error(`No default output path configured for agent "${agentSlug}" — add one to AGENT_OUTPUT_PATHS.`);
  }
  return outputPath;
}

export function artifactTypeFor(agentSlug: string): string {
  return AGENT_ARTIFACT_TYPES[agentSlug] ?? "ARTIFACT";
}
