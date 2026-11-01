// People buying in the browser, without an agent. One PayPal order covers the
// cart and each line is an order row. The money is held first, so the drop's
// per-customer limit can be checked against the PayPal account that actually paid.
import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { authorizeOrder, captureAuthorization, createAuthorizeOrder, voidAuthorization } from "../paypal/orders.js";
import { ApprovalError } from "./approvals.js";
import type { OrderRow } from "./checkout.js";
import { oneAtATime } from "./locks.js";
import { currentDrop, endDrop, getProduct, getRules, reserveStock, returnStock, unitsInDrop } from "./store.js";

export interface CartLine {
  productId: string;
  size?: string | null;
  quantity: number;
}

export async function startWebCheckout(lines: CartLine[]) {
  const [drop, { policy }] = await Promise.all([currentDrop(), getRules()]);
  const items = await Promise.all(
    lines.map(async (line) => {
      const product = await getProduct(line.productId);
      if (!product) throw new ApprovalError(400, "unknown_product", "One of those products isn't sold here.");
      if (product.stock < line.quantity) throw new ApprovalError(409, "sold_out", `${product.name} is sold out.`);
      return { line, product };
    }),
  );
  const dropUnits = items.filter((i) => i.product.limitedDrop).reduce((n, i) => n + i.line.quantity, 0);
  if (drop?.status === "live" && dropUnits > policy.dropLimitPerCustomer) {
    throw new ApprovalError(409, "drop_limit", `The drop is limited to ${policy.dropLimitPerCustomer} per customer.`);
  }

  const amountCents = items.reduce((n, i) => n + i.product.priceCents * i.line.quantity, 0);
  const key = randomBytes(12).toString("base64url");
  const paypalOrder = await createAuthorizeOrder({
    referenceId: "static-supply-web",
    description: items.map((i) => `${i.product.name}${i.line.size ? ` (${i.line.size})` : ""} x${i.line.quantity}`).join(", ").slice(0, 127),
    amount: (amountCents / 100).toFixed(2),
    idempotencyKey: `web-${key}`,
  });

  await db.insert(schema.orders).values(
    items.map((i, n) => ({
      approvalToken: `web-${key}-${n}`,
      dropId: i.product.limitedDrop && drop?.status === "live" ? drop.id : null,
      productId: i.product.id,
      size: i.line.size ?? null,
      quantity: i.line.quantity,
      amountCents: i.product.priceCents * i.line.quantity,
      status: "awaiting_approval" as const,
      paypalOrderId: paypalOrder.id,
    })),
  );
  return { paypalOrderId: paypalOrder.id, amountCents };
}

async function rowsFor(paypalOrderId: string): Promise<OrderRow[]> {
  return db
    .select()
    .from(schema.orders)
    .where(and(eq(schema.orders.paypalOrderId, paypalOrderId), isNull(schema.orders.agentKeyId)));
}

async function setAll(paypalOrderId: string, values: Partial<OrderRow>) {
  await db
    .update(schema.orders)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(schema.orders.paypalOrderId, paypalOrderId), isNull(schema.orders.agentKeyId)));
}

async function view(paypalOrderId: string) {
  const rows = await rowsFor(paypalOrderId);
  const first = rows[0]!;
  const names = await Promise.all(rows.map((r) => getProduct(r.productId)));
  return {
    status: first.status,
    paypalOrderId,
    amountCents: rows.reduce((n, r) => n + r.amountCents, 0),
    items: rows.map((r, i) => ({ name: names[i]?.name ?? r.productId, size: r.size, quantity: r.quantity, amountCents: r.amountCents })),
    paidBy: first.approvedPayerEmail,
    releaseReason: first.releaseReason,
  };
}

// Called once the shopper approves in PayPal (by the cart, or by PayPal's webhook if
// they closed the page first): hold, check, then charge or release.
export function completeWebCheckout(paypalOrderId: string) {
  return oneAtATime(paypalOrderId, () => finishWebCheckout(paypalOrderId));
}

async function finishWebCheckout(paypalOrderId: string) {
  const rows = await rowsFor(paypalOrderId);
  if (rows.length === 0) throw new ApprovalError(404, "not_found", "No order with that ID.");
  if (rows[0]!.status !== "awaiting_approval") return view(paypalOrderId);

  const authorized = await authorizeOrder(paypalOrderId, `authorize-${paypalOrderId}`);
  // Only one caller gets to move the order on from awaiting approval.
  const claimed = await db
    .update(schema.orders)
    .set({
      status: "held",
      authorizationId: authorized.authorizationId,
      approvedPayerId: authorized.payerId,
      approvedPayerEmail: authorized.payerEmail,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.orders.paypalOrderId, paypalOrderId), isNull(schema.orders.agentKeyId), eq(schema.orders.status, "awaiting_approval")))
    .returning({ id: schema.orders.id });
  if (claimed.length === 0) return view(paypalOrderId);
  const release = async (reason: string) => {
    await voidAuthorization(authorized.authorizationId!, `void-${paypalOrderId}`);
    await setAll(paypalOrderId, { status: "released", releaseReason: reason });
    return view(paypalOrderId);
  };

  // The drop limit, counted on the PayPal account that paid (this order included).
  const { policy } = await getRules();
  for (const row of rows.filter((r) => r.dropId)) {
    const units = await unitsInDrop({
      dropId: row.dropId!,
      productId: row.productId,
      payer: { approved: authorized.payerId! },
      statuses: ["held", "charged"],
    });
    if (units > policy.dropLimitPerCustomer) {
      return release(`This PayPal account already has one from this drop (limit ${policy.dropLimitPerCustomer})`);
    }
  }

  const reserved: OrderRow[] = [];
  for (const row of rows) {
    const left = await reserveStock(row.productId, row.quantity);
    if (left === null) {
      await Promise.all(reserved.map((r) => returnStock(r.productId, r.quantity)));
      return release("Sold out before you paid");
    }
    reserved.push(row);
    if (left === 0 && row.dropId) await endDrop(row.dropId);
  }

  const capture = await captureAuthorization(authorized.authorizationId!, `capture-${paypalOrderId}`);
  await setAll(paypalOrderId, { status: "charged", captureId: capture.id });
  return view(paypalOrderId);
}
