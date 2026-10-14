/**
 * A free, deterministic heuristic that nudges the model tier for one
 * specific task instance up or down from its agent role's baseline —
 * separate from lib/ai/router.ts's TaskType routing, which reflects what
 * KIND of reasoning a role generally needs (Principal Architect always
 * needs deep reasoning; Content Strategist rarely does). This adjusts
 * around that baseline per-instance, so a genuinely trivial
 * "requirements" task doesn't always pay for Sonnet, and a genuinely
 * gnarly one doesn't get stuck on Haiku.
 *
 * Deliberately NOT a second model call: spending tokens to decide how
 * many tokens to spend defeats the point for something this cheap to
 * approximate with plain string matching. If this ever needs to be
 * smarter than keyword/length matching, that's exactly what the
 * "classification" TaskType (a cheap Haiku triage call, already reserved
 * in lib/ai/router.ts) is for — a deliberate next step, not an oversight.
 */

const COMPLEXITY_UP_SIGNALS = [
  "multi-tenant",
  "microservice",
  "distributed",
  "real-time",
  "compliance",
  "hipaa",
  "pci",
  "soc 2",
  "migration",
  "legacy system",
  "integrate with",
  "high availability",
  "disaster recovery",
  "multi-region",
  "enterprise",
  "sso",
  "single sign-on",
  "audit trail",
  "concurrency",
  "race condition",
  "scalability",
  "load balan",
];

const COMPLEXITY_DOWN_SIGNALS = [
  "one-page",
  "one page",
  "single page",
  "static site",
  "brochure",
  "no backend",
  "no database",
  "no cms",
  "simple",
  "just a",
  "straightforward",
  "personal project",
  "prototype",
  "placeholder",
  "favor for",
];

const LONG_INPUT_WORD_COUNT = 200;
const SHORT_INPUT_WORD_COUNT = 20;

export interface ComplexityEstimate {
  adjustment: -1 | 0 | 1;
  reasons: string[];
}

/** Analyzes free-text task input (title + description) and returns a one-tier adjustment with the specific signals that drove it, for transparency in the Event log. */
export function estimateComplexity(text: string): ComplexityEstimate {
  const lower = text.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  for (const signal of COMPLEXITY_UP_SIGNALS) {
    if (lower.includes(signal)) {
      score += 1;
      reasons.push(`mentions "${signal}"`);
    }
  }
  for (const signal of COMPLEXITY_DOWN_SIGNALS) {
    if (lower.includes(signal)) {
      score -= 1;
      reasons.push(`mentions "${signal}"`);
    }
  }

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > LONG_INPUT_WORD_COUNT) {
    score += 1;
    reasons.push(`long input (${wordCount} words)`);
  } else if (wordCount > 0 && wordCount < SHORT_INPUT_WORD_COUNT) {
    score -= 1;
    reasons.push(`short input (${wordCount} words)`);
  }

  const adjustment: -1 | 0 | 1 = score > 0 ? 1 : score < 0 ? -1 : 0;
  return { adjustment, reasons };
}

/** Cheapest-to-most-capable order for the models this system actually routes to. */
export const MODEL_TIERS = ["claude-haiku-4-5-20251001", "claude-sonnet-5", "claude-opus-5"];

/**
 * Steps a model id one tier up/down/unchanged. A model this system
 * doesn't recognize (not in MODEL_TIERS) passes through completely
 * unchanged — a heuristic that doesn't recognize a model should never
 * silently do something to it.
 */
export function adjustModelForComplexity(baseModel: string, adjustment: -1 | 0 | 1): string {
  const index = MODEL_TIERS.indexOf(baseModel);
  if (index === -1 || adjustment === 0) return baseModel;
  const newIndex = Math.min(Math.max(index + adjustment, 0), MODEL_TIERS.length - 1);
  return MODEL_TIERS[newIndex];
}
