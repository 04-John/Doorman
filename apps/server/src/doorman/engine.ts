// The decision engine: plain code, no AI. Given who is at the door and what
// they're trying to do, it returns one decision, a reason, and the checks
// behind it. The same input always gives the same answer.
import type { Policy } from "./policy.js";

export type Decision = "allowed" | "step_up" | "throttled" | "blocked";
export type Action = "browse" | "cart" | "checkout";
export type Tier = "verified" | "signed" | "unknown";

export type CheckId = "signature" | "pass" | "cap" | "drop_limit" | "rate" | "payer_match";
export interface Check {
  id: CheckId;
  status: "pass" | "fail" | "na";
  detail: string;
}

export interface PassInfo {
  // The most the agent may spend over the life of the pass.
  capCents: number;
  // Already spent with it: paid, held, or waiting for the customer's approval.
  spentCents: number;
  expiresAt: Date;
  revokedAt: Date | null;
}

export type Identity =
  | { tier: "unknown" }
  | { tier: "signed"; agentBlocked: boolean; pass: PassInfo | null };

export interface DecisionInput {
  action: Action;
  identity: Identity;
  requestsLastMinute: number;
  item?: { priceCents: number; quantity: number; limitedDrop: boolean; stock: number };
  dropLive: boolean;
  // Units of this drop item the pass holder already has held or charged in this drop.
  customerAlreadyBought: number;
  policy: Policy;
  now: Date;
}

export interface DecisionResult {
  decision: Decision;
  tier: Tier;
  reasonCode: string;
  reason: string;
  checks: Check[];
}

export const money = (cents: number) =>
  `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;

function passProblem(pass: PassInfo, now: Date): { code: string; reason: string } | null {
  if (pass.revokedAt) return { code: "PASS_REVOKED", reason: "The customer revoked this agent's pass" };
  if (pass.expiresAt <= now) return { code: "PASS_EXPIRED", reason: "This agent's pass has expired" };
  return null;
}

export function decide(input: DecisionInput): DecisionResult {
  const { action, identity, item, policy, now } = input;
  const buying = action !== "browse";
  const amount = item ? item.priceCents * item.quantity : 0;

  const pass = identity.tier === "signed" ? identity.pass : null;
  const problem = pass ? passProblem(pass, now) : null;
  const tier: Tier = identity.tier === "unknown" ? "unknown" : pass && !problem ? "verified" : "signed";

  const checks: Record<CheckId, Check> = {
    signature: {
      id: "signature",
      status: identity.tier === "unknown" ? "fail" : "pass",
      detail: identity.tier === "unknown" ? "No signature" : "Valid signature from a registered key",
    },
    pass: {
      id: "pass",
      status: !pass ? "na" : problem ? "fail" : "pass",
      detail: !pass ? "No agent pass" : problem ? problem.reason : "Valid pass from a verified PayPal customer",
    },
    cap: { id: "cap", status: "na", detail: "Not buying" },
    drop_limit: { id: "drop_limit", status: "na", detail: "Not a drop item" },
    rate: {
      id: "rate",
      status: input.requestsLastMinute > policy.rateLimitPerMinute ? "fail" : "pass",
      detail: `${input.requestsLastMinute} requests in the last minute (limit ${policy.rateLimitPerMinute})`,
    },
    payer_match: { id: "payer_match", status: "na", detail: "Checked after the customer approves in PayPal" },
  };
  const result = (decision: Decision, reasonCode: string, reason: string): DecisionResult => ({
    decision,
    tier,
    reasonCode,
    reason,
    checks: Object.values(checks),
  });

  if (checks.rate.status === "fail") {
    return result("throttled", "RATE_LIMIT", `${input.requestsLastMinute} requests in a minute (limit ${policy.rateLimitPerMinute})`);
  }
  if (identity.tier === "signed" && identity.agentBlocked) {
    return result("blocked", "AGENT_BLOCKED", "The store blocked this agent");
  }

  if (identity.tier === "unknown") {
    if (policy.unknownAgents === "block") return result("blocked", "UNKNOWN_BLOCKED", "Unknown agents are blocked");
    if (!buying) return result("allowed", "UNKNOWN_BROWSING", "Unknown visitor browsing");
    return result(
      "blocked",
      "UNKNOWN_CANNOT_BUY",
      input.dropLive && item?.limitedDrop ? "Unknown agent tried to buy during a drop" : "Unknown agents can browse but not buy",
    );
  }

  if (problem) return result("blocked", problem.code, problem.reason);

  if (!buying) return result("allowed", tier === "verified" ? "VERIFIED_BROWSING" : "SIGNED_BROWSING", "Browsing");

  if (item?.limitedDrop) {
    if (!input.dropLive) return result("blocked", "DROP_CLOSED", "The drop isn't open");
    if (item.stock <= 0) return result("blocked", "SOLD_OUT", "Sold out");
    checks.drop_limit = {
      id: "drop_limit",
      status: "pass",
      detail: `${input.customerAlreadyBought} bought so far (limit ${policy.dropLimitPerCustomer} per customer)`,
    };
    if (item.quantity > policy.dropLimitPerCustomer) {
      checks.drop_limit = {
        id: "drop_limit",
        status: "fail",
        detail: `Asked for ${item.quantity} (limit ${policy.dropLimitPerCustomer} per customer)`,
      };
      return result("blocked", "OVER_DROP_LIMIT", `Tried to buy ${item.quantity}; the limit is ${policy.dropLimitPerCustomer} per customer`);
    }
    if (tier === "verified" && input.customerAlreadyBought + item.quantity > policy.dropLimitPerCustomer) {
      checks.drop_limit = {
        id: "drop_limit",
        status: "fail",
        detail: `Already has ${input.customerAlreadyBought} (limit ${policy.dropLimitPerCustomer} per customer)`,
      };
      return result("blocked", "REPEAT_BUYER", `Another one for the same customer (limit ${policy.dropLimitPerCustomer})`);
    }
  }

  if (tier === "signed") {
    // No customer is linked yet, so the cap and per-customer limit are checked at approval.
    if (policy.signedWithoutPass === "block") return result("blocked", "NO_PASS_BLOCKED", "Signed agent with no linked customer");
    if (policy.signedWithoutPass === "step_up" && action === "checkout") {
      return result("step_up", "STEP_UP_NO_PASS", "Signed agent with no linked customer");
    }
    return result("allowed", "SIGNED_OK", "Signed agent");
  }

  const { capCents, spentCents } = pass!;
  checks.cap = { id: "cap", status: "pass", detail: `${money(spentCents + amount)} of ${money(capCents)} cap` };
  if (spentCents + amount > capCents) {
    checks.cap.status = "fail";
    return result(
      "blocked",
      "OVER_CAP",
      spentCents ? `Over the customer's ${money(capCents)} cap (${money(spentCents)} already spent)` : `Over the customer's ${money(capCents)} cap`,
    );
  }

  return result("allowed", "VERIFIED_OK", `Verified customer, within ${money(pass!.capCents)} cap`);
}
