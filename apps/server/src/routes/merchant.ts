// Merchant dashboard API. Open for the demo so judges can use it without an account.
import { and, count, countDistinct, desc, eq, inArray, sum } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { setAgentBlocked } from "../agents/registry.js";
import { db, schema } from "../db/client.js";
import { ApprovalError, releaseByMerchant } from "../doorman/approvals.js";
import { approvalUrl } from "../doorman/checkout.js";
import { eventBus, type EventRow } from "../doorman/events.js";
import { policySchema } from "../doorman/policy.js";
import { currentDrop, getProduct, getRules, saveRules } from "../doorman/store.js";
import { runDrop, simulationRunning } from "../sim/run.js";

async function summary() {
  const drop = await currentDrop();
  if (!drop) return { drop: null, kpis: null, simulationRunning: simulationRunning() };
  const product = await getProduct(drop.productId);

  const byDecision = await db
    .select({ decision: schema.events.decision, n: count() })
    .from(schema.events)
    .where(and(eq(schema.events.dropId, drop.id), inArray(schema.events.action, ["browse", "cart", "checkout"])))
    .groupBy(schema.events.decision);
  const [visitors] = await db
    .select({ n: countDistinct(schema.events.visitorKey) })
    .from(schema.events)
    .where(eq(schema.events.dropId, drop.id));
  const money = await db
    .select({ status: schema.orders.status, cents: sum(schema.orders.amountCents) })
    .from(schema.orders)
    .where(eq(schema.orders.dropId, drop.id))
    .groupBy(schema.orders.status);

  const decisions = Object.fromEntries(byDecision.map((r) => [r.decision, r.n]));
  const cents = Object.fromEntries(money.map((r) => [r.status, Number(r.cents ?? 0)]));
  return {
    drop: {
      id: drop.id,
      status: drop.status,
      productName: product?.name,
      stockLeft: product?.stock ?? 0,
      stockTotal: drop.stockTotal,
      startedAt: drop.startedAt,
      endedAt: drop.endedAt,
    },
    kpis: {
      agentsSeen: visitors?.n ?? 0,
      allowed: decisions.allowed ?? 0,
      stepUp: decisions.step_up ?? 0,
      throttled: decisions.throttled ?? 0,
      blocked: decisions.blocked ?? 0,
      awaitingApprovalCents: cents.awaiting_approval ?? 0,
      heldCents: cents.held ?? 0,
      chargedCents: cents.charged ?? 0,
    },
    simulationRunning: simulationRunning(),
  };
}

async function eventDetail(id: string) {
  const [event] = await db.select().from(schema.events).where(eq(schema.events.id, id));
  if (!event) return null;
  const [agent] = event.agentKeyId
    ? await db.select().from(schema.agents).where(eq(schema.agents.keyId, event.agentKeyId))
    : [];
  const [order] = event.orderId ? await db.select().from(schema.orders).where(eq(schema.orders.id, event.orderId)) : [];
  const [pass] = order?.passId ? await db.select().from(schema.passes).where(eq(schema.passes.id, order.passId)) : [];
  // Timeline: everything that happened to this order, or this visitor's recent steps.
  const timeline = await db
    .select()
    .from(schema.events)
    .where(event.orderId ? eq(schema.events.orderId, event.orderId) : eq(schema.events.visitorKey, event.visitorKey))
    .orderBy(desc(schema.events.at))
    .limit(20);
  return {
    event,
    agent: agent && { keyId: agent.keyId, name: agent.name, operator: agent.operator, blocked: agent.blocked, firstSeen: agent.registeredAt },
    pass: pass && { capCents: pass.capCents, expiresAt: pass.expiresAt, revokedAt: pass.revokedAt },
    order: order && {
      id: order.id,
      status: order.status,
      amountCents: order.amountCents,
      approvalUrl: approvalUrl(order),
      releaseReason: order.releaseReason,
      paypal: { orderId: order.paypalOrderId, authorizationId: order.authorizationId, captureId: order.captureId },
    },
    timeline: timeline.reverse(),
  };
}

export const merchantRoutes = new Hono()
  .get("/api/dashboard", async (c) => c.json(await summary()))

  .get("/api/events", async (c) => {
    const drop = await currentDrop();
    const rows = await db
      .select()
      .from(schema.events)
      .where(drop ? eq(schema.events.dropId, drop.id) : undefined)
      .orderBy(desc(schema.events.at))
      .limit(Math.min(Number(c.req.query("limit") ?? 200), 500));
    return c.json({ events: rows });
  })

  // Live feed for the dashboard (Server-Sent Events).
  .get("/api/events/stream", (c) =>
    streamSSE(c, async (stream) => {
      const send = (row: EventRow) => void stream.writeSSE({ event: "event", data: JSON.stringify(row) });
      eventBus.on("event", send);
      stream.onAbort(() => {
        eventBus.off("event", send);
      });
      while (!stream.aborted) {
        await stream.writeSSE({ event: "ping", data: "" });
        await stream.sleep(15_000);
      }
    }),
  )

  .get("/api/events/:id", async (c) => {
    const detail = await eventDetail(c.req.param("id"));
    return detail ? c.json(detail) : c.json({ error: "not_found" }, 404);
  })

  .post("/api/drop/run", async (c) => {
    if (simulationRunning()) return c.json({ error: "already_running" }, 409);
    const drop = await runDrop();
    return c.json({ dropId: drop.id }, 202);
  })

  .post("/api/agents/:keyId/block", async (c) => {
    const agent = await setAgentBlocked(c.req.param("keyId"), true);
    return agent ? c.json({ blocked: true }) : c.json({ error: "not_found" }, 404);
  })

  .post("/api/orders/:id/release", async (c) => {
    try {
      const order = await releaseByMerchant(c.req.param("id"));
      return c.json({ status: order.status });
    } catch (err) {
      if (err instanceof ApprovalError) return c.json({ error: err.code, message: err.message }, err.status);
      throw err;
    }
  })

  .get("/api/rules", async (c) => c.json(await getRules()))

  .put("/api/rules", async (c) => {
    const body = await c.req.json().catch(() => null);
    const policy = policySchema.safeParse(body?.policy);
    if (!policy.success || typeof body?.rulesText !== "string") return c.json({ error: "invalid_rules" }, 400);
    await saveRules(policy.data, body.rulesText);
    return c.json(await getRules());
  });
