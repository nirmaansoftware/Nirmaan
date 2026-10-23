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
 * fail with a human-readable reason. Deliberately synchronous, and never a
 * second model call grading the first. The checkers in checkers.ts are
 * structural/heuristic checks (keyword presence, confidence level, risks
 * list non-empty), labelled "heuristic": a checker can confirm an agent
 * MENTIONED a risk, not that its reasoning about the risk was actually good.
 * A tool judge (toolJudge.ts) runs a hidden test suite or a command against
 * the agent's output instead, and is labelled "tool".
 */
export type Checker = ((result: RunAgentResult) => CheckResult) & {
  /** How the verdict is reached. Unlabelled checkers count as "heuristic". */
  judge?: Judge;
};

/**
 * How a checker reaches its verdict, in the words of capability/records:
 * "tool" runs a test suite or a command and passes on exit code 0 (the only
 * judge that can count toward a skill's Tested level); "heuristic" is a
 * keyword or structure check like the ones in checkers.ts, recorded but never
 * counted (decision record D6.9).
 */
export type Judge = "tool" | "heuristic";

export interface CheckResult {
  passed: boolean;
  reason: string;
  /** Tool judge only: the command that ran, and its exit code. */
  command?: string;
  exitCode?: number;
}

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
  /** Skill ids to load into the run (at most 3, each held by the agent). The run's records are written per loaded skill. */
  skills?: string[];
}

export interface EvalRunResult {
  case: EvalCase;
  passed: boolean;
  reason: string;
  rawOutput: string;
  judge: Judge;
  command?: string;
  exitCode?: number;
  model: string;
  provider: string;
  /** The skills the run loaded, as `id@sha` (from the handoff metadata). */
  skills: string[];
}
