// Buying from the storefront: in the browser with PayPal, or by asking your
// linked agent to buy for you (it goes through Doorman like any other agent).
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db, schema } from "../db/client.js";
import { ApprovalError, retryInput } from "../doorman/approvals.js";
import { currentCustomer } from "../doorman/sessions.js";
import { completeWebCheckout, startWebCheckout } from "../doorman/web-checkout.js";
import { agentBuys, DEMO_AGENTS, demoKeyId, type Errand } from "../sim/demo-agents.js";

const size = z.enum(["S", "M", "L", "XL"]).nullish();

const cart = z.object({
  items: z
    .array(z.object({ productId: z.string().min(1), size, quantity: z.number().int().min(1).max(10) }))
    .min(1)
    .max(10),
});

const errand = z.object({ productId: z.string().min(1), size });

// Doorman saying no is a normal answer, so it comes back as 200 with ok: false.
const errandReply = (result: Errand) =>
  result.ok ? { ok: true, approvalPath: result.approvalPath, decision: result.decision } : { ok: false, decision: result.decision, message: result.reason };

export const shopRoutes = new Hono()
  .post("/api/store/checkout", async (c) => {
    const body = cart.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_cart", issues: body.error.issues }, 400);
    return c.json(await startWebCheckout(body.data.items));
  })

  .post("/api/store/checkout/:paypalOrderId/complete", async (c) => c.json(await completeWebCheckout(c.req.param("paypalOrderId"))))

  // "Ask Ava to buy it": the customer's most recent live pass for one of the demo agents.
  .post("/api/store/agent-checkout", async (c) => {
    const customer = await currentCustomer(c);
    if (!customer) return c.json({ error: "login_required" }, 401);
    const body = errand.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_request" }, 400);
    const [pass] = await db
      .select()
      .from(schema.passes)
      .where(
        and(
          eq(schema.passes.customerPayerId, customer.payerId),
          inArray(schema.passes.agentKeyId, DEMO_AGENTS.map((a) => demoKeyId(a.name))),
          isNull(schema.passes.revokedAt),
          gt(schema.passes.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(schema.passes.createdAt))
      .limit(1);
    if (!pass) return c.json({ error: "no_pass", message: "Link your AI assistant first." }, 409);
    return c.json(errandReply(await agentBuys({ keyId: pass.agentKeyId, passId: pass.id, productId: body.data.productId, size: body.data.size, quantity: 1 })));
  })

  // "Try again" after a released hold: the same agent asks for the same thing.
  .post("/api/approvals/:token/retry", async (c) => {
    return c.json(errandReply(await agentBuys(await retryInput(c.req.param("token")))));
  })

  .onError((err, c) => {
    if (err instanceof ApprovalError) return c.json({ error: err.code, message: err.message }, err.status);
    throw err;
  });
