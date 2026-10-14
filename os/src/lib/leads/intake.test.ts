import { test } from "node:test";
import assert from "node:assert/strict";
import { validateIntake } from "./intake";
import { allowedLeadTransitions, setLeadStatus } from "./service";
import { prisma } from "../db/client";
import { FOUNDER, actorAs, cleanupLead, makeLead } from "../testHelpers/businessFixtures";

const valid = {
  problem: "We lose track of customer follow-ups because everything lives in WhatsApp.",
  contactName: "Asha",
  contactEmail: "Asha@Example.com",
};

test("intake: a problem, a name and an email are enough", () => {
  const r = validateIntake(valid);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.contactEmail, "asha@example.com", "email normalised");
});

test("intake: explains what's missing, field by field", () => {
  const r = validateIntake({ problem: "too short", contactEmail: "nope" });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.errors.problem!, /at least 20/);
    assert.ok(r.errors.contactName);
    assert.match(r.errors.contactEmail!, /doesn't look right/);
  }
});

test("intake: accepts the website form's field names (name/email) too", () => {
  const r = validateIntake({ problem: valid.problem, name: "Ravi", email: "ravi@example.com" });
  assert.equal(r.ok, true);
});

test("intake: honeypot rejects bots without saying why", () => {
  const r = validateIntake({ ...valid, _gotcha: "http://spam" });
  assert.deepEqual(r, { ok: false, errors: { form: "spam" } });
});

test("intake: strips control characters, caps lengths, ignores unknown fields", () => {
  const r = validateIntake({ ...valid, business: "Bakery\u0000\u0007", urgency: "x".repeat(500), role: "FOUNDER" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.urgency);
  const ok = validateIntake({ ...valid, business: "Bakery\u0000\u0007", role: "FOUNDER" });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.data.business, "Bakery");
    assert.equal("role" in ok.data, false);
  }
});

test("intake: keeps what the visitor was looking at on the website, within limits", () => {
  const r = validateIntake({ ...valid, interest: "Growth package (from ₹35,000 · 3–4 weeks)" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.interest, "Growth package (from ₹35,000 · 3–4 weeks)");
  const long = validateIntake({ ...valid, interest: "x".repeat(201) });
  assert.equal(long.ok, false);
  if (!long.ok) assert.ok(long.errors.interest);
});

test("lead status: WON can't be set by hand, LOST needs a reason, roles are checked", async () => {
  assert.equal(allowedLeadTransitions("PROPOSAL").includes("WON"), false);
  const lead = await makeLead();
  try {
    assert.match(lead.code, /^LEAD-\d{3,}$/);
    await assert.rejects(() => setLeadStatus(FOUNDER, lead.id, "WON"), /can't move/);
    await assert.rejects(() => setLeadStatus(FOUNDER, lead.id, "LOST"), /Say why/);
    await assert.rejects(() => setLeadStatus(actorAs("ENGINEER"), lead.id, "QUALIFIED"), /permission/);
    await setLeadStatus(FOUNDER, lead.id, "LOST", "Budget far below scope");
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    assert.equal(after.status, "LOST");
    assert.equal(after.lostReason, "Budget far below scope");
    assert.equal(await prisma.auditLog.count({ where: { entityId: lead.id, action: "lead.status_changed" } }), 1);
  } finally {
    await cleanupLead(lead.id);
  }
});
