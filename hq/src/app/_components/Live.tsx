"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/lib/snapshot";

/** How often the open page asks for a new snapshot (the publisher writes every ~15 s). */
export const REFRESH_MS = 10_000;
/** No snapshot for this long = the publisher (or the Mac it runs on) is down. */
export const QUIET_MS = 10 * 60_000;

type Connection = "live" | "stale" | "offline";

interface LiveValue {
  snapshot: Snapshot;
  /** When this browser last received a snapshot. */
  receivedAt: number;
  connection: Connection;
  /** Increments whenever a snapshot with a new generatedAt arrives (drives the pulse). */
  revision: number;
  refresh: () => void;
}

const LiveContext = createContext<LiveValue | null>(null);

export function LiveProvider({ initial, children }: { initial: Snapshot; children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [connection, setConnection] = useState<Connection>("live");
  const [revision, setRevision] = useState(0);
  const last = useRef(initial.generatedAt);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await fetch("/api/snapshot", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as Snapshot;
      setReceivedAt(Date.now());
      setConnection("live");
      if (next.generatedAt !== last.current) {
        last.current = next.generatedAt;
        setSnapshot(next);
        setRevision((r) => r + 1);
      }
    } catch {
      setConnection((c) => (c === "live" ? "stale" : "offline"));
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    // Poll only while the tab is visible; catch up the moment it is shown again.
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      clearInterval(timer);
      timer = setInterval(refresh, REFRESH_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refresh();
        start();
      } else clearInterval(timer);
    };
    start();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
    };
  }, [refresh]);

  return (
    <LiveContext.Provider value={{ snapshot, receivedAt, connection, revision, refresh }}>
      {children}
    </LiveContext.Provider>
  );
}

export function useLive(): LiveValue {
  const v = useContext(LiveContext);
  if (!v) throw new Error("useLive outside LiveProvider");
  return v;
}

export function useSnapshot(): Snapshot {
  return useLive().snapshot;
}

/** A clock that re-renders every `ms`, for "4 s ago" labels. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function ago(iso: string | number, now: number): string {
  const then = typeof iso === "number" ? iso : Date.parse(iso);
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function Ago({ at }: { at: string }) {
  const now = useNow(5000);
  return (
    <time dateTime={at} title={new Date(at).toLocaleString("en-IN")} suppressHydrationWarning>
      {ago(at, now)}
    </time>
  );
}

/** The header stamp: sample / live / stale, and when the page last heard from hq. */
export function LiveStamp() {
  const { snapshot, receivedAt, connection, revision } = useLive();
  const now = useNow(1000);
  const sample = snapshot.source === "sample";
  // The publisher pushes at least every 5 minutes; silence past 10 means it (or the Mac) is down.
  const quiet = !sample && now - Date.parse(snapshot.generatedAt) > QUIET_MS;
  const tone = sample ? "warn" : quiet ? "bad" : connection === "live" ? "good" : connection === "stale" ? "warn" : "bad";
  const text = sample ? "sample data" : quiet ? "publisher quiet" : connection;
  return (
    <span className="live-stamp" aria-live="polite">
      {/* Re-keyed on every new snapshot so the flash replays once. */}
      <span key={revision} className={`badge ${tone} live-flash`}>
        {text}
      </span>
      <span className="faint mono" suppressHydrationWarning>
        {quiet ? `last snapshot ${ago(snapshot.generatedAt, now)}` : `updated ${ago(receivedAt, now)}`}
      </span>
    </span>
  );
}
