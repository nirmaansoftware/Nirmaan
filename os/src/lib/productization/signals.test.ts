import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../db/client";
import { createAsset, recordAssetUse } from "@/lib/library/assets";
import { evaluateGroup, productizationSignals, recordDecision, type GroupProject } from "./signals";
import { FOUNDER, actorAs, cleanupProjectGraph } from "../testHelpers/businessFixtures";
import { seedFixtureProject } from "../testHelpers/fixtureProject";

const proj = (id: string, over: Partial<GroupProject> = {}): GroupProject => ({
  id,
  clientId: `c-${id}`,
  contract: 60000,
  estimatedCost: 30000,
  actualCost: 36000,
  assetIds: ["auth", "booking"],
  ...over,
});

test("a kind of work is a candidate only when all four criteria pass", () => {
  const g = evaluateGroup("WEB_APP", [proj("a"), proj("b"), proj("c")], new Set(["c-a", "c-b"]));
  assert.equal(g.demand.check, "PASS");
  assert.equal(g.shared.check, "PASS");
  assert.deepEqual(g.shared.assetIds.sort(), ["auth", "booking"]);
  assert.equal(g.recurring.check, "PASS");
  assert.equal(g.underpriced.check, "PASS");
  assert.equal(g.underpriced.medianOverrun, 0.2);
  assert.equal(g.verdict, "CANDIDATE");
  assert.equal(g.contract, 180000);
});

test("missing data is UNKNOWN, never a pass; too few projects is never more than NOT_YET", () => {
  const bare = [proj("a", { assetIds: [], actualCost: 0 }), proj("b", { assetIds: [], actualCost: 0 }), proj("c", { assetIds: [], actualCost: 0, clientId: null })];
  const g = evaluateGroup("WEBSITE", bare, new Set());
  assert.equal(g.shared.check, "UNKNOWN");
  assert.equal(g.underpriced.check, "UNKNOWN");
  assert.equal(g.recurring.check, "FAIL", "two clients, neither on a plan");
  assert.equal(g.verdict, "NOT_YET");

  const two = evaluateGroup("WEB_APP", [proj("a"), proj("b")], new Set(["c-a", "c-b"]));
  assert.equal(two.demand.check, "FAIL");
  assert.equal(two.verdict, "NOT_YET", "strong signals on two projects are still not enough");

  const watch = evaluateGroup("WEB_APP", [proj("a", { actualCost: 25000 }), proj("b", { actualCost: 28000 }), proj("c")], new Set(["c-a", "c-b"]));
  assert.equal(watch.underpriced.check, "FAIL", "median under estimate");
  assert.equal(watch.verdict, "WATCH");
});

test("an asset used by one project out of many isn't shared", () => {
  const g = evaluateGroup("AUTOMATION", [proj("a", { assetIds: ["x", "y"] }), proj("b", { assetIds: ["z"] }), proj("c", { assetIds: [] }), proj("d", { assetIds: ["x"] })], new Set());
  assert.deepEqual(g.shared.assetIds, ["x"], "x is in 2 of 4 projects; y and z in one each");
  assert.equal(g.shared.check, "FAIL");
});

test("signals load from real projects, need finance access, and decisions are recorded as knowledge", async () => {
  const projects = await Promise.all([seedFixtureProject(), seedFixtureProject(), seedFixtureProject()]);
  const ids = projects.map((p) => p.id);
  await prisma.project.updateMany({ where: { id: { in: ids } }, data: { serviceType: "MODERNISATION" } });
  const assets = await Promise.all(
    ["Legacy data importer", "Role-based admin"].map((name) =>
      createAsset(FOUNDER, { name, category: "DATABASE_PATTERNS", version: "1.0.0", description: "Fixture asset for productization signals.", dependencies: [], usage: "Import step in migrations.", owner: "Test founder" })
    )
  );
  let articleId: string | undefined;
  try {
    for (const a of assets) for (const p of projects) await recordAssetUse(FOUNDER, a.code, p.id);

    await assert.rejects(() => productizationSignals(actorAs("ENGINEER"), { projectIds: ids }), /permission/);
    const [g] = await productizationSignals(FOUNDER, { projectIds: ids });
    assert.equal(g.serviceType, "MODERNISATION");
    assert.equal(g.projects, 3);
    assert.equal(g.shared.check, "PASS");
    assert.equal(g.sharedAssets.length, 2);
    assert.equal(g.underpriced.check, "UNKNOWN", "no estimates or costs on fixtures");
    assert.equal(g.verdict, "WATCH");

    await assert.rejects(() => recordDecision(FOUNDER, "MODERNISATION", "PURSUE", "yes", { projectIds: ids }), /why/);
    await assert.rejects(() => recordDecision(FOUNDER, "MOBILE_APP", "PURSUE", "Plenty of repeat demand.", { projectIds: ids }), /No won projects/);
    const article = await recordDecision(FOUNDER, "MODERNISATION", "NOT_NOW", "Only one client pays for care; revisit next quarter.", { projectIds: ids });
    articleId = article.id;
    assert.match(article.title, /Productization: modernisation \(not now\)/);
    assert.match(article.content, /Shared components: pass/);
    assert.match(article.tags, /productization/);
  } finally {
    if (articleId) {
      await prisma.auditLog.deleteMany({ where: { entityId: articleId } });
      await prisma.knowledge.delete({ where: { id: articleId } });
    }
    for (const p of projects) await cleanupProjectGraph(p.id);
    await prisma.auditLog.deleteMany({ where: { entityId: { in: assets.map((a) => a.id) } } });
    await prisma.asset.deleteMany({ where: { id: { in: assets.map((a) => a.id) } } });
  }
});
