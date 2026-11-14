/**
 * Plain words for everything hq shows, so anyone can read it: no review keys,
 * no model ids, no lane codes on the main screens. Pure functions, tested in
 * plain.test.ts.
 */
import { modelFamily, modelLabel, type Health, type Lane, type Person, type ReviewStage, type Snapshot } from "./snapshot";

export const ORG_NAME = { ip: "IP Nirmaan", nirmaan: "Nirmaan" } as const;
export const ORG_KIND = { ip: "chip design", nirmaan: "software" } as const;

/** How a model works, in one word, next to its name. */
const PERSONA = { fable: "strategist", opus: "expert", sonnet: "specialist", haiku: "assistant", other: "model" } as const;

export function modelPersona(model: string): { name: string; persona: string; family: ReturnType<typeof modelFamily> } {
  const family = modelFamily(model);
  return { name: modelLabel(model), persona: PERSONA[family], family };
}

const STAGE_TEXT: Record<ReviewStage, string> = {
  key1: "First review",
  fix: "Fixing feedback",
  key2: "Second review",
  proxy: "Final check",
  ready: "Approved, merging",
  "needs-founder": "Needs your approval",
  merged: "Done",
};

export function stageText(stage: ReviewStage): string {
  return STAGE_TEXT[stage];
}

export interface Overall {
  tone: "good" | "warn" | "bad" | "info";
  headline: string;
  detail: string;
}

/** One sentence for the whole company's health. */
export function overallStatus(health: Health[]): Overall {
  const down = health.filter((h) => h.status === "down");
  const warn = health.filter((h) => h.status === "warn");
  const paused = health.find((h) => h.id === "orchestrator" && h.status === "paused");
  if (down.length) return { tone: "bad", headline: "Something has stopped", detail: down.map((h) => `${h.label}: ${h.detail}`).join(" · ") };
  if (paused) return { tone: "info", headline: "Work is paused", detail: "You paused the programme. Reviews keep running." };
  if (warn.length) return { tone: "warn", headline: "Running, with a few things to fix", detail: warn.map((h) => `${h.label}: ${h.detail}`).join(" · ") };
  return { tone: "good", headline: "Everything is running", detail: "All systems healthy." };
}

export function greeting(date: Date): string {
  const h = date.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Who is doing a lane: the matching person, or the orchestrator. */
export function laneOwner(lane: Lane, people: Person[]): Person {
  return (
    people.find((p) => p.id === lane.role) ??
    people.find((p) => p.id === "orchestrator") ?? { org: "nirmaan", id: "orchestrator", title: "Orchestrator", team: "Executive", head: true }
  );
}

/** Lanes each person is on right now (working or waiting). */
export function busyMap(s: Snapshot): Map<string, Lane[]> {
  const map = new Map<string, Lane[]>();
  const people = s.people ?? [];
  for (const l of s.lanes) {
    if (l.status !== "working" && l.status !== "waiting") continue;
    const who = laneOwner(l, people).id;
    map.set(who, [...(map.get(who) ?? []), l]);
  }
  return map;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "Fix the bug in X" → keeps it short for a card. */
export function short(text: string, n = 90): string {
  return text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text;
}
