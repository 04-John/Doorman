// Phase 1 test bench at /lab.html: a direct purchase (no agent) that is held,
// then captured or voided, with the payer compared to the logged-in customer.
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { currentCustomer } from "../doorman/sessions.js";
import { getProduct, DROP_PRODUCT_ID } from "../doorman/store.js";
import { authorizeOrder, captureAuthorization, createAuthorizeOrder, voidAuthorization } from "../paypal/orders.js";

export const labRoutes = new Hono()
  .post("/api/lab/orders", async (c) => {
    const product = (await getProduct(DROP_PRODUCT_ID))!;
    const order = await createAuthorizeOrder({
      referenceId: product.id,
      description: product.name,
      amount: (product.priceCents / 100).toFixed(2),
      idempotencyKey: randomUUID(),
    });
    return c.json({ id: order.id });
  })

  .post("/api/lab/orders/:id/authorize", async (c) => {
    const id = c.req.param("id");
    const order = await authorizeOrder(id, `authorize-${id}`);
    const customer = await currentCustomer(c);
    const match = customer && order.payerId ? customer.payerId === order.payerId : null;
    return c.json({ order, loggedInPayerId: customer?.payerId ?? null, match });
  })

  .post("/api/lab/authorizations/:id/capture", async (c) => {
    const id = c.req.param("id");
    return c.json(await captureAuthorization(id, `capture-${id}`));
  })

  .post("/api/lab/authorizations/:id/void", async (c) => {
    const id = c.req.param("id");
    return c.json(await voidAuthorization(id, `void-${id}`));
  });
