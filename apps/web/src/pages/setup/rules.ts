// Doorman has exactly four policy settings; each one is shown to the merchant as a rule card.
import { ApiError, type Decision, type Policy, type RuleCard } from "../../lib/api";
import { DECISION, IDENTITY } from "../../ui/status";

export type RuleKey = keyof Policy;
export type RuleToggles = Record<RuleKey, boolean>;

// Same order as the server's cards.
export const RULE_KEYS = ["dropLimitPerCustomer", "unknownAgents", "signedWithoutPass", "rateLimitPerMinute"] as const satisfies readonly RuleKey[];

export const ALL_ON: RuleToggles = { dropLimitPerCustomer: true, unknownAgents: true, signedWithoutPass: true, rateLimitPerMinute: true };

const META: Record<RuleKey, { title: string; icon: string }> = {
  dropLimitPerCustomer: { title: "Drop limit", icon: "M8 2v12M4 6l4-4 4 4" },
  unknownAgents: { title: "Unknown agents", icon: IDENTITY.unknown.icon },
  signedWithoutPass: { title: "Signed agents without a pass", icon: IDENTITY.signed.icon },
  rateLimitPerMinute: { title: "Rate limit", icon: DECISION.throttled.icon },
};

export const ruleIcon = (key: RuleKey) => META[key].icon;

export interface RuleDetail {
  desc: string;
  field: string;
  value: string;
  then: Decision;
}

export function ruleDetail(key: RuleKey, p: Policy): RuleDetail {
  switch (key) {
    case "dropLimitPerCustomer": {
      const n = p.dropLimitPerCustomer;
      return {
        desc: n === 1 ? "During drops, each verified customer can buy once." : `During drops, each verified customer can buy up to ${n}.`,
        field: "Limit per customer",
        value: String(n),
        then: "blocked",
      };
    }
    case "unknownAgents":
      return p.unknownAgents === "browse_only"
        ? { desc: "No signature: can look, never check out.", field: "Can", value: "Browse only", then: "blocked" }
        : { desc: "No signature: turned away at the door.", field: "Can", value: "Nothing", then: "blocked" };
    case "signedWithoutPass": {
      const v = p.signedWithoutPass;
      const desc = {
        step_up: "Pause until a customer confirms it in PayPal.",
        block: "Refused until a customer links it with a pass.",
        allow: "Let through without a customer's pass.",
      }[v];
      const then = ({ step_up: "step_up", block: "blocked", allow: "allowed" } as const)[v];
      return { desc, field: "At", value: "Checkout", then };
    }
    case "rateLimitPerMinute":
      return { desc: "Slow down anyone sending too many requests.", field: "Over", value: `${p.rateLimitPerMinute} req/min`, then: "throttled" };
  }
}

// The server sends cards in policy order; match on title first in case that ever changes.
export function cardFor(cards: RuleCard[], key: RuleKey, policy: Policy): RuleCard {
  const title = META[key].title.toLowerCase();
  const found = cards.find((c) => c.title.toLowerCase() === title) ?? cards[RULE_KEYS.indexOf(key)];
  if (found) return found;
  const d = ruleDetail(key, policy);
  return { title: META[key].title, setting: `${d.value} → ${DECISION[d.then].label}` };
}

// A toggled-off card means "don't apply this change": keep the saved value for that setting.
export function mergePolicy(saved: Policy, proposed: Policy, on: RuleToggles): Policy {
  const pick = <K extends RuleKey>(k: K): Policy[K] => (on[k] ? proposed[k] : saved[k]);
  return {
    dropLimitPerCustomer: pick("dropLimitPerCustomer"),
    unknownAgents: pick("unknownAgents"),
    signedWithoutPass: pick("signedWithoutPass"),
    rateLimitPerMinute: pick("rateLimitPerMinute"),
  };
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError && err.code && err.message !== err.code) return err.message;
  return "Doorman's server didn't respond. Check it's running, then try again.";
}

export function compileErrorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 503) return "The AI rule writer isn't switched on for this server. Add GEMINI_API_KEY to use it.";
    if (err.status === 400) return "Write your rules first (up to 2,000 characters).";
    if (err.status === 422) return err.message;
  }
  return errorText(err);
}
