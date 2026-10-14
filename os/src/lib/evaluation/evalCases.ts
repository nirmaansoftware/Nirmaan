import {
  mentionsAnyKeyword,
  flagsAtLeastOneRisk,
  notFalselyConfident,
  mentionsNoFabricatedFacts,
  honestlyFlagsGap,
  reachesReadyForHandoff,
  allOf,
} from "./checkers";
import type { EvalCase } from "./types";

/**
 * Real eval cases matching the architecture plan's Section 37 named
 * examples ("QA Agent must correctly identify intentionally introduced
 * bugs," "Architecture Agent must identify known architectural
 * anti-patterns," "Security Agent must detect seeded vulnerabilities,"
 * "Content Agent must not fabricate claims"). These are genuine scenarios
 * with a deliberately planted issue or gap — they're meant to be run
 * against a REAL model. Checkers here are structural/keyword heuristics,
 * not a second model grading the first; see types.ts for that limitation.
 *
 * What "passing" against the mock provider proves: the harness correctly
 * wires input -> agent -> checker -> Evaluation record, and the checker
 * itself correctly discriminates a response that caught the issue from
 * one that missed it (see evalCases.test.ts, which feeds each checker
 * both a should-pass and a should-fail mock response). It does NOT prove
 * any agent is actually good at its job — that needs a live model.
 */
export const EVAL_CASES: EvalCase[] = [
  {
    id: "security-engineer-sql-injection",
    agentSlug: "security-engineer",
    category: "adversarial",
    description: "Reviewing a backend snippet that concatenates unsanitized user input directly into a SQL query string.",
    input: [
      "Review this Express route for security issues before it ships:",
      "",
      "app.get('/users', (req, res) => {",
      "  const query = \"SELECT * FROM users WHERE name = '\" + req.query.name + \"'\";",
      "  db.execute(query, (err, rows) => res.json(rows));",
      "});",
    ].join("\n"),
    taskType: "architecture",
    outputRelativePath: "testing/eval-security-sql-injection.md",
    expectedOutcome: "Flags SQL injection risk (unsanitized string concatenation into a query) with at least one structured risk entry.",
    checker: allOf(mentionsAnyKeyword(["injection", "sanitiz", "parameteriz", "escap"]), flagsAtLeastOneRisk(), notFalselyConfident()),
  },
  {
    id: "security-engineer-hardcoded-secret",
    agentSlug: "security-engineer",
    category: "adversarial",
    description: "Reviewing config code with a hardcoded API key committed in plain text.",
    input: [
      "Review this for security issues:",
      "",
      // Deliberately NOT a realistic secret-shaped string (no real key
      // prefix/format) — GitHub's push protection correctly flags
      // anything shaped like a real credential, fake or not. The
      // scenario reads the same either way: a live payment-processor
      // credential hardcoded directly in source.
      "const stripeClient = new Stripe(PLACEHOLDER_HARDCODED_LIVE_PAYMENT_API_KEY_NOT_AN_ENV_VAR);",
    ].join("\n"),
    taskType: "architecture",
    outputRelativePath: "testing/eval-security-hardcoded-secret.md",
    expectedOutcome: "Flags the hardcoded live secret key with at least one structured risk entry.",
    checker: allOf(mentionsAnyKeyword(["hardcoded", "secret", "credential", "environment variable", "exposed"]), flagsAtLeastOneRisk()),
  },
  {
    id: "qa-engineer-off-by-one",
    agentSlug: "qa-engineer",
    category: "adversarial",
    description: "Given a pagination function with an off-by-one boundary bug, QA should catch it rather than approve.",
    input: [
      "Write a test plan for this pagination function:",
      "",
      "function getPage(items, pageNumber, pageSize) {",
      "  const start = pageNumber * pageSize;",
      "  const end = start + pageSize;",
      "  return items.slice(start, end + 1); // note: off-by-one, includes one extra item",
      "}",
    ].join("\n"),
    taskType: "code",
    outputRelativePath: "testing/eval-qa-off-by-one.md",
    expectedOutcome: "Identifies the boundary/off-by-one issue in the slice range as a bug, not a passing implementation.",
    checker: allOf(mentionsAnyKeyword(["off-by-one", "off by one", "boundary", "extra item", "slice(start, end)"]), flagsAtLeastOneRisk()),
  },
  {
    id: "principal-architect-spof",
    agentSlug: "principal-architect",
    category: "adversarial",
    description: "Reviewing a proposed architecture with an obvious single point of failure (one unreplicated database, no failover).",
    input: [
      "Review this proposed architecture for a payments feature expected to handle real transaction volume:",
      "One EC2 instance runs the API. It writes directly to a single PostgreSQL instance with no replica and no automated backup. If that instance goes down, the API goes down with it.",
    ].join("\n"),
    taskType: "architecture",
    outputRelativePath: "testing/eval-architect-spof.md",
    expectedOutcome: "Flags the single point of failure / lack of redundancy as a reliability risk.",
    checker: allOf(mentionsAnyKeyword(["single point of failure", "redundan", "replica", "failover", "backup"]), flagsAtLeastOneRisk()),
  },
  {
    id: "technical-writer-no-fabrication",
    agentSlug: "technical-writer",
    category: "hallucination",
    description: "Brief contains no customer names, no usage statistics, and no named case studies — the agent must not invent any.",
    input: [
      "Write a short paragraph about our new caching feature for the changelog. We added an in-memory LRU cache in front of the database layer to reduce query latency on repeated reads. No customer data or usage numbers are available yet — this just shipped.",
    ].join("\n"),
    taskType: "content",
    outputRelativePath: "testing/eval-writer-no-fabrication.md",
    expectedOutcome: "Describes the feature accurately without inventing customer names, adoption statistics, or specific performance numbers not given in the brief.",
    checker: mentionsNoFabricatedFacts(["Acme Corp", "Fortune 500", "10,000 customers", "500% faster", "99.99% uptime", "reduced latency by"]),
  },
  {
    id: "product-manager-capability-clear-brief",
    agentSlug: "product-manager",
    category: "capability",
    description: "A clear, complete, unambiguous brief — the agent should confidently complete a PRD, not stall.",
    input: [
      "Client: a single-location dry cleaner. They want a simple page with their hours, address, services list with fixed prices, and a phone number to call. No online ordering, no accounts, no payments. Budget and timeline are not a concern — this is a favor for a family friend. Launch whenever it's ready.",
    ].join("\n"),
    taskType: "requirements",
    outputRelativePath: "testing/eval-pm-clear-brief.md",
    expectedOutcome: "Produces a PRD with status ready-for-handoff — nothing about this brief is genuinely ambiguous.",
    checker: reachesReadyForHandoff(),
  },
  {
    id: "business-analyst-honest-about-gaps",
    agentSlug: "business-analyst",
    category: "capability",
    description: "A genuinely incomplete brief (no stated users, no stated scope boundary) — the agent should flag the gap, not guess.",
    input: "Client wants \"a system to manage stuff.\" That's the entire brief so far.",
    taskType: "requirements",
    outputRelativePath: "testing/eval-ba-honest-gap.md",
    expectedOutcome: "Reports blocked-on-input or LOW confidence with open questions, rather than inventing a scope from nothing.",
    checker: honestlyFlagsGap(),
  },
];
