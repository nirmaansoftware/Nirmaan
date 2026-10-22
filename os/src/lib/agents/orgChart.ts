import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { agentsRoot } from "./loadAgent";

/**
 * Read-only view of agents/org-chart.yml, the one source of truth for the
 * agents' line of command. The chart's own rules are enforced in CI by
 * .github/scripts/org-chart.mjs; this module only reads it. The chart is
 * founder class A, so anything derived here follows a reviewed file.
 */
export interface ChartPosition {
  id: string;
  title: string;
  layer: number;
  kind: "manager" | "lead" | "ic" | "staff" | "project";
  holder: "agent" | "human";
  status: "active" | "planned";
  occupant?: string;
  reports_to?: string;
  interim?: boolean;
  plannable?: boolean;
}

export interface OrgChart {
  positions: ChartPosition[];
  unplaced: { slug: string; reason: string }[];
}

export function orgChartPath(): string {
  return path.join(agentsRoot(), "org-chart.yml");
}

/** Parse the chart. Throws when it is missing: callers must not guess a line. */
export function loadOrgChart(): OrgChart {
  const file = orgChartPath();
  if (!fs.existsSync(/*turbopackIgnore: true*/ file)) {
    throw new Error(`No org chart at ${file}. See agents/org-chart.yml.`);
  }
  const raw = fs.readFileSync(/*turbopackIgnore: true*/ file, "utf-8");
  // gray-matter is already the spec parser here; reading the chart as a front
  // matter block reuses its YAML engine instead of adding a dependency.
  const data = matter(`---\n${raw}\n---\n`).data as Partial<OrgChart>;
  if (!Array.isArray(data.positions)) throw new Error(`${file}: no positions list.`);
  return { positions: data.positions, unplaced: Array.isArray(data.unplaced) ? data.unplaced : [] };
}

/**
 * Agents a delivery plan may assign tasks to: the occupants of active ic or
 * staff positions without `plannable: false`. Managers never own tasks
 * (docs/operations/capability-hierarchy-decisions.md, D3 point 4).
 */
export function plannableAgents(chart: OrgChart = loadOrgChart()): string[] {
  const slugs = chart.positions
    .filter((p) => p.status === "active" && p.holder === "agent" && p.occupant)
    .filter((p) => (p.kind === "ic" || p.kind === "staff") && p.plannable !== false)
    .map((p) => p.occupant as string);
  return [...new Set(slugs)].sort();
}

/** Slugs that occupy an active position, plus the specs the chart leaves unplaced. */
export function chartSlugs(chart: OrgChart = loadOrgChart()): string[] {
  const occupants = chart.positions.filter((p) => p.status === "active" && p.occupant).map((p) => p.occupant as string);
  return [...new Set([...occupants, ...chart.unplaced.map((u) => u.slug)])].sort();
}

/** Slugs whose every active position is a manager position. */
export function managerOnlySlugs(chart: OrgChart = loadOrgChart()): string[] {
  const byslug = new Map<string, Set<string>>();
  for (const p of chart.positions) {
    if (p.status !== "active" || !p.occupant) continue;
    if (!byslug.has(p.occupant)) byslug.set(p.occupant, new Set());
    byslug.get(p.occupant)!.add(p.kind);
  }
  return [...byslug].filter(([, kinds]) => kinds.size === 1 && kinds.has("manager")).map(([slug]) => slug).sort();
}
