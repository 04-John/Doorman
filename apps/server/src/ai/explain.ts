// "Why Doorman did this": a short plain-English explanation of one decision.
// The decision itself is always made by the rules engine; AI only explains it,
// using nothing but the recorded facts.
import { createHash } from "node:crypto";
import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { money } from "../doorman/engine.js";
import type { EventRow } from "../doorman/events.js";
import { aiEnabled, fastest, model } from "./model.js";

const tierLabel = { verified: "verified customer's agent", signed: "signed agent with no linked customer", unknown: "unknown visitor" };

const SYSTEM = `You explain decisions made by Doorman, a checkpoint that decides whether AI shopping agents may buy from an online store.
Write 2 to 3 short sentences for the store owner. Plain English, no jargon, no markdown, no lists.
Start with the deciding factor. Use only the facts given; never invent names, numbers or events.
Decisions mean: allowed = let through; step_up = paused until the customer confirms the agent with Log in with PayPal; throttled = slowed down for sending too many requests (it is NOT blocked); blocked = refused.
Say "held" for money reserved but not charged, "charged" for taken, and "released" for a cancelled hold.
Call agents by their name when one is given. Write numbers and money as digits, like $68 or 59 requests.`;

export interface ExplainContext {
  event: EventRow;
  order?: { status: string; releaseReason: string | null } | null;
  timeline: Pick<EventRow, "action" | "decision" | "reason">[];
}

function facts({ event, order, timeline }: ExplainContext) {
  return {
    visitor: event.agentName ? `${event.agentName} by ${event.operator} (${tierLabel[event.tier]})` : tierLabel.unknown,
    customer: event.customerName,
    action: event.action,
    decision: event.decision,
    reason: event.reason,
    amount: event.amountCents ? money(event.amountCents) : null,
    checks: event.checks.filter((c) => c.status !== "na").map((c) => `${c.id} ${c.status}: ${c.detail}`),
    order: order ?? null,
    timeline: event.orderId ? timeline.map((t) => `${t.action} → ${t.decision}: ${t.reason}`) : [],
  };
}

// Used when AI is unavailable, so the panel is never empty.
function fallback({ event }: ExplainContext): string {
  const verb = { allowed: "Doorman let this through", step_up: "Doorman paused this for the customer to confirm", throttled: "Doorman slowed this visitor down", blocked: "Doorman refused this" }[event.decision];
  const failed = event.checks.filter((c) => c.status === "fail").map((c) => c.detail.toLowerCase());
  return `${verb}: ${event.reason.charAt(0).toLowerCase()}${event.reason.slice(1)}.${failed.length ? ` Failed check: ${failed.join("; ")}.` : ""}`;
}

// Identical situations (say, 30 bots blocked for the same reason) share one explanation.
const cache = new Map<string, string>();

export async function explain(ctx: ExplainContext): Promise<{ text: string; source: "ai" | "rules" }> {
  if (ctx.event.explanation) return { text: ctx.event.explanation, source: "ai" };
  if (!aiEnabled) return { text: fallback(ctx), source: "rules" };

  const prompt = JSON.stringify(facts(ctx), null, 2);
  const key = createHash("sha256").update(prompt).digest("hex");
  let text = cache.get(key);
  if (!text) {
    try {
      // The light model answers in about a second, so the detail panel isn't kept waiting.
      const result = await generateText({
        model: model("fast"),
        system: SYSTEM,
        prompt: `Facts about one decision:\n${prompt}`,
        providerOptions: fastest,
        abortSignal: AbortSignal.timeout(15_000),
      });
      text = result.text.trim();
      if (!text) throw new Error("empty explanation");
      cache.set(key, text);
    } catch (err) {
      console.warn("[ai] explanation failed, using the rules-based one:", err instanceof Error ? err.message : err);
      return { text: fallback(ctx), source: "rules" };
    }
  }
  await db.update(schema.events).set({ explanation: text }).where(eq(schema.events.id, ctx.event.id));
  return { text, source: "ai" };
}
