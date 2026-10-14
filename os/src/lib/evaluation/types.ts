import type { RunAgentResult } from "../agents/runAgent";

/**
 * The four eval categories named explicitly in the architecture plan's
 * Section 37: capability ("can it do the basic job"), regression ("did a
 * change break something that used to work"), hallucination ("does it
 * invent facts not present in its input"), adversarial ("does a
 * deliberately planted problem in the input get caught, not missed").
 */
export type EvalCategory = "capability" | "regression" | "hallucination" | "adversarial";

/**
 * A checker inspects an agent's actual RunAgentResult and decides pass/
 * fail with a human-readable reason. Deliberately synchronous and cheap —
 * these are structural/heuristic checks (keyword presence, confidence
 * level, risks list non-empty), not a second model call grading the
 * first. That's a real limitation: a checker can confirm an agent MENTIONED
 * a risk, not that its reasoning about the risk was actually good. See
 * README for what this harness does and doesn't prove.
 */
export type Checker = (result: RunAgentResult) => { passed: boolean; reason: string };

export interface EvalCase {
  id: string;
  agentSlug: string;
  category: EvalCategory;
  description: string;
  /** The userInput to run the agent against — often includes a deliberately seeded bug/vulnerability/gap for the checker to look for evidence of. */
  input: string;
  taskType: import("@/lib/ai/router").TaskType;
  outputRelativePath: string;
  expectedOutcome: string;
  checker: Checker;
}

export interface EvalRunResult {
  case: EvalCase;
  passed: boolean;
  reason: string;
  rawOutput: string;
}
