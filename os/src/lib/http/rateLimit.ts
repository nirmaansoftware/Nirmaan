/**
 * Fixed-window rate limiter, in memory. Deliberately simple: it protects
 * the public intake endpoint from a single noisy client on one server
 * instance. It is NOT shared across instances or restarts, which is fine at
 * Nirmaan's scale; see /docs/engineering/security.md for when to move it
 * to shared storage.
 */
export function createRateLimiter(opts: { limit: number; windowMs: number; maxKeys?: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const maxKeys = opts.maxKeys ?? 10_000;

  return function allow(key: string, now = Date.now()): { ok: boolean; retryAfterSec: number } {
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (hits.size >= maxKeys) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
        if (hits.size >= maxKeys) hits.delete(hits.keys().next().value as string);
      }
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      return { ok: true, retryAfterSec: 0 };
    }
    entry.count += 1;
    if (entry.count > opts.limit) return { ok: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
    return { ok: true, retryAfterSec: 0 };
  };
}
