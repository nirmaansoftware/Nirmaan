import { prisma } from "../db/client";
import { nextCode, prefixOf, type IdPrefix } from "../ids";
import { audit } from "../audit";
import { assertCan } from "../auth/permissions";
import type { Actor } from "../auth/actor";
import { decodeStringList } from "../db/json";
import { FEATURE_STATUSES, TEST_LEVELS, isOneOf, type TraceRelation } from "../db/enums";

/**
 * The project knowledge graph: REQ → FEAT → TASK → TEST → DEPLOY.
 *
 * Nodes are the existing rows (Requirement, Feature, Task, TestCase,
 * Deployment), addressed by their human-readable codes. Edges are TraceLink
 * rows. Each relation only connects the node types it makes sense for,
 * so the graph can't drift into "REQ-3 is implemented by TEST-9".
 */
export const RELATION_RULES: Record<TraceRelation, { from: IdPrefix[]; to: IdPrefix[] }> = {
  SATISFIED_BY: { from: ["REQ"], to: ["FEAT"] },
  IMPLEMENTED_BY: { from: ["FEAT"], to: ["TASK"] },
  VERIFIED_BY: { from: ["REQ", "FEAT", "TASK"], to: ["TEST"] },
  SHIPPED_IN: { from: ["FEAT", "TASK"], to: ["DEPLOY"] },
};

/** Which relation joins two codes, or null if they can't be linked. */
export function relationBetween(fromCode: string, toCode: string): TraceRelation | null {
  const from = prefixOf(fromCode);
  const to = prefixOf(toCode);
  if (!from || !to) return null;
  const hit = (Object.entries(RELATION_RULES) as [TraceRelation, { from: IdPrefix[]; to: IdPrefix[] }][]).find(
    ([, rule]) => rule.from.includes(from) && rule.to.includes(to)
  );
  return hit ? hit[0] : null;
}

/** Confirms a code exists on this project. */
async function nodeExists(projectId: string, code: string): Promise<boolean> {
  switch (prefixOf(code)) {
    case "REQ":
      return !!(await prisma.requirement.findFirst({ where: { code, projectId } }));
    case "FEAT":
      return !!(await prisma.feature.findFirst({ where: { code, projectId } }));
    case "TASK":
      return !!(await prisma.task.findFirst({ where: { code, projectId } }));
    case "TEST":
      return !!(await prisma.testCase.findFirst({ where: { code, projectId } }));
    case "DEPLOY":
      return !!(await prisma.deployment.findFirst({ where: { code, projectId } }));
    default:
      return false;
  }
}

export async function link(actor: Actor, projectId: string, fromCode: string, toCode: string) {
  assertCan(actor.role, "trace:write");
  const from = fromCode.trim().toUpperCase();
  const to = toCode.trim().toUpperCase();
  const relation = relationBetween(from, to);
  if (!relation) throw new Error(`${from} can't be linked to ${to}. Links go REQ → FEAT → TASK → TEST → DEPLOY.`);
  for (const code of [from, to]) {
    if (!(await nodeExists(projectId, code))) throw new Error(`${code} isn't part of this project.`);
  }
  const edge = await prisma.traceLink.upsert({
    where: { fromCode_toCode_relation: { fromCode: from, toCode: to, relation } },
    create: { projectId, fromCode: from, toCode: to, relation },
    update: {},
  });
  await audit(actor, "trace.linked", "TraceLink", edge.id, `${from} ${relation} ${to}`);
  return edge;
}

export async function addFeature(actor: Actor, projectId: string, input: { title: string; description?: string; requirementCode?: string }) {
  assertCan(actor.role, "trace:write");
  const title = input.title.trim();
  if (title.length < 3) throw new Error("Give the feature a name.");
  const feature = await prisma.$transaction(async (tx) => {
    const code = await nextCode("FEAT", tx);
    return tx.feature.create({ data: { code, projectId, title, description: input.description?.trim() || null } });
  });
  await audit(actor, "trace.feature_added", "Feature", feature.id, feature.code);
  if (input.requirementCode?.trim()) await link(actor, projectId, input.requirementCode, feature.code);
  return feature;
}

export async function setFeatureStatus(actor: Actor, featureId: string, status: string) {
  assertCan(actor.role, "trace:write");
  if (!isOneOf(FEATURE_STATUSES, status)) throw new Error(`Unknown feature status "${status}".`);
  return prisma.feature.update({ where: { id: featureId }, data: { status } });
}

export async function addTestCase(actor: Actor, projectId: string, input: { title: string; level: string; verifiesCode?: string }) {
  assertCan(actor.role, "trace:write");
  const title = input.title.trim();
  if (title.length < 3) throw new Error("Describe what the test checks.");
  if (!isOneOf(TEST_LEVELS, input.level)) throw new Error("Choose a test level.");
  const tc = await prisma.$transaction(async (tx) => {
    const code = await nextCode("TEST", tx);
    return tx.testCase.create({ data: { code, projectId, title, level: input.level } });
  });
  await audit(actor, "trace.test_added", "TestCase", tc.id, tc.code);
  if (input.verifiesCode?.trim()) await link(actor, projectId, input.verifiesCode, tc.code);
  return tc;
}

/**
 * Evidence, not claims. A result is derived from the numbers: anything short
 * of total/total passing is a FAIL, whatever the summary says.
 */
export async function recordEvidence(
  actor: Actor,
  testCaseId: string,
  input: { passed: number; total: number; summary: string; link?: string }
) {
  assertCan(actor.role, "evidence:write");
  const { passed, total } = input;
  if (!Number.isInteger(total) || total <= 0) throw new Error("Total must be at least 1.");
  if (!Number.isInteger(passed) || passed < 0 || passed > total) throw new Error("Passed must be between 0 and the total.");
  const summary = input.summary.trim();
  if (!summary) throw new Error("Say what was run, e.g. \"CI run #412, unit suite\".");
  const link = input.link?.trim() || null;
  if (link && !/^https?:\/\//.test(link)) throw new Error("Evidence links must start with http:// or https://.");

  const evidence = await prisma.evidence.create({
    data: { testCaseId, passed, total, result: passed === total ? "PASS" : "FAIL", summary, link, recordedBy: actor.label },
  });
  await audit(actor, "trace.evidence_recorded", "Evidence", evidence.id, `${passed}/${total} ${evidence.result}`);
  return evidence;
}

export interface TraceRow {
  code: string;
  statement: string;
  priority: string;
  acceptanceCriteria: string[];
  features: string[];
  tasks: string[];
  tests: { code: string; title: string; level: string; latest: { result: string; passed: number; total: number } | null }[];
  deployments: string[];
  /** The honest summary: what's still unproven about this requirement. */
  gaps: string[];
}

/**
 * The traceability matrix for a project: for each requirement, what
 * satisfies it, what implements that, what verifies it, what shipped it,
 * and which of those links are still missing.
 */
export async function traceMatrix(projectId: string): Promise<TraceRow[]> {
  const [requirements, links, tests] = await Promise.all([
    // WONT requirements are agreed exclusions: nothing is built or tested for them.
    prisma.requirement.findMany({ where: { projectId, status: { not: "DROPPED" }, priority: { not: "WONT" } }, orderBy: { code: "asc" } }),
    prisma.traceLink.findMany({ where: { projectId } }),
    prisma.testCase.findMany({ where: { projectId }, include: { evidence: { orderBy: { recordedAt: "desc" }, take: 1 } } }),
  ]);
  const out = new Map<string, { to: string; relation: string }[]>();
  for (const l of links) out.set(l.fromCode, [...(out.get(l.fromCode) ?? []), { to: l.toCode, relation: l.relation }]);
  const targets = (code: string, relation: TraceRelation) => (out.get(code) ?? []).filter((e) => e.relation === relation).map((e) => e.to);
  const testByCode = new Map(tests.map((t) => [t.code, t]));

  return requirements.map((r) => {
    const features = targets(r.code, "SATISFIED_BY");
    const tasks = features.flatMap((f) => targets(f, "IMPLEMENTED_BY"));
    const testCodes = [...new Set([r.code, ...features, ...tasks].flatMap((c) => targets(c, "VERIFIED_BY")))];
    const deployments = [...new Set([...features, ...tasks].flatMap((c) => targets(c, "SHIPPED_IN")))];
    const testsOut = testCodes.map((code) => {
      const t = testByCode.get(code);
      const ev = t?.evidence[0];
      return {
        code,
        title: t?.title ?? "",
        level: t?.level ?? "",
        latest: ev ? { result: ev.result, passed: ev.passed, total: ev.total } : null,
      };
    });

    const gaps: string[] = [];
    if (!features.length) gaps.push("No feature satisfies it yet.");
    else if (!tasks.length) gaps.push("No task implements it yet.");
    if (!testsOut.length) gaps.push("No test verifies it.");
    else if (testsOut.some((t) => !t.latest)) gaps.push("A linked test has no evidence recorded.");
    else if (testsOut.some((t) => t.latest?.result === "FAIL")) gaps.push("Latest evidence includes a failure.");
    if (!deployments.length) gaps.push("Not shipped in any deployment.");

    return {
      code: r.code,
      statement: r.statement,
      priority: r.priority,
      acceptanceCriteria: decodeStringList(r.acceptanceCriteria),
      features,
      tasks,
      tests: testsOut,
      deployments,
      gaps,
    };
  });
}

/** Reverse question: "why does this exist?" All requirements upstream of a code. */
export async function upstreamRequirements(projectId: string, code: string): Promise<string[]> {
  const links = await prisma.traceLink.findMany({ where: { projectId } });
  const parents = new Map<string, string[]>();
  for (const l of links) parents.set(l.toCode, [...(parents.get(l.toCode) ?? []), l.fromCode]);
  const found = new Set<string>();
  const stack = [code.toUpperCase()];
  const seen = new Set<string>();
  while (stack.length) {
    const c = stack.pop()!;
    if (seen.has(c)) continue;
    seen.add(c);
    if (prefixOf(c) === "REQ" && c !== code.toUpperCase()) found.add(c);
    stack.push(...(parents.get(c) ?? []));
  }
  return [...found].sort();
}

/** A task created from the traceability view, optionally implementing a feature. */
export async function addTask(actor: Actor, projectId: string, input: { title: string; featureCode?: string }) {
  assertCan(actor.role, "trace:write");
  const title = input.title.trim();
  if (title.length < 3) throw new Error("Give the task a title.");
  const task = await prisma.$transaction(async (tx) => {
    const code = await nextCode("TASK", tx);
    return tx.task.create({ data: { code, projectId, title, status: "BACKLOG" } });
  });
  await audit(actor, "trace.task_added", "Task", task.id, task.code!);
  if (input.featureCode?.trim()) await link(actor, projectId, input.featureCode, task.code!);
  return task;
}

/**
 * Records that a deployment happened (Phase 1 records; Phase 2 automates
 * this from the pipeline). Production deployments require the PRODUCTION
 * gate to have been approved for this project.
 */
export async function recordDeployment(
  actor: Actor,
  projectId: string,
  input: { environment: string; succeeded: boolean; rollbackPlan?: string }
) {
  assertCan(actor.role, "project:write");
  const environment = input.environment.trim().toLowerCase();
  if (!["preview", "staging", "production"].includes(environment)) throw new Error("Environment must be preview, staging or production.");
  if (environment === "production") {
    const approved = await prisma.approval.findFirst({ where: { projectId, gate: "PRODUCTION", status: "APPROVED" } });
    if (!approved) throw new Error("Production needs an approved PRODUCTION gate first.");
    if (!input.rollbackPlan?.trim()) throw new Error("Write the rollback plan before recording a production deployment.");
  }
  const dep = await prisma.$transaction(async (tx) => {
    const code = await nextCode("DEPLOY", tx);
    return tx.deployment.create({
      data: {
        code,
        projectId,
        environment,
        status: input.succeeded ? "SUCCEEDED" : "FAILED",
        deployedAt: new Date(),
        rollbackPlan: input.rollbackPlan?.trim() || null,
      },
    });
  });
  await audit(actor, "deployment.recorded", "Deployment", dep.id, `${dep.code} ${environment} ${dep.status}`);
  return dep;
}
