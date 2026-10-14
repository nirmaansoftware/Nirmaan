import { PROJECT_STAGES, type ProjectStage } from "../db/enums";

/**
 * What the client sees: five plain phases instead of fifteen internal stages.
 * Internal stage names, agent activity and gate mechanics never reach the
 * client page; only the phase, a percentage and the next thing we need
 * from them.
 */
export const CLIENT_PHASES = ["Discovery", "Design", "Development", "Testing", "Deployment"] as const;
export type ClientPhase = (typeof CLIENT_PHASES)[number];

const PHASE_OF: Record<ProjectStage, ClientPhase | "Live"> = {
  LEAD: "Discovery",
  DISCOVERY: "Discovery",
  REQUIREMENTS: "Discovery",
  ESTIMATION: "Discovery",
  PROPOSAL: "Discovery",
  APPROVED: "Discovery",
  PLANNING: "Design",
  DESIGN: "Design",
  ARCHITECTURE: "Design",
  IMPLEMENTATION: "Development",
  QA: "Testing",
  SECURITY_REVIEW: "Testing",
  DEPLOYMENT: "Deployment",
  MONITORING: "Live",
  MAINTENANCE: "Live",
};

const CURRENT_MILESTONE: Partial<Record<ProjectStage, string>> = {
  APPROVED: "Kick-off and planning",
  PLANNING: "Implementation plan",
  DESIGN: "Interface design",
  ARCHITECTURE: "Technical design",
  IMPLEMENTATION: "Building your system",
  QA: "Testing",
  SECURITY_REVIEW: "Final security review",
  DEPLOYMENT: "Going live",
  MONITORING: "Live and monitored",
  MAINTENANCE: "Live, under maintenance",
};

const CLIENT_NEXT_ACTION: Partial<Record<ProjectStage, string>> = {
  APPROVED: "Nothing needed from you yet. We'll share the plan shortly.",
  PLANNING: "Review the implementation plan when we send it.",
  DESIGN: "Review the designs when we share them.",
  IMPLEMENTATION: "Nothing needed from you right now.",
  QA: "Nothing needed from you right now.",
  SECURITY_REVIEW: "Get ready to review the staging version.",
  DEPLOYMENT: "Review the staging version and approve handover.",
  MONITORING: "Tell us if anything isn't working as expected.",
  MAINTENANCE: "Raise a support request any time.",
};

export interface ClientProgress {
  percent: number;
  phases: { name: ClientPhase; state: "done" | "current" | "todo" }[];
  live: boolean;
  milestone: string;
  nextAction: string;
}

export function clientProgress(stage: string): ClientProgress {
  const s = (PROJECT_STAGES as readonly string[]).includes(stage) ? (stage as ProjectStage) : "APPROVED";
  const phase = PHASE_OF[s];
  const live = phase === "Live";
  const currentIndex = live ? CLIENT_PHASES.length : CLIENT_PHASES.indexOf(phase);

  // Progress runs from APPROVED (0%) to MONITORING (100%) through the internal
  // stages, so it moves every time we move, not only between phases.
  const from = PROJECT_STAGES.indexOf("APPROVED");
  const to = PROJECT_STAGES.indexOf("MONITORING");
  const at = PROJECT_STAGES.indexOf(s);
  const percent = Math.max(0, Math.min(100, Math.round(((at - from) / (to - from)) * 100)));

  return {
    percent,
    live,
    phases: CLIENT_PHASES.map((name, i) => ({
      name,
      state: i < currentIndex ? "done" : i === currentIndex ? "current" : "todo",
    })),
    milestone: CURRENT_MILESTONE[s] ?? "Getting started",
    nextAction: CLIENT_NEXT_ACTION[s] ?? "Nothing needed from you right now.",
  };
}

/** The stage after `stage` in the lifecycle, or null at the end. */
export function nextStage(stage: string): ProjectStage | null {
  const i = PROJECT_STAGES.indexOf(stage as ProjectStage);
  return i >= 0 && i < PROJECT_STAGES.length - 1 ? PROJECT_STAGES[i + 1] : null;
}
