import { z } from "zod";

// The merchant's rules. Stored in the database; written in plain English and
// converted by AI, then confirmed by the merchant before they take effect.
export const policySchema = z.object({
  dropLimitPerCustomer: z.number().int().min(1).max(10),
  unknownAgents: z.enum(["browse_only", "block"]),
  signedWithoutPass: z.enum(["step_up", "block", "allow"]),
  rateLimitPerMinute: z.number().int().min(1).max(600),
});

export type Policy = z.infer<typeof policySchema>;

export const defaultPolicy: Policy = {
  dropLimitPerCustomer: 1,
  unknownAgents: "browse_only",
  signedWithoutPass: "step_up",
  rateLimitPerMinute: 20,
};

export const defaultRulesText =
  "During drops, one hoodie per verified customer. Unknown bots can browse but never buy. " +
  "Agents without a pass need the customer to confirm. Slow down anyone sending more than 20 requests a minute.";
