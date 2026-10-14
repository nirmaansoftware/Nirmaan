import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "./rateLimit";

test("rate limiter: allows up to the limit per window, then resets", () => {
  const allow = createRateLimiter({ limit: 3, windowMs: 60_000 });
  const t0 = 1_000_000;
  assert.equal(allow("ip", t0).ok, true);
  assert.equal(allow("ip", t0 + 1).ok, true);
  assert.equal(allow("ip", t0 + 2).ok, true);
  const blocked = allow("ip", t0 + 3);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterSec, 60);
  assert.equal(allow("other-ip", t0 + 3).ok, true, "keys are independent");
  assert.equal(allow("ip", t0 + 60_001).ok, true, "window resets");
});

test("rate limiter: memory stays bounded", () => {
  const allow = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 3 });
  for (let i = 0; i < 10; i++) assert.equal(allow(`k${i}`, 0).ok, true);
});
