/**
 * Handoff metadata every agent artifact carries (Agent Handoff Protocol,
 * see /docs/history/agency-os-plan.md Section 24 / E). Stored as YAML frontmatter
 * on the artifact file itself so the artifact is self-describing.
 */

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export type HandoffStatus =
  | "ready-for-handoff"
  | "blocked-on-input"
  | "in-progress";

export interface HandoffMetadata {
  project: string;
  task?: string;
  agent: string;
  status: HandoffStatus;
  confidence: Confidence;
  assumptions: string[];
  inputs: string[];
  outputs: string[];
  decisions: string[];
  risks: string[];
  open_questions: string[];
  next_agent?: string;
  review_required: boolean;
}

export interface AgentPermissions {
  read?: string;
  write?: string;
  execute?: boolean;
  deploy?: boolean;
  delete?: boolean;
}

export interface AgentDefinition {
  slug: string;
  role: string;
  reviewedBy: string[];
  permissions: AgentPermissions;
  /** Full markdown body (mission, expertise, responsibilities, ... escalation rules) — used as the agent's system prompt. */
  body: string;
}
