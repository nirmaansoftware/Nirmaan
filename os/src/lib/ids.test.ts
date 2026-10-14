import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCode, nextCode, prefixOf } from "./ids";

test("formatCode pads to three digits and grows beyond", () => {
  assert.equal(formatCode("REQ", 4), "REQ-004");
  assert.equal(formatCode("REQ", 104), "REQ-104");
  assert.equal(formatCode("REQ", 1000), "REQ-1000");
});

test("prefixOf recognises only our prefixes", () => {
  assert.equal(prefixOf("FEAT-027"), "FEAT");
  assert.equal(prefixOf("DEPLOY-1000"), "DEPLOY");
  assert.equal(prefixOf("NOPE-001"), null);
  assert.equal(prefixOf("REQ-1"), null);
  assert.equal(prefixOf("req-001"), null);
});

test("nextCode never hands out the same code twice, even concurrently", async () => {
  const codes = await Promise.all(Array.from({ length: 15 }, () => nextCode("TEST")));
  assert.equal(new Set(codes).size, codes.length);
  // Other test files allocate TEST- codes in parallel, so ours needn't be
  // contiguous; what matters is that none is ever handed out twice.
  const numbers = codes.map((c) => Number(c.split("-")[1]));
  assert.ok(numbers.every((n) => Number.isInteger(n) && n > 0));
});
