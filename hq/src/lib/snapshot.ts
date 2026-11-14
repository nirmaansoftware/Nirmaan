/**
 * The one document hq renders. A publisher (the Mac now, the cloud review
 * loops later) builds it from the tracker, the review-loop call log, the org
 * chart, capability levels, eval records and the GitHub API, and pushes only
 * what changed. Every screen reads this shape and nothing else.
 *
 * SANITISED BY CONTRACT: no secrets, tokens or keys; no prices, margins or
 * costs; no legal drafts; clients appear only as project ids. The forbidden
 * field test (snapshot.test.ts) fails if any of those names appear.
 */

import forbidden from "./forbidden.json";

export const SNAPSHOT_VERSION = 1;

export type Org = "ip" | "nirmaan";

/** Model families hq colours and counts. "other" catches anything new. */
export type ModelFamily = "fable" | "opus" | "sonnet" | "haiku" | "other";

export type HealthStatus = "ok" | "warn" | "down" | "paused";

export interface Health {
  id: string;
  label: string;
  status: HealthStatus;
  detail: string;
  since: string; // ISO time the status began
}

export interface ProgressTrack {
  id: string;
  org: Org;
  label: string;
  done: number;
  /** Items started but not done; drawn as the blue "being laid" cells. */
  active: number;
  total: number;
  unit: string;
  note?: string;
}

export type WaitingKind = "approval" | "usage" | "setup" | "decision";

export interface WaitingItem {
  id: string;
  kind: WaitingKind;
  title: string;
  where: string; // where the founder acts: a PR, a session, a site
  since: string;
}

export type LaneStatus = "working" | "waiting" | "paused" | "done" | "failed";

export interface Lane {
  id: string; // tracker lane id, e.g. IP-P3-L1
  org: Org;
  task: string;
  model: string; // as reported, e.g. claude-opus-5-5
  status: LaneStatus;
  repo?: string;
  branch?: string;
  pr?: number;
  startedAt: string;
  lastActivityAt: string;
  note?: string;
}

export type EventKind = "spawned" | "pr-opened" | "review" | "merged" | "paused" | "resumed" | "failed" | "note";

export interface HqEvent {
  at: string;
  kind: EventKind;
  text: string;
  lane?: string;
  pr?: number;
  repo?: string;
}

export interface ModelUsage {
  model: string; // as reported
  role: string; // key1, key2, proxy, fixer, author, eval, orchestrator
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export type ReviewStage = "key1" | "key2" | "proxy" | "fix" | "needs-founder" | "ready" | "merged";

export interface Review {
  repo: string;
  pr: number;
  title: string;
  stage: ReviewStage;
  since: string;
  fixRounds: number;
}

export type SkillLevel = "practised" | "knowledge" | "none";

export interface StaffSkill {
  id: string;
  level: SkillLevel;
  /** Short harness fingerprint of the trials behind a Practised level. */
  harness?: string;
}

export interface StaffRole {
  org: Org;
  id: string;
  title: string;
  team: string;
  model?: string; // default model for the role (R8)
  skills: StaffSkill[];
}

export type FailureCause = "model" | "harness" | "case";

export interface EvalBatch {
  id: string;
  label: string;
  status: "running" | "paused" | "done";
  model: string;
  harness: string;
  casesDone: number;
  casesTotal: number;
  trials: number;
  passed: number;
  failures: { cause: FailureCause; n: number }[];
}

export interface Snapshot {
  version: typeof SNAPSHOT_VERSION;
  generatedAt: string;
  /** "sample" until the publisher is connected; the UI says so. */
  source: "sample" | "live";
  health: Health[];
  progress: ProgressTrack[];
  waiting: WaitingItem[];
  lanes: Lane[];
  events: HqEvent[];
  models: ModelUsage[];
  reviews: Review[];
  staff: StaffRole[];
  evals: EvalBatch[];
}

export function modelFamily(model: string): ModelFamily {
  const m = model.toLowerCase();
  for (const f of ["fable", "opus", "sonnet", "haiku"] as const) if (m.includes(f)) return f;
  return "other";
}

/** "claude-opus-5-5" → "Opus 5.5"; unknown names pass through. */
export function modelLabel(model: string): string {
  const m = /^(?:claude-)?(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d+))?$/i.exec(model.trim());
  if (!m) return model;
  const name = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
  return m[3] ? `${name} ${m[2]}.${m[3]}` : `${name} ${m[2]}`;
}

/** Field names that must never reach hq; shared with the publisher (publisher/publish.mjs). */
export const FORBIDDEN_FIELDS: string[] = forbidden;

/** Every key in a JSON value, recursively. */
export function allKeys(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      allKeys(v, out);
    }
  }
  return out;
}

/** Forbidden names found in a snapshot (case-insensitive, whole key). */
export function forbiddenIn(value: unknown): string[] {
  const banned = new Set(FORBIDDEN_FIELDS.map((f) => f.toLowerCase()));
  return [...allKeys(value)].filter((k) => banned.has(k.toLowerCase()));
}
