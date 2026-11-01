// What Doorman does when PayPal reports on one of its orders (after the webhook's
// signature has been checked). Each event is handled once and kept, with what
// Doorman did about it, for the order's detail panel.
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import type { OrderStatus } from "../db/schema.js";
import type { WebhookEvent } from "../paypal/webhooks.js";
import { authorizeApproval } from "./approvals.js";
import type { OrderRow } from "./checkout.js";
import { oneAtATime } from "./locks.js";
import { completeWebCheckout } from "./web-checkout.js";

// The PayPal order an event is about.
function paypalOrderIdOf(event: WebhookEvent): string | null {
  if (event.event_type.startsWith("CHECKOUT.ORDER.")) return event.resource?.id ?? null;
  return event.resource?.supplementary_data?.related_ids?.order_id ?? null;
}

export async function handlePayPalEvent(event: WebhookEvent): Promise<string> {
  const [seen] = await db.select().from(schema.paypalWebhookEvents).where(eq(schema.paypalWebhookEvents.id, event.id));
  if (seen) return seen.outcome;
  const paypalOrderId = paypalOrderIdOf(event);
  const outcome = paypalOrderId ? await act(event, paypalOrderId) : "Not about an order";
  // Kept only once handled, so if handling fails PayPal's retry gets another go.
  await db
    .insert(schema.paypalWebhookEvents)
    .values({ id: event.id, type: event.event_type, resourceId: event.resource?.id ?? "", paypalOrderId, outcome })
    .onConflictDoNothing();
  return outcome;
}

const FINISHED: Record<OrderStatus, string> = {
  charged: "Finished the order: charged",
  released: "Finished the order: hold released",
  declined: "Too late: the approval link had expired",
  held: "Finished the order: money held",
  awaiting_approval: "Order still waiting",
};

async function act(event: WebhookEvent, paypalOrderId: string): Promise<string> {
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.paypalOrderId, paypalOrderId));
  if (!order) return "Not a Doorman order";

  switch (event.event_type) {
    // The customer approved in PayPal. The page they approved on has usually
    // finished the order already; if they closed it first, Doorman finishes it now.
    case "CHECKOUT.ORDER.APPROVED": {
      if (order.status !== "awaiting_approval") return "Already finished by the approval page";
      // A step-up needs the customer to log in first, so it waits for them.
      if (order.stepUp) return "Waiting for the customer to log in";
      if (order.agentKeyId) await authorizeApproval(order.approvalToken, null);
      else await completeWebCheckout(paypalOrderId);
      const [after] = await db.select({ status: schema.orders.status }).from(schema.orders).where(eq(schema.orders.id, order.id));
      return FINISHED[after?.status ?? order.status];
    }
    // Receipts for what Doorman did itself, unless the order still says otherwise
    // (say, the hold was released or the charge reversed from PayPal's side).
    case "PAYMENT.CAPTURE.COMPLETED":
      return settle(paypalOrderId, ["held"], { status: "charged", captureId: event.resource?.id ?? null }, "Marked charged");
    case "PAYMENT.AUTHORIZATION.VOIDED":
      return settle(paypalOrderId, ["held"], { status: "released", releaseReason: "Hold released in PayPal" }, "Marked released");
    case "PAYMENT.CAPTURE.DENIED":
      return settle(paypalOrderId, ["held", "charged"], { status: "released", releaseReason: "PayPal denied the payment" }, "Marked released");
    default:
      return "Confirmed";
  }
}

// Brings Doorman's order rows in line with PayPal, after any step already running.
function settle(paypalOrderId: string, from: OrderStatus[], values: Partial<OrderRow>, changed: string): Promise<string> {
  return oneAtATime(paypalOrderId, async () => {
    const rows = await db
      .update(schema.orders)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(schema.orders.paypalOrderId, paypalOrderId), inArray(schema.orders.status, from)))
      .returning({ id: schema.orders.id });
    return rows.length ? changed : "Confirmed";
  });
}
