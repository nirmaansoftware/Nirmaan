import { test } from "node:test";
import assert from "node:assert/strict";
import { loadOrgChart, plannableAgents, managerOnlySlugs, type OrgChart } from "./orgChart";
import { AGENT_TASK_TYPES } from "../orchestrator/agentConfig";

test("plannable agents are the active ic and staff occupants without plannable: false", () => {
  const chart: OrgChart = {
    unplaced: [],
    positions: [
      { id: "m", title: "Head", layer: 4, kind: "manager", holder: "agent", status: "active", occupant: "boss" },
      { id: "a", title: "IC", layer: 6, kind: "ic", holder: "agent", status: "active", occupant: "doer", reports_to: "m" },
      { id: "s", title: "Staff", layer: 4, kind: "staff", holder: "agent", status: "active", occupant: "advisor", reports_to: "m" },
      { id: "n", title: "IC", layer: 6, kind: "ic", holder: "agent", status: "active", occupant: "talker", plannable: false },
      { id: "p", title: "IC", layer: 6, kind: "ic", holder: "agent", status: "planned", occupant: "later" },
      { id: "f", title: "Founder", layer: 0, kind: "manager", holder: "human", status: "active" },
    ],
  };
  assert.deepEqual(plannableAgents(chart), ["advisor", "doer"]);
  assert.deepEqual(managerOnlySlugs(chart), ["boss"]);
});

test("a manager is never plannable on the real chart", () => {
  const plannable = new Set(plannableAgents());
  const managers = loadOrgChart().positions.filter((p) => p.kind === "manager" && p.occupant).map((p) => p.occupant as string);
  assert.ok(managers.length > 0);
  for (const slug of managers) assert.ok(!plannable.has(slug), `${slug}: holds a manager position and is plannable`);
});

test("the old hand-kept exclusions are reproduced by the chart", () => {
  // planner.ts kept these six out by hand before the chart existed: three are
  // managers, three are marked plannable: false.
  const plannable = new Set(plannableAgents());
  for (const slug of ["orchestrator", "client-communication", "finance-estimation", "legal-compliance", "market-research", "brand-strategist"]) {
    assert.ok(!plannable.has(slug), `${slug}: should not be plannable`);
  }
});

test("every plannable agent has a dispatch task type", () => {
  for (const slug of plannableAgents()) assert.ok(AGENT_TASK_TYPES[slug], `${slug}: plannable but no AGENT_TASK_TYPES entry`);
});
