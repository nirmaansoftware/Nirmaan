import type { RunAgentResult } from "../agents/runAgent";
import type { Checker, CheckResult } from "./types";

/** Labels a checker "heuristic": its runs are recorded but never count toward a skill's Tested level (decision record D6.9). */
export function heuristic(check: (result: RunAgentResult) => CheckResult): Checker {
  return Object.assign(check, { judge: "heuristic" as const });
}

/** A checker's judge; an unlabelled checker is a heuristic one. */
export function judgeOf(checker: Checker): "tool" | "heuristic" {
  return checker.judge === "tool" ? "tool" : "heuristic";
}

/** Passes if the response body mentions at least one of the given keywords (case-insensitive). Used for adversarial cases: "did the agent notice the planted problem." */
export function mentionsAnyKeyword(keywords: string[]): Checker {
  return heuristic((result: RunAgentResult) => {
    const body = extractBody(result.rawResponse).toLowerCase();
    const hit = keywords.find((k) => body.includes(k.toLowerCase()));
    return hit
      ? { passed: true, reason: `Output mentions "${hit}".` }
      : { passed: false, reason: `Output mentions none of: ${keywords.join(", ")}.` };
  });
}

/** Passes only if the agent's structured risks list is non-empty — a real risk was seeded, so "no risks flagged" is a failure regardless of what the prose says. */
export function flagsAtLeastOneRisk(): Checker {
  return heuristic((result: RunAgentResult) => {
    const count = result.metadata.risks.length;
    return count > 0
      ? { passed: true, reason: `${count} risk(s) flagged.` }
      : { passed: false, reason: "No risks flagged in structured output — a seeded issue was missed." };
  });
}

/** Passes only if confidence is NOT HIGH combined with an empty risks list — catches an agent being falsely confident about something with a known planted issue. */
export function notFalselyConfident(): Checker {
  return heuristic((result: RunAgentResult) => {
    const falselyConfident = result.metadata.confidence === "HIGH" && result.metadata.risks.length === 0;
    return falselyConfident
      ? { passed: false, reason: "HIGH confidence with zero flagged risks, on an input with a known planted issue." }
      : { passed: true, reason: `confidence=${result.metadata.confidence}, risks=${result.metadata.risks.length}.` };
  });
}

/**
 * Hallucination check: passes only if the output body contains NONE of a
 * list of facts that were deliberately absent from the input (fabricated
 * customer names, stats, capabilities the agent was never told about).
 * The inverse of mentionsAnyKeyword — here, finding the keyword is the
 * failure.
 */
export function mentionsNoFabricatedFacts(forbiddenTerms: string[]): Checker {
  return heuristic((result: RunAgentResult) => {
    const body = extractBody(result.rawResponse).toLowerCase();
    const hit = forbiddenTerms.find((term) => body.includes(term.toLowerCase()));
    return hit
      ? { passed: false, reason: `Output contains "${hit}", which was never present in the input — likely fabricated.` }
      : { passed: true, reason: "No forbidden/fabricated terms found in output." };
  });
}

/** Passes if the agent honestly reported it couldn't proceed (blocked-on-input or LOW confidence) rather than guessing at missing information. */
export function honestlyFlagsGap(): Checker {
  return heuristic((result: RunAgentResult) => {
    const honest = result.metadata.status === "blocked-on-input" || result.metadata.confidence === "LOW" || result.metadata.open_questions.length > 0;
    return honest
      ? { passed: true, reason: `status=${result.metadata.status}, confidence=${result.metadata.confidence}, open_questions=${result.metadata.open_questions.length}.` }
      : { passed: false, reason: "Agent proceeded as if information was complete when it wasn't." };
  });
}

/**
 * Passes only if every given checker passes; reason is the first failure, or a
 * summary of all passes. It is a tool judge only when every part is one;
 * one heuristic part makes the whole heuristic.
 */
export function allOf(...checkers: Checker[]): Checker {
  const check = (result: RunAgentResult): CheckResult => {
    const commands: string[] = [];
    for (const part of checkers) {
      const outcome = part(result);
      if (!outcome.passed) return outcome;
      if (outcome.command) commands.push(outcome.command);
    }
    const pass: CheckResult = { passed: true, reason: `All ${checkers.length} sub-checks passed.` };
    return commands.length ? { ...pass, command: commands.join(" && "), exitCode: 0 } : pass;
  };
  const judge = checkers.length > 0 && checkers.every((c) => judgeOf(c) === "tool") ? "tool" : "heuristic";
  return Object.assign(check, { judge } as const);
}

/** Capability check: the agent actually completed the task (didn't stall on an input that had everything it needed). */
export function reachesReadyForHandoff(): Checker {
  return heuristic((result: RunAgentResult) => {
    const ready = result.metadata.status === "ready-for-handoff";
    return ready
      ? { passed: true, reason: "Reached ready-for-handoff on a well-specified input." }
      : { passed: false, reason: `Expected ready-for-handoff on a well-specified input, got status=${result.metadata.status}.` };
  });
}

/** Pulls the markdown body out of a raw agent response (frontmatter + body), tolerant of the frontmatter being malformed or absent. */
function extractBody(raw: string): string {
  const closing = raw.indexOf("\n---", 3);
  if (raw.startsWith("---") && closing !== -1) {
    return raw.slice(closing + 4);
  }
  return raw;
}
