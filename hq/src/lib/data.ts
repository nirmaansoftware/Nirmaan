import "server-only";
import { readFile } from "node:fs/promises";
import { sampleSnapshot } from "./sample";
import { SNAPSHOT_VERSION, forbiddenIn, type Snapshot } from "./snapshot";

/**
 * Where hq gets its snapshot. The only place that knows.
 *
 * 1. HQ_SNAPSHOT_FILE (running on the founder's Mac): the publisher's file,
 *    written atomically every ~15 s by publisher/publish.mjs.
 * 2. UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_READONLY_TOKEN (the deployed
 *    site): the store, read server-side with a READ-ONLY token; the browser never
 *    sees it. Cached 5 s so many open tabs cost one store read.
 * 3. Neither: the labelled sample.
 *
 * A snapshot with the wrong version or a forbidden field is never served.
 */
const CACHE_MS = 5_000;
let cache: { at: number; snap: Snapshot } | null = null;

function valid(snap: unknown): snap is Snapshot {
  return !!snap && typeof snap === "object" && (snap as Snapshot).version === SNAPSHOT_VERSION && forbiddenIn(snap).length === 0;
}

async function fromFile(file: string): Promise<Snapshot | null> {
  try {
    const snap = JSON.parse(await readFile(file, "utf8"));
    return valid(snap) ? snap : null;
  } catch {
    return null;
  }
}

async function fromStore(url: string, token: string): Promise<Snapshot | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.snap;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/get/hq:snapshot`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return cache?.snap ?? null;
    const body = (await res.json()) as { result?: string | null };
    const snap = body.result ? JSON.parse(body.result) : null;
    if (!valid(snap)) return cache?.snap ?? null;
    cache = { at: Date.now(), snap };
    return snap;
  } catch {
    return cache?.snap ?? null; // a store hiccup shows the last good snapshot, which the stamp marks as old
  }
}

export async function getSnapshot(): Promise<Snapshot> {
  const file = process.env.HQ_SNAPSHOT_FILE;
  if (file) return (await fromFile(file)) ?? sampleSnapshot();
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_READONLY_TOKEN;
  if (url && token) return (await fromStore(url, token)) ?? sampleSnapshot();
  return sampleSnapshot();
}
