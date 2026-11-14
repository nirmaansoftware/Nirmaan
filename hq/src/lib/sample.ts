import { SNAPSHOT_VERSION, type Snapshot } from "./snapshot";

/**
 * Illustrative data, shown until the publisher is connected. The UI labels it
 * "Sample data". It names our own lanes and roles only: no client, no real
 * usage figures, nothing from the private tracker beyond lane ids.
 * Times are relative to `now` so the page always looks current.
 */
/** Fixed for the life of the server, so polling the sample never looks like new data. */
const SAMPLE_GENERATED_AT = new Date().toISOString();

export function sampleSnapshot(now: Date = new Date()): Snapshot {
  const t = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
  return {
    version: SNAPSHOT_VERSION,
    generatedAt: SAMPLE_GENERATED_AT,
    source: "sample",
    health: [
      { id: "orchestrator", label: "Orchestrator", status: "ok", detail: "3 lanes running", since: t(52) },
      { id: "loop-ip", label: "IP review loop", status: "ok", detail: "idle, last pass 40 s ago", since: t(300) },
      { id: "loop-nirmaan", label: "Nirmaan review loop", status: "ok", detail: "reviewing #170", since: t(12) },
      { id: "mac", label: "Mac (headless)", status: "warn", detail: "on battery, sleeps if idle", since: t(8) },
      { id: "ci", label: "GitHub Actions", status: "ok", detail: "last run passed", since: t(30) },
    ],
    progress: [
      { id: "ip-pilot", org: "ip", label: "IP pilot (P3)", done: 9, active: 2, total: 15, unit: "PRs" },
      { id: "ip-skills", org: "ip", label: "IP skills defined", done: 18, active: 4, total: 214, unit: "level-2 skills", note: "of the capability map" },
      { id: "ip-practised", org: "ip", label: "IP skills Practised", done: 1, active: 7, total: 52, unit: "skills", note: "Practised track" },
      { id: "harness", org: "ip", label: "Harness track (H1-H4)", done: 1, active: 1, total: 4, unit: "items" },
      { id: "gaps", org: "ip", label: "Capability gaps (G1-G6)", done: 0, active: 2, total: 6, unit: "items" },
      { id: "infra", org: "nirmaan", label: "Resources and infra (R1-R10)", done: 3, active: 2, total: 10, unit: "items" },
    ],
    waiting: [
      { id: "w1", kind: "approval", title: "Approve the hq PR", where: "nirmaansoftware/Nirmaan", since: t(5) },
      { id: "w2", kind: "setup", title: "Add the hq CNAME at Hostinger", where: "Hostinger DNS", since: t(5) },
      { id: "w3", kind: "usage", title: "Usage share for H3 harness variants (about 70 trials)", where: "orchestrator session", since: t(900) },
    ],
    lanes: [
      { id: "IP-P3-L1", org: "ip", task: "First recorded live batch, 7 cases", model: "claude-opus-5-5", status: "working", repo: "ip-nirmaan", branch: "evals/p3-l1-live-2", startedAt: t(95), lastActivityAt: t(1) },
      { id: "IP-P3-K3", org: "ip", task: "Knowledge docs: rtl_microarchitecture, rtl_lint, synthesis_awareness, reset_design", model: "claude-sonnet-5-5", status: "waiting", repo: "ip-nirmaan", pr: 189, startedAt: t(70), lastActivityAt: t(6), note: "in review, key 2" },
      { id: "IP-W2-T1", org: "ip", task: "eqy wrapper for equivalence checks", model: "claude-opus-5-5", status: "working", repo: "ip-nirmaan", branch: "tools/eqy", startedAt: t(40), lastActivityAt: t(2) },
      { id: "HQ", org: "nirmaan", task: "hq.nirmaan.online", model: "claude-opus-5-5", status: "working", repo: "Nirmaan", branch: "hq/scaffold", startedAt: t(20), lastActivityAt: t(0) },
    ],
    events: [
      { at: t(0), kind: "note", text: "hq scaffold building", lane: "HQ" },
      { at: t(1), kind: "review", text: "Case rtl/apb-gpio: trial 3 of 5 passed", lane: "IP-P3-L1" },
      { at: t(6), kind: "review", text: "Key 2 started on #189", repo: "ip-nirmaan", pr: 189 },
      { at: t(14), kind: "pr-opened", text: "PR #189 opened: K3 knowledge documents", lane: "IP-P3-K3", repo: "ip-nirmaan", pr: 189 },
      { at: t(40), kind: "spawned", text: "Lane IP-W2-T1 started", lane: "IP-W2-T1" },
      { at: t(62), kind: "merged", text: "#187 merged: loop pauses on 429/529", repo: "ip-nirmaan", pr: 187 },
    ],
    models: [
      { model: "claude-sonnet-5-5", role: "key1", calls: 120, inputTokens: 4_100_000, outputTokens: 210_000 },
      { model: "claude-opus-5-5", role: "key2", calls: 46, inputTokens: 9_800_000, outputTokens: 330_000 },
      { model: "claude-opus-5-5", role: "proxy", calls: 19, inputTokens: 3_200_000, outputTokens: 90_000 },
      { model: "claude-sonnet-5-5", role: "fixer", calls: 11, inputTokens: 1_400_000, outputTokens: 120_000 },
      { model: "claude-opus-5-5", role: "author", calls: 64, inputTokens: 7_900_000, outputTokens: 610_000 },
      { model: "claude-haiku-5-5", role: "explore", calls: 38, inputTokens: 900_000, outputTokens: 40_000 },
      { model: "claude-fable-5-2", role: "planning", calls: 3, inputTokens: 600_000, outputTokens: 70_000 },
    ],
    reviews: [
      { repo: "ip-nirmaan", pr: 189, title: "P3-K3: knowledge documents for four RTL skills", stage: "key2", since: t(6), fixRounds: 0 },
      { repo: "Nirmaan", pr: 170, title: "Loop: classify CLI 2.1.325 overload messages", stage: "key1", since: t(12), fixRounds: 1 },
      { repo: "ip-nirmaan", pr: 188, title: "P3-C2: check records for K2", stage: "proxy", since: t(25), fixRounds: 0 },
    ],
    staff: [
      {
        org: "ip", id: "rtl-designer", title: "RTL designer", team: "Silicon Design", model: "claude-opus-5-5",
        skills: [
          { id: "arbitration", level: "practised", harness: "d772f6f7" },
          { id: "rtl_design", level: "knowledge" },
          { id: "apb", level: "knowledge" },
          { id: "axi", level: "none" },
          { id: "fsm_design", level: "knowledge" },
          { id: "pipeline_design", level: "knowledge" },
        ],
      },
      {
        org: "ip", id: "verification-lead", title: "Verification lead", team: "Verification", model: "claude-opus-5-5",
        skills: [
          { id: "buffering_flow_control", level: "knowledge" },
          { id: "formal_basics", level: "none" },
          { id: "constrained_random", level: "none" },
        ],
      },
      {
        org: "nirmaan", id: "frontend-engineer", title: "Frontend engineer", team: "Engineering", model: "claude-sonnet-5-5",
        skills: [
          { id: "plain-technical-writing", level: "knowledge" },
          { id: "accessible-ui", level: "none" },
        ],
      },
    ],
    evals: [
      {
        id: "p3-l1", label: "P3-L1 first live batch", status: "running", model: "claude-opus-5-5", harness: "d772f6f7",
        casesDone: 3, casesTotal: 7, trials: 15, passed: 12,
        failures: [{ cause: "model", n: 2 }, { cause: "harness", n: 1 }],
      },
    ],
  };
}
