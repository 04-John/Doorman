import { randomBytes } from "node:crypto";
import { db, schema } from "../db/client.js";
import { env } from "../env.js";
import { createAuthorizeOrder } from "../paypal/orders.js";
import { evaluate, record, type Evaluation } from "./door.js";
import type { Visitor } from "./identity.js";
import type { ProductRow } from "./store.js";

export type OrderRow = typeof schema.orders.$inferSelect;

export function approvalUrl(order: Pick<OrderRow, "approvalToken">): string {
  return `${env.PUBLIC_URL}/approve/${order.approvalToken}`;
}

const dollars = (cents: number) => (cents / 100).toFixed(2);

// An agent checking out. If Doorman lets it through, we create a PayPal order
// that only *holds* the money once approved, and hand the agent a link for its
// customer. Nothing is charged until the customer approves in PayPal.
export async function checkout(
  visitor: Visitor,
  product: ProductRow,
  quantity: number,
  size?: string,
): Promise<{ evaluation: Evaluation; order?: OrderRow }> {
  const evaluation = await evaluate(visitor, "checkout", { product, quantity });
  const { result, drop } = evaluation;
  const amountCents = product.priceCents * quantity;

  if (result.decision !== "allowed" && result.decision !== "step_up") {
    await record(visitor, "checkout", evaluation, { amountCents, productId: product.id });
    return { evaluation };
  }

  const approvalToken = randomBytes(18).toString("base64url");
  const paypalOrder = await createAuthorizeOrder({
    referenceId: product.id,
    description: `${product.name}${visitor.agent ? `, ordered by ${visitor.agent.name}` : ""}`,
    amount: dollars(amountCents),
    idempotencyKey: `checkout-${approvalToken}`,
  });

  const [order] = await db
    .insert(schema.orders)
    .values({
      approvalToken,
      dropId: product.limitedDrop && drop?.status === "live" ? drop.id : null,
      productId: product.id,
      size: size ?? null,
      quantity,
      amountCents,
      agentKeyId: visitor.agent?.keyId ?? null,
      passId: result.tier === "verified" ? visitor.pass!.id : null,
      expectedPayerId: result.tier === "verified" ? visitor.pass!.customerPayerId : null,
      stepUp: result.decision === "step_up",
      status: "awaiting_approval",
      paypalOrderId: paypalOrder.id,
    })
    .returning();

  await record(visitor, "checkout", evaluation, { amountCents, productId: product.id, orderId: order!.id });
  return { evaluation, order: order! };
}
