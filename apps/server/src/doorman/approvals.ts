// What happens after an agent checks out: the customer opens the approval
// link, approves in PayPal, and Doorman runs the last checks before charging.
import { and, eq, inArray, sum } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { authorizeOrder, captureAuthorization, voidAuthorization } from "../paypal/orders.js";
import type { OrderRow } from "./checkout.js";
import { money, type Decision, type Tier } from "./engine.js";
import type { EventAction } from "../db/schema.js";
import { recordEvent } from "./events.js";
import type { CustomerRow } from "./sessions.js";
import { endDrop, getProduct, getRules, reserveStock, unitsInDrop } from "./store.js";

export class ApprovalError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function loadOrder(token: string): Promise<OrderRow> {
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.approvalToken, token));
  if (!order) throw new ApprovalError(404, "not_found", "This approval link isn't valid.");
  return order;
}

async function context(order: OrderRow) {
  const [agent] = order.agentKeyId
    ? await db.select().from(schema.agents).where(eq(schema.agents.keyId, order.agentKeyId))
    : [];
  const [pass] = order.passId ? await db.select().from(schema.passes).where(eq(schema.passes.id, order.passId)) : [];
  const [expected] = order.expectedPayerId
    ? await db.select().from(schema.customers).where(eq(schema.customers.payerId, order.expectedPayerId))
    : [];
  const product = (await getProduct(order.productId))!;
  return { agent, pass, expected, product };
}

export async function approvalView(token: string) {
  const order = await loadOrder(token);
  const { agent, pass, expected, product } = await context(order);
  const [payer] = order.approvedPayerId
    ? await db.select().from(schema.customers).where(eq(schema.customers.payerId, order.approvedPayerId))
    : [];
  const [used] = pass
    ? await db
        .select({ cents: sum(schema.orders.amountCents) })
        .from(schema.orders)
        .where(and(eq(schema.orders.passId, pass.id), inArray(schema.orders.status, ["held", "charged"])))
    : [];
  return {
    status: order.status,
    stepUp: order.stepUp,
    paypalOrderId: order.paypalOrderId,
    product: { id: product.id, name: product.name, priceCents: product.priceCents },
    quantity: order.quantity,
    amountCents: order.amountCents,
    agent: agent ? { name: agent.name, operator: agent.operator } : null,
    pass: pass
      ? { capCents: pass.capCents, expiresAt: pass.expiresAt, customerName: expected?.name ?? null, usedCents: Number(used?.cents ?? 0) }
      : null,
    paidBy: payer?.name ?? order.approvedPayerEmail ?? null,
    releaseReason: order.releaseReason,
  };
}

async function update(order: OrderRow, values: Partial<OrderRow>): Promise<OrderRow> {
  const [row] = await db
    .update(schema.orders)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(schema.orders.id, order.id))
    .returning();
  return row!;
}

function logOrderEvent(
  order: OrderRow,
  agent: { keyId: string; name: string; operator: string } | undefined,
  customerName: string | null,
  action: EventAction,
  decision: Decision,
  reasonCode: string,
  reason: string,
) {
  const tier: Tier = order.passId ? "verified" : "signed";
  return recordEvent({
    dropId: order.dropId,
    visitorKey: agent?.keyId ?? "customer",
    tier,
    agentKeyId: agent?.keyId ?? null,
    agentName: agent?.name ?? null,
    operator: agent?.operator ?? null,
    customerName,
    action,
    decision,
    reasonCode,
    reason,
    amountCents: order.amountCents,
    productId: order.productId,
    orderId: order.id,
    checks: [],
  });
}

async function release(order: OrderRow, code: string, reason: string, log: (code: string, reason: string) => Promise<unknown>) {
  if (order.authorizationId) await voidAuthorization(order.authorizationId, `void-${order.id}`);
  const released = await update(order, { status: "released", releaseReason: reason });
  await log(code, `${reason}. Hold released`);
  return released;
}

export async function authorizeApproval(token: string, sessionCustomer: CustomerRow | null) {
  let order = await loadOrder(token);
  if (order.status !== "awaiting_approval") return approvalView(token);
  if (order.stepUp && !sessionCustomer) {
    throw new ApprovalError(401, "login_required", "Log in with PayPal first to confirm this agent works for you.");
  }

  const { agent, expected, product } = await context(order);
  const customerName = expected?.name ?? sessionCustomer?.name ?? null;
  const log = (action: EventAction, decision: Decision) => (code: string, reason: string) =>
    logOrderEvent(order, agent, customerName, action, decision, code, reason);

  // 1. Hold the money.
  const authorized = await authorizeOrder(order.paypalOrderId, `authorize-${order.id}`);
  order = await update(order, {
    status: "held",
    authorizationId: authorized.authorizationId,
    approvedPayerId: authorized.payerId,
    approvedPayerEmail: authorized.payerEmail,
  });
  await log("approve", "allowed")("APPROVED", `Customer approved in PayPal. ${money(order.amountCents)} held`);

  // 2. The person who paid must be the person who linked the agent (or, for a
  //    step-up, the person who just logged in to confirm it).
  const expectedPayer = order.expectedPayerId ?? sessionCustomer?.payerId ?? null;
  if (expectedPayer && authorized.payerId !== expectedPayer) {
    const who = order.expectedPayerId ? "the pass holder" : "the account that confirmed the agent";
    order = await release(order, "PAYER_MISMATCH", `Paid from a different PayPal account than ${who}`, log("release", "blocked"));
    return approvalView(token);
  }

  // 3. Drop rules, now that we know exactly who paid.
  if (product.limitedDrop && order.dropId) {
    const { policy } = await getRules();
    const already = await unitsInDrop({
      dropId: order.dropId,
      productId: product.id,
      payer: { approved: authorized.payerId! },
      statuses: ["held", "charged"],
      excludeOrderId: order.id,
    });
    if (already + order.quantity > policy.dropLimitPerCustomer) {
      order = await release(order, "REPEAT_BUYER", `This customer already has one (limit ${policy.dropLimitPerCustomer})`, log("release", "blocked"));
      return approvalView(token);
    }
    const left = await reserveStock(product.id, order.quantity);
    if (left === null) {
      order = await release(order, "SOLD_OUT", "Sold out before approval", log("release", "blocked"));
      return approvalView(token);
    }
    if (left === 0) await endDrop(order.dropId);
  }

  // 4. Charge.
  const capture = await captureAuthorization(order.authorizationId!, `capture-${order.id}`);
  order = await update(order, { status: "charged", captureId: capture.id });
  await log("charge", "allowed")("CHARGED", `Charged ${money(order.amountCents)}`);
  return approvalView(token);
}

export async function declineApproval(token: string) {
  const order = await loadOrder(token);
  if (order.status === "awaiting_approval") {
    const { agent, expected } = await context(order);
    await update(order, { status: "declined", releaseReason: "Declined by the customer" });
    await logOrderEvent(order, agent, expected?.name ?? null, "release", "blocked", "DECLINED", "Customer declined. Nothing charged");
  }
  return approvalView(token);
}

// Merchant pressing "Release hold" (or cancelling an order still awaiting approval).
export async function releaseByMerchant(orderId: string) {
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!order) throw new ApprovalError(404, "not_found", "Order not found");
  const { agent, expected } = await context(order);
  const log = (code: string, reason: string) =>
    logOrderEvent(order, agent, expected?.name ?? null, "release", "blocked", code, reason);
  if (order.status === "held") return release(order, "MERCHANT_RELEASED", "Released by the merchant", log);
  if (order.status === "awaiting_approval") {
    await log("MERCHANT_CANCELLED", "Cancelled by the merchant before approval");
    return update(order, { status: "declined", releaseReason: "Cancelled by the merchant" });
  }
  throw new ApprovalError(409, "not_releasable", `Order is already ${order.status}`);
}
