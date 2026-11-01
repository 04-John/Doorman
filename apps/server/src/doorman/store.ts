import { and, desc, eq, gte, ilike, inArray, lt, ne, or, sql, sum } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import type { OrderStatus } from "../db/schema.js";
import { policySchema, type Policy } from "./policy.js";

export type ProductRow = typeof schema.products.$inferSelect;
export type DropRow = typeof schema.drops.$inferSelect;

export const DROP_PRODUCT_ID = "hoodie-night-shift";
export const DROP_STOCK = 50;

export async function getProduct(id: string): Promise<ProductRow | undefined> {
  const [product] = await db.select().from(schema.products).where(eq(schema.products.id, id));
  return product;
}

export async function searchProducts(query?: string): Promise<ProductRow[]> {
  const words = query?.split(/\s+/).filter(Boolean) ?? [];
  const conditions = words.map((w) => ilike(schema.products.name, `%${w}%`));
  return db.select().from(schema.products).where(and(...conditions)).orderBy(desc(schema.products.limitedDrop));
}

export async function currentDrop(): Promise<DropRow | undefined> {
  const [drop] = await db.select().from(schema.drops).orderBy(desc(schema.drops.startedAt)).limit(1);
  return drop;
}

// "Run the drop": close any open drop, restock the hoodie, open a new drop.
export async function startDrop(): Promise<DropRow> {
  await db.update(schema.drops).set({ status: "ended", endedAt: new Date() }).where(eq(schema.drops.status, "live"));
  await db.update(schema.products).set({ stock: DROP_STOCK }).where(eq(schema.products.id, DROP_PRODUCT_ID));
  const [drop] = await db
    .insert(schema.drops)
    .values({ productId: DROP_PRODUCT_ID, status: "live", stockTotal: DROP_STOCK })
    .returning();
  return drop!;
}

export async function endDrop(dropId: string) {
  await db.update(schema.drops).set({ status: "ended", endedAt: new Date() }).where(eq(schema.drops.id, dropId));
}

// "Reset": close the current drop and hide it, so the dashboard shows READY.
export async function resetDrop() {
  await db.update(schema.drops).set({ status: "ended", endedAt: new Date() }).where(eq(schema.drops.status, "live"));
  await db.update(schema.drops).set({ cleared: true }).where(eq(schema.drops.cleared, false));
  await db.update(schema.products).set({ stock: DROP_STOCK }).where(eq(schema.products.id, DROP_PRODUCT_ID));
}

// Takes stock atomically, so two approvals can't both get the last hoodie.
export async function reserveStock(productId: string, quantity: number): Promise<number | null> {
  const [row] = await db
    .update(schema.products)
    .set({ stock: sql`${schema.products.stock} - ${quantity}` })
    .where(and(eq(schema.products.id, productId), gte(schema.products.stock, quantity)))
    .returning({ stock: schema.products.stock });
  return row ? row.stock : null;
}

// Puts stock back when a multi-item order fails partway through.
export async function returnStock(productId: string, quantity: number) {
  await db
    .update(schema.products)
    .set({ stock: sql`${schema.products.stock} + ${quantity}` })
    .where(eq(schema.products.id, productId));
}

// Approval links expire, as the customer is told on the approval page. An expired
// order no longer holds the customer's place in the drop.
export const APPROVAL_MINUTES = 15;
export const APPROVAL_EXPIRED = "Approval link expired";

export async function expireStaleApprovals() {
  await db
    .update(schema.orders)
    .set({ status: "declined", releaseReason: APPROVAL_EXPIRED, updatedAt: new Date() })
    .where(and(eq(schema.orders.status, "awaiting_approval"), lt(schema.orders.createdAt, new Date(Date.now() - APPROVAL_MINUTES * 60_000))));
}

// Units of a drop product a customer already has in play during this drop.
export async function unitsInDrop(input: {
  dropId: string;
  productId: string;
  payer: { expected: string } | { approved: string };
  statuses: OrderStatus[];
  excludeOrderId?: string;
}): Promise<number> {
  if (input.statuses.includes("awaiting_approval")) await expireStaleApprovals();
  const payerColumn = "expected" in input.payer ? schema.orders.expectedPayerId : schema.orders.approvedPayerId;
  const payerId = "expected" in input.payer ? input.payer.expected : input.payer.approved;
  const [row] = await db
    .select({ units: sum(schema.orders.quantity) })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.dropId, input.dropId),
        eq(schema.orders.productId, input.productId),
        eq(payerColumn, payerId),
        inArray(schema.orders.status, input.statuses),
        input.excludeOrderId ? ne(schema.orders.id, input.excludeOrderId) : undefined,
      ),
    );
  return Number(row?.units ?? 0);
}

// What a signed-in customer already has in the live drop, however they bought it:
// through an agent (expected payer) or in the browser (approved payer).
export async function customerDropOrders(drop: DropRow, payerId: string): Promise<{ units: number; awaitingToken: string | null }> {
  await expireStaleApprovals();
  const rows = await db
    .select({ quantity: schema.orders.quantity, status: schema.orders.status, approvalToken: schema.orders.approvalToken })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.dropId, drop.id),
        eq(schema.orders.productId, drop.productId),
        or(eq(schema.orders.expectedPayerId, payerId), eq(schema.orders.approvedPayerId, payerId)),
        inArray(schema.orders.status, ["awaiting_approval", "held", "charged"]),
      ),
    )
    .orderBy(desc(schema.orders.createdAt));
  // Browser checkouts have no approval page of their own.
  const awaiting = rows.find((r) => r.status === "awaiting_approval" && !r.approvalToken.startsWith("web-"));
  return { units: rows.reduce((n, r) => n + r.quantity, 0), awaitingToken: awaiting?.approvalToken ?? null };
}

let policyCache: { policy: Policy; rulesText: string } | undefined;

export async function getRules(): Promise<{ policy: Policy; rulesText: string }> {
  if (policyCache) return policyCache;
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.id, 1));
  if (!row) throw new Error("No rules found. Run `npm run db:seed` first.");
  policyCache = { policy: policySchema.parse(row.policy), rulesText: row.rulesText };
  return policyCache;
}

export async function saveRules(policy: Policy, rulesText: string) {
  await db.update(schema.settings).set({ policy, rulesText }).where(eq(schema.settings.id, 1));
  policyCache = { policy, rulesText };
}
