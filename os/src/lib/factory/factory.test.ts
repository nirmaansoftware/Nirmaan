import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db/client";
import { MockProvider } from "@/lib/ai/providers/mock";
import { nextCode } from "../ids";
import { encodeStringList } from "../db/json";
import { hashToken } from "../auth/tokens";
import { parseArchitecture, reviewRun, runArchitecture } from "./architecture";
import { acceptPlan, parsePlan, runPlanner } from "./planner";
import { runReadyTasks, runnableTasks, setAiBudget } from "./orchestrate";
import { CiAuthError, ingestCiResults, issueCiToken } from "./ci";
import { dispatchTask } from "../orchestrator/dispatch";
import { FOUNDER, actorAs, cleanupProjectGraph } from "../testHelpers/businessFixtures";
import { seedFixtureProject } from "../testHelpers/fixtureProject";

const ARCH = JSON.stringify({
  summary: "A small web app on a single server with a SQLite database.",
  recommendation: "One server-rendered web app, one SQLite database, WhatsApp reminders via an approved template provider.",
  complexity: "LOW",
  complexityJustification: "Under 20 users and one workflow; nothing needs more.",
  buildVsBuy: [{ option: "Off-the-shelf CRM", verdict: "SKIP", why: "Too generic for their deposit flow." }],
  components: [{ name: "database", choice: "SQLite with nightly backups", why: "One writer, tiny data." }],
  tradeoffs: ["Single server means brief downtime during deploys."],
  risks: [],
  security: ["Role-based access for staff."],
  openQuestions: [],
});

async function projectWithRequirements() {
  const project = await seedFixtureProject({ stage: "PLANNING" });
  const must = await prisma.requirement.create({
    data: { code: await nextCode("REQ"), projectId: project.id, kind: "FUNCTIONAL", statement: "Every order has an owner and a status.", priority: "MUST", status: "APPROVED" },
  });
  const should = await prisma.requirement.create({
    data: { code: await nextCode("REQ"), projectId: project.id, kind: "FUNCTIONAL", statement: "Deposit reminders go out automatically.", priority: "SHOULD", status: "APPROVED" },
  });
  return { project, must, should };
}

test("parseArchitecture keeps valid fields, clamps unknown enums, and refuses incomplete replies", () => {
  const doc = parseArchitecture("```json\n" + ARCH.replace('"LOW"', '"TRIVIAL"') + "\n```");
  assert.equal(doc.complexity, "MEDIUM", "unknown complexity is clamped, not trusted");
  assert.equal(doc.buildVsBuy[0].verdict, "SKIP");
  assert.throws(() => parseArchitecture('{"summary":"x"}'), /missing: recommendation, components, complexityJustification/);
  assert.throws(() => parseArchitecture("We should use microservices."), /JSON object/);
});

test("parsePlan rejects invented requirement codes and unknown agents, and reports uncovered MUSTs", () => {
  const plan = (features: unknown) => JSON.stringify({ features });
  const ok = parsePlan(
    plan([{ title: "Order board", satisfies: ["REQ-900"], tasks: [{ title: "Build board UI", agent: "frontend-engineer" }] }]),
    ["REQ-900", "REQ-901"],
    ["REQ-900", "REQ-901"]
  );
  assert.deepEqual(ok.uncovered, ["REQ-901"]);
  assert.throws(
    () => parsePlan(plan([{ title: "X", satisfies: ["REQ-777"], tasks: [{ title: "t", agent: "frontend-engineer" }] }]), ["REQ-900"], []),
    /REQ-777/
  );
  assert.throws(
    () => parsePlan(plan([{ title: "X", satisfies: [], tasks: [{ title: "t", agent: "wizard" }] }]), ["REQ-900"], []),
    /unknown agents: wizard/
  );
  assert.throws(() => parsePlan(plan([{ title: "X", satisfies: [], tasks: [{ title: "t", agent: "client-communication" }] }]), [], []), /unknown agents/);
});

test("architecture: proposed by the agent, metered, and only a reviewer can accept it", async () => {
  const { project } = await projectWithRequirements();
  try {
    await assert.rejects(() => runArchitecture(actorAs("ENGINEER"), project.id, { provider: new MockProvider(ARCH) }), /permission/);
    const run = await runArchitecture(actorAs("PROJECT_MANAGER"), project.id, { provider: new MockProvider(ARCH) });
    assert.equal(run.status, "PROPOSED");
    assert.equal((await prisma.aiUsage.findUniqueOrThrow({ where: { id: run.usageId! } })).projectId, project.id);
    await assert.rejects(() => reviewRun(actorAs("PROJECT_MANAGER"), run.id, "ACCEPTED"), /permission/);
    await assert.rejects(() => reviewRun(FOUNDER, run.id, "REJECTED"), /Say why/);
    const accepted = await reviewRun(FOUNDER, run.id, "ACCEPTED");
    assert.equal(accepted.reviewedBy, "Test founder");
    await assert.rejects(() => reviewRun(FOUNDER, run.id, "REJECTED", "changed mind"), /already accepted/);
  } finally {
    await cleanupProjectGraph(project.id);
  }
});

test("plan: accepting it creates features, agent-owned tasks and REQ→FEAT→TASK links, exactly once", async () => {
  const { project, must, should } = await projectWithRequirements();
  try {
    const planReply = JSON.stringify({
      features: [
        { title: "Order board", description: "", satisfies: [must.code], tasks: [
          { title: "Design the order board", agent: "ux-designer", description: "" },
          { title: "Build the order board", agent: "frontend-engineer", description: "" },
        ] },
        { title: "Deposit reminders", satisfies: [should.code], tasks: [{ title: "Reminder job", agent: "backend-engineer" }] },
      ],
    });
    const run = await runPlanner(FOUNDER, project.id, { provider: new MockProvider(planReply) });
    assert.match(run.summary, /2 features, 3 tasks/);
    await assert.rejects(() => reviewRun(FOUNDER, run.id, "ACCEPTED"), /acceptPlan/);
    const created = await acceptPlan(FOUNDER, run.id);
    assert.deepEqual(created, { features: 2, tasks: 3 });
    await assert.rejects(() => acceptPlan(FOUNDER, run.id), /already reviewed/);

    const tasks = await prisma.task.findMany({ where: { projectId: project.id } });
    assert.ok(tasks.every((t) => t.code && t.ownerAgent && t.status === "READY"));
    const links = await prisma.traceLink.findMany({ where: { projectId: project.id } });
    assert.equal(links.filter((l) => l.relation === "SATISFIED_BY").length, 2);
    assert.equal(links.filter((l) => l.relation === "IMPLEMENTED_BY").length, 3);
  } finally {
    await cleanupProjectGraph(project.id);
  }
});

test("orchestrator: needs a budget, respects dependencies, stops at the budget and on failure", async () => {
  const project = await seedFixtureProject({ stage: "IMPLEMENTATION" });
  try {
    const first = await prisma.task.create({ data: { projectId: project.id, title: "Write the PRD", ownerAgent: "product-manager", status: "READY" } });
    const second = await prisma.task.create({
      data: { projectId: project.id, title: "Refine requirements", ownerAgent: "business-analyst", status: "READY", dependencies: encodeStringList([first.id]) },
    });
    assert.deepEqual((await runnableTasks(project.id)).map((t) => t.id), [first.id], "the dependent task waits");

    await assert.rejects(() => runReadyTasks(FOUNDER, project.id, { provider: new MockProvider() }), /Set an AI budget/);
    await setAiBudget(FOUNDER, project.id, 1);

    // A priced mock run costs something; a $1 budget allows the first and then stops.
    const priced = new MockProvider(undefined, { inputTokens: 200_000, outputTokens: 40_000 }, "claude-sonnet-5");
    const r = await runReadyTasks(FOUNDER, project.id, { maxTasks: 5, provider: priced });
    assert.equal(r.dispatched[0].taskId, first.id);
    assert.match(r.stoppedBecause, /budget reached|No more tasks/);
    const usage = await prisma.aiUsage.findMany({ where: { projectId: project.id } });
    assert.ok(usage.length >= 1 && usage.every((u) => u.task.startsWith("dispatch:")), "every dispatch is metered");

    // A failing provider blocks the task and stops the loop.
    await setAiBudget(FOUNDER, project.id, 1000);
    const failing = { complete: async () => { throw new Error("model unavailable"); } };
    await prisma.task.update({ where: { id: second.id }, data: { status: "READY" } });
    const r2 = await runReadyTasks(FOUNDER, project.id, { provider: failing });
    assert.match(r2.stoppedBecause, /failed \(model unavailable\)/);
    assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: second.id } })).status, "BLOCKED");
    const failedUsage = await prisma.aiUsage.findFirst({ where: { projectId: project.id, success: false } });
    assert.ok(failedUsage, "failed runs are metered too");
  } finally {
    await cleanupProjectGraph(project.id);
  }
});

test("criticality routing: critical agents are never down-tiered and always get a human review task", async () => {
  const project = await seedFixtureProject({ stage: "ARCHITECTURE" });
  try {
    const task = await prisma.task.create({
      data: { projectId: project.id, title: "Simple static site", description: "Just a simple one-page static site, no backend.", ownerAgent: "principal-architect", status: "READY" },
    });
    const requested: string[] = [];
    const recording = { complete: async (req: { model: string }) => { requested.push(req.model); return new MockProvider().complete(req as never); } };
    const r = await dispatchTask(task.id, { provider: recording });
    assert.equal(requested[0], "claude-opus-5", "stays on the architecture tier despite a 'simple' description");
    assert.equal(r.model, "mock-echo");
    const review = await prisma.task.findFirst({ where: { projectId: project.id, title: { startsWith: "Human review (critical)" } } });
    assert.ok(review);
    assert.equal(review!.ownerAgent, null, "owned by a person, not an agent");
  } finally {
    await cleanupProjectGraph(project.id);
  }
});

test("CI evidence: token-authenticated, validated per result, idempotent per run", async () => {
  const project = await seedFixtureProject({ stage: "QA" });
  try {
    const tc = await prisma.testCase.create({ data: { code: await nextCode("TEST"), projectId: project.id, title: "Export totals", level: "UNIT" } });
    await assert.rejects(() => ingestCiResults("x".repeat(43), { run: { id: "1" }, results: [] }), CiAuthError);
    const { token } = await issueCiToken(FOUNDER, project.id);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).ciTokenHash, hashToken(token));

    await assert.rejects(() => ingestCiResults(token, { results: [{ code: tc.code, passed: 1, total: 1 }] }), /run.id/);
    const payload = {
      run: { id: "412", url: "https://ci.example/run/412" },
      results: [
        { code: tc.code, passed: 13, total: 14, summary: "unit suite" },
        { code: "TEST-99999", passed: 1, total: 1 },
        { code: "REQ-001", passed: 1, total: 1 },
        { code: tc.code.replace(/\d+$/, "0"), passed: 2, total: 1 },
      ],
    };
    const r = await ingestCiResults(token, payload);
    assert.equal(r.recorded, 1);
    assert.equal(r.rejected.length, 3);
    const ev = await prisma.evidence.findFirstOrThrow({ where: { testCaseId: tc.id } });
    assert.equal(ev.result, "FAIL", "13/14 is a failure");
    assert.equal(ev.source, "CI");

    const again = await ingestCiResults(token, payload);
    assert.equal(again.recorded, 0);
    assert.equal(again.duplicates, 1, "re-posting the same run doesn't double count");
    const rotated = await issueCiToken(FOUNDER, project.id);
    await assert.rejects(() => ingestCiResults(token, payload), CiAuthError, "old token stops working");
    assert.ok(rotated.token);
  } finally {
    await cleanupProjectGraph(project.id);
  }
});
