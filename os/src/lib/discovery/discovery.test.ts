import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db/client";
import { MockProvider } from "@/lib/ai/providers/mock";
import { parseDiscoveryResponse, runDiscovery } from "./runDiscovery";
import { decideItem, factsFromIntake, promoteToRequirement, promotionBlocker } from "./items";
import { FOUNDER, actorAs, cleanupLead, makeLead } from "../testHelpers/businessFixtures";

const AGENT_REPLY = JSON.stringify({
  items: [
    { kind: "FACT", text: "Orders arrive through several WhatsApp groups." },
    { kind: "ASSUMPTION", text: "Staff are comfortable using a browser on a phone (based on them already using WhatsApp all day)." },
    { kind: "QUESTION", text: "Roughly how many orders arrive per day?" },
    { kind: "RECOMMENDATION", text: "Start with a shared order board before any custom app." },
    { kind: "WISH", text: "not a real kind, must be dropped" },
    { kind: "QUESTION", text: "Roughly how many orders arrive per day?" },
  ],
});

test("parseDiscoveryResponse: accepts fenced JSON, drops unknown kinds and duplicates", () => {
  const items = parseDiscoveryResponse("Sure!\n```json\n" + AGENT_REPLY + "\n```");
  assert.deepEqual(items.map((i) => i.kind), ["FACT", "ASSUMPTION", "QUESTION", "RECOMMENDATION"]);
});

test("parseDiscoveryResponse: refuses prose, bad JSON and empty results instead of guessing", () => {
  assert.throws(() => parseDiscoveryResponse("I think they need a CRM."), /JSON object/);
  assert.throws(() => parseDiscoveryResponse("{ not json }"), /valid JSON/);
  assert.throws(() => parseDiscoveryResponse('{"items": []}'), /no usable/);
  assert.throws(() => parseDiscoveryResponse('{"results": []}'), /"items"/);
});

test("promotionBlocker: only facts, confirmed assumptions/recommendations and answered questions pass", () => {
  assert.equal(promotionBlocker({ kind: "FACT", status: "OPEN" }), null);
  assert.ok(promotionBlocker({ kind: "FACT", status: "REJECTED" }));
  assert.ok(promotionBlocker({ kind: "ASSUMPTION", status: "OPEN" }));
  assert.equal(promotionBlocker({ kind: "ASSUMPTION", status: "CONFIRMED" }), null);
  assert.ok(promotionBlocker({ kind: "RECOMMENDATION", status: "OPEN" }));
  assert.equal(promotionBlocker({ kind: "RECOMMENDATION", status: "CONFIRMED" }), null);
  assert.ok(promotionBlocker({ kind: "QUESTION", status: "OPEN" }));
  assert.equal(promotionBlocker({ kind: "QUESTION", status: "ANSWERED" }), null);
});

test("runDiscovery: records intake facts, agent items (all OPEN), usage, and moves the lead to DISCOVERY", async () => {
  const lead = await makeLead({ desiredOutcome: "Never miss a follow-up" });
  try {
    assert.equal(factsFromIntake(lead).length, 4, "problem + business + current solution + desired outcome");
    const result = await runDiscovery(FOUNDER, lead.id, { provider: new MockProvider(AGENT_REPLY) });
    assert.equal(result.created, 4);
    assert.equal(result.intakeFacts, 4);

    const items = await prisma.discoveryItem.findMany({ where: { leadId: lead.id } });
    const agentItems = items.filter((i) => i.source === "AGENT");
    assert.equal(agentItems.length, 4);
    assert.ok(agentItems.every((i) => i.status === "OPEN"), "agent output always needs a human decision");
    assert.ok(items.filter((i) => i.source === "CLIENT").every((i) => i.kind === "FACT" && i.status === "CONFIRMED"));

    const usage = await prisma.aiUsage.findUniqueOrThrow({ where: { id: result.usageId } });
    assert.equal(usage.success, true);
    assert.equal(usage.task, "discovery");
    assert.equal(usage.costSource, "UNKNOWN", "mock reports no usage, so no cost is invented");
    assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status, "DISCOVERY");

    // Re-running doesn't duplicate intake facts.
    await runDiscovery(FOUNDER, lead.id, { provider: new MockProvider(AGENT_REPLY) });
    assert.equal(await prisma.discoveryItem.count({ where: { leadId: lead.id, source: "CLIENT" } }), 4);
  } finally {
    await cleanupLead(lead.id);
  }
});

test("runDiscovery: a bad model reply is recorded as a failed call and creates nothing", async () => {
  const lead = await makeLead();
  try {
    await assert.rejects(() => runDiscovery(FOUNDER, lead.id, { provider: new MockProvider("I would build a CRM.") }), /JSON/);
    assert.equal(await prisma.discoveryItem.count({ where: { leadId: lead.id, source: "AGENT" } }), 0);
    const usage = await prisma.aiUsage.findMany({ where: { leadId: lead.id } });
    assert.equal(usage.length, 1);
    assert.equal(usage[0].success, true, "the call itself succeeded; the output was rejected");
  } finally {
    await cleanupLead(lead.id);
  }
});

test("runDiscovery: needs discovery:run", async () => {
  const lead = await makeLead();
  try {
    await assert.rejects(() => runDiscovery(actorAs("ENGINEER"), lead.id, { provider: new MockProvider(AGENT_REPLY) }), /permission/);
  } finally {
    await cleanupLead(lead.id);
  }
});

test("an assumption becomes a requirement only after a human confirms it", async () => {
  const lead = await makeLead();
  try {
    await runDiscovery(FOUNDER, lead.id, { provider: new MockProvider(AGENT_REPLY) });
    const assumption = await prisma.discoveryItem.findFirstOrThrow({ where: { leadId: lead.id, kind: "ASSUMPTION" } });
    const req = { kind: "NON_FUNCTIONAL", statement: "Staff can manage orders from a phone browser.", acceptanceCriteria: ["Works on a 360px-wide screen"] };

    await assert.rejects(() => promoteToRequirement(FOUNDER, assumption.id, req), /must be confirmed/);
    await decideItem(FOUNDER, assumption.id, "CONFIRM");
    const created = await promoteToRequirement(FOUNDER, assumption.id, req);
    assert.match(created.code, /^REQ-\d{3,}$/);
    assert.equal(created.sourceItemId, assumption.id);
    await assert.rejects(() => promoteToRequirement(FOUNDER, assumption.id, req), /Already promoted/);

    const question = await prisma.discoveryItem.findFirstOrThrow({ where: { leadId: lead.id, kind: "QUESTION" } });
    await assert.rejects(() => decideItem(FOUNDER, question.id, "CONFIRM"), /Answer a question/);
    await assert.rejects(() => decideItem(FOUNDER, question.id, "ANSWER", "  "), /answer/);
    await decideItem(FOUNDER, question.id, "ANSWER", "About 60 a day, peaking at 120 in festival season.");
    const answered = await prisma.discoveryItem.findUniqueOrThrow({ where: { id: question.id } });
    assert.equal(answered.status, "ANSWERED");
  } finally {
    await cleanupLead(lead.id);
  }
});
