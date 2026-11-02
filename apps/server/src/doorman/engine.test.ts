import assert from "node:assert/strict";
import { test } from "node:test";
import { decide, type DecisionInput } from "./engine.js";
import { defaultPolicy } from "./policy.js";

const now = new Date("2026-11-01T12:00:00Z");
const hoodie = { priceCents: 6800, quantity: 1, limitedDrop: true, stock: 41 };
const validPass = { capCents: 15000, spentCents: 0, expiresAt: new Date("2026-11-08T12:00:00Z"), revokedAt: null };

function input(overrides: Partial<DecisionInput>): DecisionInput {
  return {
    action: "checkout",
    identity: { tier: "signed", agentBlocked: false, pass: validPass },
    requestsLastMinute: 1,
    item: hoodie,
    dropLive: true,
    customerAlreadyBought: 0,
    policy: defaultPolicy,
    now,
    ...overrides,
  };
}

test("verified customer within cap is allowed", () => {
  const r = decide(input({}));
  assert.equal(r.decision, "allowed");
  assert.equal(r.tier, "verified");
  assert.equal(r.reason, "Verified customer, within $150 cap");
});

test("unknown visitors can browse but not buy", () => {
  assert.equal(decide(input({ identity: { tier: "unknown" }, action: "browse" })).decision, "allowed");
  const r = decide(input({ identity: { tier: "unknown" } }));
  assert.equal(r.decision, "blocked");
  assert.equal(r.reasonCode, "UNKNOWN_CANNOT_BUY");
});

test("too many requests are throttled before anything else", () => {
  const r = decide(input({ requestsLastMinute: 48 }));
  assert.equal(r.decision, "throttled");
  assert.equal(r.reason, "48 requests in a minute (limit 20)");
});

test("signed agent without a pass needs a step up at checkout", () => {
  const r = decide(input({ identity: { tier: "signed", agentBlocked: false, pass: null } }));
  assert.equal(r.decision, "step_up");
  assert.equal(r.tier, "signed");
});

test("a second drop item for the same customer is blocked", () => {
  const r = decide(input({ customerAlreadyBought: 1 }));
  assert.equal(r.decision, "blocked");
  assert.equal(r.reasonCode, "REPEAT_BUYER");
});

test("buying over the pass cap is blocked", () => {
  const r = decide(input({ item: { ...hoodie, priceCents: 20000, limitedDrop: false } }));
  assert.equal(r.reasonCode, "OVER_CAP");
});

test("the cap is a total: earlier purchases count against it", () => {
  // $136 already spent with a $150 pass: another $68 hoodie would make $204.
  const r = decide(input({ identity: { tier: "signed", agentBlocked: false, pass: { ...validPass, spentCents: 13600 } } }));
  assert.equal(r.decision, "blocked");
  assert.equal(r.reasonCode, "OVER_CAP");
  assert.equal(r.reason, "Over the customer's $150 cap ($136 already spent)");
  assert.equal(r.checks.find((c) => c.id === "cap")?.detail, "$204 of $150 cap");

  const fits = decide(input({ identity: { tier: "signed", agentBlocked: false, pass: { ...validPass, spentCents: 6800 } } }));
  assert.equal(fits.decision, "allowed");
  assert.equal(fits.checks.find((c) => c.id === "cap")?.detail, "$136 of $150 cap");
});

test("revoked and expired passes are blocked", () => {
  const revoked = decide(input({ identity: { tier: "signed", agentBlocked: false, pass: { ...validPass, revokedAt: now } } }));
  assert.equal(revoked.reasonCode, "PASS_REVOKED");
  const expired = decide(input({ identity: { tier: "signed", agentBlocked: false, pass: { ...validPass, expiresAt: now } } }));
  assert.equal(expired.reasonCode, "PASS_EXPIRED");
});

test("sold out and closed drops are blocked", () => {
  assert.equal(decide(input({ item: { ...hoodie, stock: 0 } })).reasonCode, "SOLD_OUT");
  assert.equal(decide(input({ dropLive: false })).reasonCode, "DROP_CLOSED");
});

test("an agent the store blocked stays blocked", () => {
  const r = decide(input({ identity: { tier: "signed", agentBlocked: true, pass: validPass } }));
  assert.equal(r.reasonCode, "AGENT_BLOCKED");
});
