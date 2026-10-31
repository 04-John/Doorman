// The merchant writes rules in plain English; AI turns them into exact settings.
// Nothing changes until the merchant reviews the result and saves it, and
// anything the settings can't express is listed instead of silently dropped.
import { generateText, Output } from "ai";
import { z } from "zod";
import { policySchema, type Policy } from "../doorman/policy.js";
import { model, quick } from "./model.js";

const compiledSchema = z.object({
  policy: policySchema.extend({
    dropLimitPerCustomer: z.number().int().min(1).max(10).describe("Max units of a limited-drop item per customer"),
    unknownAgents: z.enum(["browse_only", "block"]).describe("Visitors with no signature: may browse but never buy, or blocked entirely"),
    signedWithoutPass: z
      .enum(["step_up", "block", "allow"])
      .describe("Signed agents no customer has linked: step_up = customer must confirm in PayPal before paying"),
    rateLimitPerMinute: z.number().int().min(1).max(600).describe("Requests per minute before a visitor is slowed down"),
  }),
  unsupported: z
    .array(z.string())
    .describe("Short quotes of anything in the text these four settings cannot express. Empty if everything fits."),
});

const SYSTEM = `You convert a store owner's plain-English rules for AI shopping agents into Doorman settings.
There are exactly four settings. Map what the owner wrote onto them.
If the text doesn't mention a setting, keep its current value.
If the owner asks for something these settings can't do (time windows, specific countries, discounts and so on), keep it out of the settings and quote it briefly in "unsupported". Never pretend a rule was applied.`;

export interface RuleCard {
  title: string;
  setting: string;
}

export function describePolicy(policy: Policy): RuleCard[] {
  const unknown = { browse_only: "Can browse, can't buy", block: "Blocked" }[policy.unknownAgents];
  const noPass = { step_up: "Step up: customer confirms in PayPal", block: "Blocked", allow: "Allowed" }[policy.signedWithoutPass];
  return [
    { title: "Drop limit", setting: `${policy.dropLimitPerCustomer} per customer` },
    { title: "Unknown agents", setting: unknown },
    { title: "Signed agents without a pass", setting: noPass },
    { title: "Rate limit", setting: `${policy.rateLimitPerMinute} requests a minute, then throttle` },
  ];
}

export async function compileRules(rulesText: string, current: Policy) {
  const { output } = await generateText({
    model: model(),
    system: SYSTEM,
    prompt: `Current settings:\n${JSON.stringify(current)}\n\nThe owner's rules:\n${rulesText}`,
    output: Output.object({ schema: compiledSchema }),
    providerOptions: quick,
    abortSignal: AbortSignal.timeout(30_000),
  });
  const policy = policySchema.parse(output.policy);
  return { policy, cards: describePolicy(policy), unsupported: output.unsupported };
}
