// Merchant dashboard API. Every route but sign-in needs the merchant password
// (judges get it with the testing instructions).
import { and, asc, count, countDistinct, desc, eq, inArray, sum } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { explain } from "../ai/explain.js";
import { aiEnabled } from "../ai/model.js";
import { compileRules, describePolicy } from "../ai/rules.js";
import { setAgentBlocked } from "../agents/registry.js";
import { db, schema } from "../db/client.js";
import { ApprovalError, releaseByMerchant } from "../doorman/approvals.js";
import { approvalUrl } from "../doorman/checkout.js";
import type { Check } from "../doorman/engine.js";
import { eventBus, type EventRow } from "../doorman/events.js";
import { endMerchantSession, merchantOnly, merchantPasswordSet, merchantSignedIn, passwordMatches, startMerchantSession } from "../doorman/merchant-session.js";
import { policySchema } from "../doorman/policy.js";
import { currentDrop, expireStaleApprovals, getProduct, getRules, resetDrop, saveRules, type DropRow } from "../doorman/store.js";
import { paypal } from "../paypal/client.js";
import { Gate, shared } from "../lib/bounded.js";
import { perMinute } from "../lib/limits.js";
import { latestTranscript, runDrop, simulationRunning } from "../sim/run.js";

// The drop the dashboard shows: the latest one, unless it was reset.
async function shownDrop(): Promise<DropRow | undefined> {
  const drop = await currentDrop();
  return drop && !drop.cleared ? drop : undefined;
}

async function summary() {
  const drop = await shownDrop();
  if (!drop) return { drop: null, kpis: null, simulationRunning: simulationRunning() };
  await expireStaleApprovals();
  // Independent queries, run together to keep the dashboard snappy.
  const [product, byDecision, [visitors], [bots], money] = await Promise.all([
    getProduct(drop.productId),
    db
      .select({ decision: schema.events.decision, n: count() })
      .from(schema.events)
      .where(and(eq(schema.events.dropId, drop.id), inArray(schema.events.action, ["browse", "cart", "checkout"])))
      .groupBy(schema.events.decision),
    db.select({ n: countDistinct(schema.events.visitorKey) }).from(schema.events).where(eq(schema.events.dropId, drop.id)),
    db
      .select({ n: countDistinct(schema.events.visitorKey) })
      .from(schema.events)
      .where(and(eq(schema.events.dropId, drop.id), eq(schema.events.tier, "unknown"), inArray(schema.events.decision, ["blocked", "throttled"]))),
    db
      .select({ status: schema.orders.status, cents: sum(schema.orders.amountCents), units: sum(schema.orders.quantity) })
      .from(schema.orders)
      .where(eq(schema.orders.dropId, drop.id))
      .groupBy(schema.orders.status),
  ]);

  const decisions = Object.fromEntries(byDecision.map((r) => [r.decision, r.n]));
  const byStatus = Object.fromEntries(money.map((r) => [r.status, { cents: Number(r.cents ?? 0), units: Number(r.units ?? 0) }]));
  return {
    drop: {
      id: drop.id,
      status: drop.status,
      productName: product?.name,
      priceCents: product?.priceCents ?? 0,
      stockLeft: product?.stock ?? 0,
      stockTotal: drop.stockTotal,
      sold: byStatus.charged?.units ?? 0,
      startedAt: drop.startedAt,
      endedAt: drop.endedAt,
    },
    kpis: {
      agentsSeen: visitors?.n ?? 0,
      allowed: decisions.allowed ?? 0,
      stepUp: decisions.step_up ?? 0,
      throttled: decisions.throttled ?? 0,
      blocked: decisions.blocked ?? 0,
      awaitingApprovalCents: byStatus.awaiting_approval?.cents ?? 0,
      heldCents: byStatus.held?.cents ?? 0,
      chargedCents: byStatus.charged?.cents ?? 0,
      botsBlocked: bots?.n ?? 0,
    },
    simulationRunning: simulationRunning(),
  };
}

// The payer match is only known once the customer has approved in PayPal, so
// fill it in from the order rather than the moment of the decision.
function withPayerMatch(checks: Check[], order: { status: string; releaseReason: string | null } | undefined, payerName: string | null): Check[] {
  if (!order) return checks;
  const mismatch = order.releaseReason?.startsWith("Paid from a different PayPal account");
  const payer: Check =
    order.status === "charged"
      ? { id: "payer_match", status: "pass", detail: `${payerName ?? "The pass holder"} paid` }
      : mismatch
        ? { id: "payer_match", status: "fail", detail: "Different account paid" }
        : { id: "payer_match", status: "na", detail: "After approval in PayPal" };
  return checks.some((c) => c.id === "payer_match") ? checks.map((c) => (c.id === "payer_match" ? payer : c)) : [...checks, payer];
}

async function eventDetail(id: string) {
  const [event] = await db.select().from(schema.events).where(eq(schema.events.id, id));
  if (!event) return null;
  const none = Promise.resolve([] as never[]);
  const [[agent], [order], [firstSeen], timeline, before] = await Promise.all([
    event.agentKeyId ? db.select().from(schema.agents).where(eq(schema.agents.keyId, event.agentKeyId)) : none,
    event.orderId ? db.select().from(schema.orders).where(eq(schema.orders.id, event.orderId)) : none,
    db
      .select({ at: schema.events.at })
      .from(schema.events)
      .where(event.dropId ? and(eq(schema.events.visitorKey, event.visitorKey), eq(schema.events.dropId, event.dropId)) : eq(schema.events.visitorKey, event.visitorKey))
      .orderBy(asc(schema.events.at))
      .limit(1),
    // Timeline: everything that happened to this order, or this visitor's recent steps.
    db
      .select()
      .from(schema.events)
      .where(event.orderId ? eq(schema.events.orderId, event.orderId) : eq(schema.events.visitorKey, event.visitorKey))
      .orderBy(desc(schema.events.at))
      .limit(20),
    // For an order, also show how the agent got there (browse and cart before checkout).
    event.orderId && event.agentKeyId && event.dropId
      ? db
          .select()
          .from(schema.events)
          .where(and(eq(schema.events.visitorKey, event.visitorKey), eq(schema.events.dropId, event.dropId), inArray(schema.events.action, ["browse", "cart"])))
          .orderBy(desc(schema.events.at))
          .limit(4)
      : none,
  ]);
  const [[pass], [customer], webhooks] = await Promise.all([
    order?.passId ? db.select().from(schema.passes).where(eq(schema.passes.id, order.passId)) : none,
    order?.expectedPayerId ? db.select().from(schema.customers).where(eq(schema.customers.payerId, order.expectedPayerId)) : none,
    order
      ? db
          .select({ type: schema.paypalWebhookEvents.type, outcome: schema.paypalWebhookEvents.outcome, at: schema.paypalWebhookEvents.receivedAt })
          .from(schema.paypalWebhookEvents)
          .where(eq(schema.paypalWebhookEvents.paypalOrderId, order.paypalOrderId))
          .orderBy(asc(schema.paypalWebhookEvents.receivedAt))
      : none,
  ]);

  return {
    event: { ...event, checks: withPayerMatch(event.checks, order, customer?.name ?? null) },
    source: event.visitorKey.startsWith("ip:") ? event.visitorKey.slice(3) : null,
    firstSeen: firstSeen?.at ?? event.at,
    agent: agent && { keyId: agent.keyId, name: agent.name, operator: agent.operator, blocked: agent.blocked, registeredAt: agent.registeredAt },
    customer: customer ? { name: customer.name, verified: customer.verified } : null,
    pass: pass && { capCents: pass.capCents, expiresAt: pass.expiresAt, revokedAt: pass.revokedAt },
    order: order && {
      id: order.id,
      status: order.status,
      amountCents: order.amountCents,
      approvalUrl: approvalUrl(order),
      releaseReason: order.releaseReason,
      paypal: { orderId: order.paypalOrderId, authorizationId: order.authorizationId, captureId: order.captureId },
      // What PayPal's webhooks reported about this order, and what Doorman did.
      webhooks,
    },
    timeline: [...before.filter((b) => b.at < (timeline.at(-1)?.at ?? event.at)), ...timeline].sort((a, b) => +a.at - +b.at),
    explanation: event.explanation ? { text: event.explanation, source: "ai" as const } : null,
  };
}

// The PayPal business account this store is connected to (looked up once).
let merchantInfo: Promise<{ connected: boolean; email: string | null; merchantId: string | null }> | null = null;
function merchant() {
  merchantInfo ??= paypal<{ payer_id?: string; emails?: { value: string; primary?: boolean }[] }>("/v1/identity/oauth2/userinfo?schema=paypalv1.1")
    .then((me) => ({
      connected: true,
      email: me.emails?.find((e) => e.primary)?.value ?? me.emails?.[0]?.value ?? null,
      merchantId: me.payer_id ?? null,
    }))
    .catch(() => {
      merchantInfo = null;
      return { connected: false, email: null, merchantId: null };
    });
  return merchantInfo;
}

// Every open dashboard refreshes its totals and the assistant's conversation; they
// share one database read a second however many are open.
const sharedSummary = shared(1_000, summary);
const sharedTranscript = shared(1_000, async () => {
  const { transcript, agent, customer } = latestTranscript();
  const orderIds = transcript.flatMap((t) => (t.orderId ? [t.orderId] : []));
  const orders = orderIds.length
    ? await db.select({ id: schema.orders.id, status: schema.orders.status, amountCents: schema.orders.amountCents }).from(schema.orders).where(inArray(schema.orders.id, orderIds))
    : [];
  return { transcript, orders, running: simulationRunning(), agent, customer };
});

// Live feed connections: each is held open, so there's a ceiling. The JSON for an
// event is built once, not once per viewer.
const MAX_STREAMS = 200;
let openStreams = 0;
const eventJson = new WeakMap<EventRow, string>();
function toJson(row: EventRow): string {
  let json = eventJson.get(row);
  if (!json) eventJson.set(row, (json = JSON.stringify(row)));
  return json;
}

// Only one rule rewrite at a time goes to Gemini.
const compiling = new Gate(1);

export const merchantRoutes = new Hono()
  .get("/api/merchant/session", (c) => c.json({ signedIn: merchantSignedIn(c), passwordSet: merchantPasswordSet }))

  .post("/api/merchant/login", perMinute(10), async (c) => {
    if (!merchantPasswordSet) return c.json({ error: "merchant_password_not_set", message: "The merchant side is locked until MERCHANT_PASSWORD is set on the server." }, 503);
    const body = await c.req.json().catch(() => null);
    if (typeof body?.password !== "string" || !passwordMatches(body.password)) {
      return c.json({ error: "wrong_password", message: "That isn't the merchant password." }, 401);
    }
    startMerchantSession(c);
    return c.json({ signedIn: true });
  })

  .post("/api/merchant/logout", (c) => {
    endMerchantSession(c);
    return c.json({ signedIn: false });
  })

  .get("/api/dashboard", merchantOnly,async (c) => c.json(await sharedSummary()))

  .get("/api/merchant", merchantOnly, async (c) => c.json(await merchant()))

  .get("/api/events", merchantOnly, async (c) => {
    const drop = await shownDrop();
    if (!drop) return c.json({ events: [] });
    const rows = await db
      .select({ event: schema.events, orderStatus: schema.orders.status })
      .from(schema.events)
      .leftJoin(schema.orders, eq(schema.orders.id, schema.events.orderId))
      .where(eq(schema.events.dropId, drop.id))
      .orderBy(desc(schema.events.at))
      .limit(Math.min(Number(c.req.query("limit") ?? 300), 1000));
    return c.json({ events: rows.map((r) => ({ ...r.event, orderStatus: r.orderStatus })) });
  })

  // Live feed for the dashboard (Server-Sent Events).
  .get("/api/events/stream", merchantOnly, (c) => {
    if (openStreams >= MAX_STREAMS) return c.json({ error: "busy", message: "Too many dashboards open right now." }, 503);
    openStreams += 1;
    return streamSSE(c, async (stream) => {
      // A write can fail if the browser has just gone away; that must never take the server down.
      const send = (row: EventRow) => void stream.writeSSE({ event: "event", data: toJson(row) }).catch(() => eventBus.off("event", send));
      // On shutdown the stream ends, and the browser reconnects to the new server.
      const end = () => stream.abort();
      eventBus.on("event", send);
      eventBus.once("shutdown", end);
      try {
        while (!stream.aborted) {
          await stream.writeSSE({ event: "ping", data: "" });
          await stream.sleep(15_000);
        }
      } finally {
        eventBus.off("event", send);
        eventBus.off("shutdown", end);
        openStreams -= 1;
      }
    });
  })

  .get("/api/events/:id", merchantOnly, async (c) => {
    const detail = await eventDetail(c.req.param("id"));
    return detail ? c.json(detail) : c.json({ error: "not_found" }, 404);
  })

  // Written on demand, so the detail panel can open instantly and show a loading state.
  .get("/api/events/:id/explanation", merchantOnly, perMinute(60), async (c) => {
    const id = c.req.param("id");
    const [event] = await db.select().from(schema.events).where(eq(schema.events.id, id));
    if (!event) return c.json({ error: "not_found" }, 404);
    const [order] = event.orderId ? await db.select().from(schema.orders).where(eq(schema.orders.id, event.orderId)) : [];
    const timeline = event.orderId
      ? await db.select().from(schema.events).where(eq(schema.events.orderId, event.orderId)).orderBy(asc(schema.events.at))
      : [];
    return c.json(await explain({ event, order, timeline }));
  })

  .post("/api/drop/run", merchantOnly, perMinute(6), async (c) => {
    if (simulationRunning()) return c.json({ error: "already_running" }, 409);
    const drop = await runDrop();
    return c.json({ dropId: drop.id }, 202);
  })

  .post("/api/drop/reset", merchantOnly, perMinute(6), async (c) => {
    if (simulationRunning()) return c.json({ error: "simulation_running" }, 409);
    await resetDrop();
    return c.json({ ok: true });
  })

  // The assistant's conversation, with the latest status of any order it created.
  .get("/api/drop/transcript", merchantOnly, async (c) => c.json(await sharedTranscript()))

  .post("/api/agents/:keyId/block", merchantOnly, perMinute(30), async (c) => {
    const agent = await setAgentBlocked(c.req.param("keyId"), true);
    return agent ? c.json({ blocked: true }) : c.json({ error: "not_found" }, 404);
  })

  .post("/api/orders/:id/release", merchantOnly, perMinute(30), async (c) => {
    try {
      const order = await releaseByMerchant(c.req.param("id"));
      return c.json({ status: order.status });
    } catch (err) {
      if (err instanceof ApprovalError) return c.json({ error: err.code, message: err.message }, err.status);
      throw err;
    }
  })

  .get("/api/rules", merchantOnly, async (c) => {
    const rules = await getRules();
    return c.json({ ...rules, cards: describePolicy(rules.policy) });
  })

  // Plain English in, proposed settings out. Not saved until the merchant confirms with PUT.
  .post("/api/rules/compile", merchantOnly, perMinute(10), async (c) => {
    if (!aiEnabled) return c.json({ error: "ai_unavailable", message: "Add GEMINI_API_KEY to use the rule writer." }, 503);
    const body = await c.req.json().catch(() => null);
    if (typeof body?.rulesText !== "string" || !body.rulesText.trim() || body.rulesText.length > 2000) {
      return c.json({ error: "invalid_rules_text" }, 400);
    }
    const { policy } = await getRules();
    return compiling.run<Response>(
      async () => {
        try {
          return c.json(await compileRules(body.rulesText, policy));
        } catch (err) {
          console.warn("[ai] rule compile failed:", err instanceof Error ? err.message : err);
          return c.json({ error: "compile_failed", message: "Couldn't turn that into rules. Try rewording it." }, 422);
        }
      },
      () => c.json({ error: "busy", message: "Someone else is rewriting the rules right now. Try again in a few seconds." }, 503),
    );
  })

  .put("/api/rules", merchantOnly, perMinute(20), async (c) => {
    const body = await c.req.json().catch(() => null);
    const policy = policySchema.safeParse(body?.policy);
    if (!policy.success || typeof body?.rulesText !== "string") return c.json({ error: "invalid_rules" }, 400);
    await saveRules(policy.data, body.rulesText);
    const rules = await getRules();
    return c.json({ ...rules, cards: describePolicy(rules.policy) });
  });

