import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PACKAGES } from "./basics";

// website/src/_data/pricing.json is the single source for every public price.
// The OS image is built from os/ alone (Dockerfile.os), so it cannot import that
// file; instead this test fails when PACKAGES drifts from it. `npm test` runs
// from os/, so the repository root is one level up.
const pricingPath = path.resolve(process.cwd(), "..", "website", "src", "_data", "pricing.json");

test("PACKAGES matches the website's pricing.json (id, name, from price, order)", () => {
  const pricing = JSON.parse(readFileSync(pricingPath, "utf8")) as {
    packages: { id: string; name: string; from: number }[];
  };
  const fromWebsite = pricing.packages.map(({ id, name, from }) => ({ id, name, from }));
  const fromOs = PACKAGES.map(({ id, name, from }) => ({ id, name, from }));
  assert.deepEqual(fromOs, fromWebsite);
});
