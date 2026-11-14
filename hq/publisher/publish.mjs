#!/usr/bin/env node
/**
 * hq publisher: builds the sanitised Snapshot (src/lib/snapshot.ts) from the
 * founder's machine and writes it to HQ_OUT. Run every ~15 s (launchd).
 *
 *   node publisher/publish.mjs            build once, write HQ_OUT
 *   node publisher/publish.mjs --print    build once, print to stdout
 *
 * Each section is read independently: a broken source becomes a "warn" health
 * row, never a blank page. No dependencies beyond Node and the gh CLI.
 * Nothing secret is read into the snapshot; the forbidden-field check runs
 * before every write and refuses to write if it finds one.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOME = homedir();
const HERE = dirname(fileURLToPath(import.meta.url));
const env = process.env;
const CFG = {
  internal: env.HQ_INTERNAL ?? join(HOME, "Nirmaan-internal/2026-10-18-capability-buildout"),
  loopDir: env.HQ_LOOP_DIR ?? join(HOME, ".nirmaan/pr-review"),
  ipRepo: env.HQ_IP_REPO ?? join(HOME, "Nirmaan/ip-nirmaan"),
  worktrees: env.HQ_WORKTREES ?? join(HOME, "Nirmaan/.worktrees"),
  repos: (env.HQ_REPOS ?? "nirmaansoftware/Nirmaan,nirmaansoftware/ip-nirmaan").split(","),
  out: env.HQ_OUT ?? join(HOME, ".nirmaan/hq/snapshot.json"),
  cacheDir: env.HQ_CACHE ?? join(HOME, ".nirmaan/hq/cache"),
  gh: env.HQ_GH ?? "gh",
};
const FORBIDDEN = new Set(JSON.parse(readFileSync(join(HERE, "../src/lib/forbidden.json"), "utf8")).map((s) => s.toLowerCase()));

const now = Date.now();
const iso = (t) => new Date(t).toISOString();
const problems = []; // [section, message]

function section(name, fn, fallback) {
  try {
    return fn();
  } catch (e) {
    problems.push([name, String(e?.message ?? e).slice(0, 140)]);
    return fallback;
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function mtime(path) {
  return statSync(path).mtimeMs;
}

/** Cached command output: re-run only when older than `ttl` ms. */
function cached(key, ttl, fn) {
  mkdirSync(CFG.cacheDir, { recursive: true });
  const file = join(CFG.cacheDir, `${key}.json`);
  if (existsSync(file) && now - mtime(file) < ttl) return readJson(file);
  const value = fn();
  writeFileSync(file, JSON.stringify(value));
  return value;
}

function gh(args) {
  return JSON.parse(execFileSync(CFG.gh, args, { encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "ignore"] }));
}

function short(text, n = 160) {
  const t = String(text).replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

const repoName = (full) => full.split("/").pop();

// ---------- the call log (models, review stages) ----------
const calls = section("call log", () => {
  const text = readFileSync(join(CFG.loopDir, "calls.jsonl"), "utf8");
  // Only the tail matters for stages; models use the last 7 days.
  return text
    .split("\n")
    .slice(-6000)
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}, []);

// ---------- health ----------
function ageStatus(ms, okMs, warnMs) {
  return ms < okMs ? "ok" : ms < warnMs ? "warn" : "down";
}

const resumeHead = section("resume", () => readFileSync(join(CFG.internal, "RESUME.md"), "utf8").split("\n").slice(0, 6).join("\n"), "");
const paused = /PAUSED BY FOUNDER/.test(resumeHead);

const lanesFile = join(CFG.internal, "lanes.json");
const lanes = section("lanes", () => (existsSync(lanesFile) ? readJson(lanesFile).lanes ?? [] : []), []);

const health = [];
section("health: orchestrator", () => {
  const working = lanes.filter((l) => l.status === "working").length;
  const tracker = join(CFG.internal, "tracker.md");
  health.push({
    id: "orchestrator",
    label: "Orchestrator",
    status: paused ? "paused" : "ok",
    detail: paused ? "paused by the founder" : `${working} lane${working === 1 ? "" : "s"} working`,
    since: iso(mtime(tracker)),
  });
});
section("health: loops", () => {
  const pauseFile = join(CFG.loopDir, "loop/rate-limit-pause.json");
  let pausedUntil = 0;
  if (existsSync(pauseFile)) {
    const p = readJson(pauseFile);
    pausedUntil = Date.parse(p.until ?? p.resume_at ?? p.untilIso ?? "") || 0;
  }
  const loops = [
    { id: "loop-nirmaan", label: "Nirmaan review loop", file: join(CFG.loopDir, "loop/heartbeat-nirmaansoftware_Nirmaan.json") },
    { id: "loop-ip", label: "IP review loop", file: join(CFG.loopDir, "ip-loop.log") },
  ];
  for (const l of loops) {
    if (!existsSync(l.file)) {
      health.push({ id: l.id, label: l.label, status: "down", detail: "no heartbeat file", since: iso(now) });
      continue;
    }
    const t = mtime(l.file);
    const status = pausedUntil > now ? "paused" : ageStatus(now - t, 3 * 60_000, 15 * 60_000);
    const detail = pausedUntil > now ? `rate-limit pause until ${new Date(pausedUntil).toLocaleTimeString("en-IN")}` : status === "ok" ? "heartbeat fresh" : "heartbeat late";
    health.push({ id: l.id, label: l.label, status, detail, since: iso(t) });
  }
});
section("health: mac", () => {
  const batt = execFileSync("pmset", ["-g", "batt"], { encoding: "utf8" });
  const custom = execFileSync("pmset", ["-g", "custom"], { encoding: "utf8" });
  const ac = /AC Power/.test(batt.split("\n")[0]);
  const acBlock = custom.split(/AC Power:/)[1] ?? "";
  const acSleep = Number((/\n\s*sleep\s+(\d+)/.exec(acBlock) ?? [])[1] ?? -1);
  const pct = (/(\d+)%/.exec(batt) ?? [])[1];
  const headless = acSleep === 0;
  health.push({
    id: "mac",
    label: "Mac",
    status: ac && headless ? "ok" : "warn",
    detail: `${ac ? "on charger" : `on battery ${pct ?? "?"}%`} · ${headless ? "never sleeps on charger" : `sleeps after ${acSleep} min idle on charger`}`,
    since: iso(now),
  });
});
section("health: ci", () => {
  const runs = cached("ci", 120_000, () =>
    CFG.repos.map((repo) => {
      const r = gh(["api", `repos/${repo}/actions/runs?branch=main&per_page=1`]).workflow_runs?.[0];
      return r ? { repo, conclusion: r.conclusion, status: r.status, at: r.updated_at, name: r.name } : { repo };
    }),
  );
  const bad = runs.filter((r) => r.conclusion && !["success", "skipped", "neutral"].includes(r.conclusion));
  const latest = runs.map((r) => Date.parse(r.at ?? 0)).sort().pop() || now;
  health.push({
    id: "ci",
    label: "GitHub Actions (main)",
    status: bad.length ? "warn" : "ok",
    detail: bad.length ? `${bad.map((r) => `${repoName(r.repo)}: ${r.conclusion}`).join(", ")}` : "latest runs passed",
    since: iso(latest),
  });
});

// ---------- progress ----------
const progress = [];
section("progress: file", () => {
  const file = join(CFG.internal, "progress.json");
  if (existsSync(file)) progress.push(...(readJson(file).tracks ?? []));
});
section("progress: ip levels", () => {
  const data = readJson(join(CFG.ipRepo, "capability/levels.json"));
  const entries = Object.values(data.skills ?? {});
  const practised = entries.filter((e) => e.level === "practised").length;
  const knowledge = entries.filter((e) => e.level === "knowledge").length;
  const map = readFileSync(join(CFG.ipRepo, "capability/capability-map.md"), "utf8");
  const total = Number((/(\d+)\s+level-2/i.exec(map) ?? [])[1]) || 214;
  progress.push({
    id: "ip-levels",
    org: "ip",
    label: "IP skills with a level",
    done: practised,
    active: knowledge,
    total,
    unit: "level-2 skills",
    note: `${practised} Practised · ${knowledge} Knowledge, of the capability map`,
  });
});

// ---------- waiting on the founder ----------
const waiting = [];
section("waiting: file", () => {
  const file = join(CFG.internal, "waiting.json");
  if (existsSync(file)) waiting.push(...(readJson(file).items ?? []));
});

// ---------- open PRs and their review stage ----------
const prs = section(
  "github prs",
  () =>
    cached("prs", 45_000, () =>
      CFG.repos.flatMap((repo) =>
        gh(["pr", "list", "-R", repo, "--state", "open", "--json", "number,title,labels,updatedAt,isDraft"]).map((p) => ({ ...p, repo })),
      ),
    ),
  [],
);

function stageFor(repo, pr) {
  const mine = calls.filter((c) => c.repo === repo && String(c.pr) === String(pr));
  let stage = "key1";
  let since = null;
  for (const c of mine) {
    const at = c.time;
    if (c.kind === "loop" && ["author-fix", "fixed"].includes(c.event)) [stage, since] = ["fix", at];
    else if (c.kind === "loop" && c.event === "auto-merge") [stage, since] = ["ready", at];
    else if (c.kind === "loop" && c.event === "founder-wait") [stage, since] = ["needs-founder", at];
    else if (!c.kind && c.key) {
      const k = String(c.key);
      [stage, since] = [k === "1" ? "key1" : k === "2" ? "key2" : k === "proxy" ? "proxy" : k === "fixer" ? "fix" : stage, at];
    }
  }
  return { stage, since };
}

const reviews = [];
section("reviews", () => {
  for (const p of prs) {
    if (p.isDraft) continue;
    const labels = (p.labels ?? []).map((l) => l.name);
    let { stage, since } = stageFor(p.repo, p.number);
    if (labels.includes("needs-founder")) {
      stage = "needs-founder";
      if (!waiting.some((w) => w.id === `pr-${p.repo}-${p.number}`))
        waiting.push({ id: `pr-${p.repo}-${p.number}`, kind: "approval", title: `${repoName(p.repo)}#${p.number}: ${short(p.title, 80)}`, where: p.repo, since: p.updatedAt });
    }
    const stateFile = join(CFG.loopDir, "loop", `${p.repo.replace("/", "_")}-pr-${p.number}.json`);
    const rounds = existsSync(stateFile) ? Number(readJson(stateFile).rounds ?? 1) : 1;
    reviews.push({ repo: repoName(p.repo), pr: p.number, title: short(p.title, 120), stage, since: since ?? p.updatedAt, fixRounds: Math.max(0, rounds - 1) });
  }
});

// ---------- events: tracker tail + loop merges ----------
const events = [];
section("events: tracker", () => {
  const lines = readFileSync(join(CFG.internal, "tracker.md"), "utf8").trimEnd().split("\n").slice(-40);
  for (const line of lines) {
    const m = /^- (\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?Z)?)\s+([A-Z][A-Z0-9-]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, when, lane, text] = m;
    const at = when.length === 10 ? `${when}T00:00:00Z` : when.replace(/T(\d{2}:\d{2})Z$/, "T$1:00Z");
    const kind = /MERGED|merged/.test(text) ? "merged" : /opened/.test(text) ? "pr-opened" : /PAUSED|paused/.test(text) ? "paused" : /RESTART|[Rr]esum/.test(text) ? "resumed" : /[Ss]pawned/.test(text) ? "spawned" : "note";
    events.push({ at, kind, text: short(text), lane });
  }
});
section("events: loop", () => {
  const since = now - 24 * 3600_000;
  for (const c of calls) {
    if (c.kind !== "loop" || !["merged", "founder-wait", "stopped"].includes(c.event)) continue;
    if (Date.parse(c.time) < since) continue;
    events.push({ at: c.time, kind: c.event === "merged" ? "merged" : "review", text: `${repoName(c.repo)}#${c.pr} ${c.event.replace("-", " ")}`, repo: repoName(c.repo), pr: Number(c.pr) });
  }
  events.sort((a, b) => b.at.localeCompare(a.at));
  events.splice(30);
});

// ---------- models (last 7 days, real model calls only) ----------
const models = section("models", () => {
  const since = now - 7 * 24 * 3600_000;
  const roleOf = (k) => ({ 1: "key1", 2: "key2", proxy: "proxy", fixer: "fixer" })[String(k)] ?? `key ${k}`;
  const acc = new Map();
  for (const c of calls) {
    if (c.kind || c.outcome !== "ok" || Date.parse(c.time) < since) continue;
    const model = c.reported_model || c.model || "unknown";
    const role = roleOf(c.key);
    const k = `${role}|${model}`;
    const row = acc.get(k) ?? { model, role, calls: 0, inputTokens: 0, outputTokens: 0 };
    row.calls += 1;
    row.inputTokens += Number(c.input_tokens ?? 0) + Number(c.cache_read_tokens ?? 0) + Number(c.cache_write_tokens ?? 0);
    row.outputTokens += Number(c.output_tokens ?? 0);
    acc.set(k, row);
  }
  return [...acc.values()];
}, []);

// ---------- evals: live run records ----------
const evals = section("evals", () => {
  const dirs = [join(CFG.ipRepo, "evals/results")];
  for (const w of existsSync(CFG.worktrees) ? readdirSync(CFG.worktrees) : []) dirs.push(join(CFG.worktrees, w, "evals/results"));
  const seen = new Map();
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    for (const rec of readdirSync(d)) {
      const man = join(d, rec, "manifest.json");
      const sum = join(d, rec, "summary.json");
      if (!existsSync(man) || !existsSync(sum)) continue;
      const m = readJson(man);
      if (m.replay) continue;
      const prev = seen.get(m.id);
      if (prev && prev.t >= mtime(sum)) continue;
      seen.set(m.id, { t: mtime(sum), dir: join(d, rec), m, s: readJson(sum) });
    }
  }
  const lockLive = existsSync(join(CFG.internal, "locks/live-eval"));
  const harnessOf = (dir) => {
    try {
      const caseDir = readdirSync(dir).find((f) => !f.endsWith(".json"));
      const trial = readdirSync(join(dir, caseDir)).find((f) => f.startsWith("trial-"));
      return String(readJson(join(dir, caseDir, trial)).result?.harness ?? "unknown").replace(/^sha256:/, "").slice(0, 8);
    } catch {
      return "unknown";
    }
  };
  const recs = [...seen.values()].sort((a, b) => b.t - a.t).slice(0, 6);
  // The newest record's harness is current; records on any other harness are stale and never count.
  const current = recs.length ? harnessOf(recs[0].dir) : null;
  return recs
    .map(({ dir, m, s }) => {
      const cases = Object.values(s.cases ?? {});
      const trials = cases.reduce((n, c) => n + (c.n ?? 0), 0);
      const passed = cases.reduce((n, c) => n + (c.passed ?? 0), 0);
      const harness = harnessOf(dir);
      const stale = harness !== current;
      return {
        id: m.id,
        label: `${m.id}${m.knowledge === "off" ? " (ablation)" : ""}${stale ? " (stale harness, never counts)" : ""}`,
        status: stale ? "done" : m.finished_at ? (lockLive && !paused ? "running" : paused ? "paused" : "done") : "running",
        model: m.model,
        harness,
        casesDone: cases.length,
        casesTotal: Math.max(cases.length, (m.cases ?? []).length),
        trials,
        passed,
        failures: [],
      };
    });
}, []);

// Live-eval batches' model use (role "eval"), from each current record's summary totals.
section("models: evals", () => {
  for (const e of evals) {
    if (e.label.includes("stale harness")) continue;
    const dirs = [join(CFG.ipRepo, "evals/results"), ...(existsSync(CFG.worktrees) ? readdirSync(CFG.worktrees).map((w) => join(CFG.worktrees, w, "evals/results")) : [])];
    const dir = dirs.map((d) => join(d, e.id)).find((d) => existsSync(join(d, "summary.json")));
    if (!dir) continue;
    const t = readJson(join(dir, "summary.json")).totals ?? {};
    let row = models.find((m) => m.role === "eval" && m.model === e.model);
    if (!row) models.push((row = { model: e.model, role: "eval", calls: 0, inputTokens: 0, outputTokens: 0 }));
    row.calls += Number(t.model_calls ?? 0);
    row.inputTokens += Number(t.input_tokens ?? 0);
    row.outputTokens += Number(t.output_tokens ?? 0);
  }
});

// ---------- staff ----------
const staff = section("staff: ip", () =>
  cached("staff-ip", 10 * 60_000, () =>
    JSON.parse(execFileSync(join(CFG.ipRepo, ".venv/bin/python"), [join(HERE, "ip_staff.py")], { cwd: CFG.ipRepo, encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "ignore"] })),
  ),
[]);

// ---------- stable times: unchanged rows keep the previous snapshot's `since` ----------
section("stable times", () => {
  if (!existsSync(CFG.out)) return;
  const prev = new Map((readJson(CFG.out).health ?? []).map((h) => [h.id, h]));
  for (const h of health) {
    const p = prev.get(h.id);
    if (p && p.status === h.status && p.detail === h.detail && !["loop-ip", "loop-nirmaan"].includes(h.id)) h.since = p.since;
    // Loops: `since` is the status start, not the heartbeat, once the status holds.
    if (p && ["loop-ip", "loop-nirmaan"].includes(h.id) && p.status === h.status) h.since = p.since;
  }
});

// ---------- assemble, check, write ----------
for (const [name, msg] of problems) health.push({ id: `publisher-${name}`, label: `Publisher: ${name}`, status: "warn", detail: msg, since: iso(now) });

const snapshot = {
  version: 1,
  generatedAt: iso(now),
  source: "live",
  health,
  progress,
  waiting,
  lanes,
  events,
  models,
  reviews,
  staff,
  evals,
};

function keys(v, out = []) {
  if (Array.isArray(v)) v.forEach((x) => keys(x, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      out.push(k);
      keys(x, out);
    }
  }
  return out;
}
const leaked = [...new Set(keys(snapshot).filter((k) => FORBIDDEN.has(k.toLowerCase())))];
if (leaked.length) {
  console.error(`hq publisher: refusing to write, forbidden fields: ${leaked.join(", ")}`);
  process.exit(2);
}

const body = JSON.stringify(snapshot);
if (process.argv.includes("--print")) {
  process.stdout.write(JSON.stringify(snapshot, null, 2) + "\n");
} else {
  mkdirSync(dirname(CFG.out), { recursive: true });
  // Content hash without the timestamp: lets a store push skip unchanged snapshots.
  const digest = createHash("sha256").update(JSON.stringify({ ...snapshot, generatedAt: null })).digest("hex").slice(0, 16);
  const tmp = `${CFG.out}.tmp`;
  writeFileSync(tmp, body);
  renameSync(tmp, CFG.out); // atomic: hq never reads a half-written file
  writeFileSync(`${CFG.out}.digest`, digest);
  await pushToStore(body, digest);
}

/**
 * Push to the store (Upstash Redis REST) when the content changed, or every 5 minutes
 * as a heartbeat so hq can tell "quiet" from "publisher down". Credentials come from
 * the environment or ~/.nirmaan/hq/upstash.env (never from this repository).
 * No credentials: local-only mode, nothing is sent.
 */
async function pushToStore(payload, digest) {
  const creds = { ...readEnvFile(join(dirname(CFG.out), "upstash.env")), ...env };
  const url = creds.UPSTASH_REDIS_REST_URL;
  const token = creds.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  const mark = `${CFG.out}.pushed`;
  const last = existsSync(mark) ? readFileSync(mark, "utf8").split(" ") : [];
  const fresh = last[0] === digest && now - Number(last[1] ?? 0) < 5 * 60_000;
  if (fresh) return;
  const res = await fetch(`${url.replace(/\/$/, "")}/set/hq:snapshot`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: payload,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    console.error(`hq publisher: store push failed (${res.status})`);
    return;
  }
  writeFileSync(mark, `${digest} ${now}`);
}

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
