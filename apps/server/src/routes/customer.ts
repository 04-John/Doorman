// Customer-facing API: who am I, link an agent, my passes, approve a purchase.
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db, schema } from "../db/client.js";
import { ApprovalError, approvalView, authorizeApproval, declineApproval } from "../doorman/approvals.js";
import { approveLinkRequest, grantPass, linkRequestView, passesFor, revokePass } from "../doorman/passes.js";
import { currentCustomer } from "../doorman/sessions.js";
import { currentDrop, customerDropOrders, getRules, searchProducts } from "../doorman/store.js";
import { env } from "../env.js";
import { shared } from "../lib/bounded.js";
import { perMinute } from "../lib/limits.js";
import { DEMO_AGENTS, demoKeyId } from "../sim/demo-agents.js";

const linkApproval = z.object({
  capCents: z.number().int().min(100).max(1_000_000),
  days: z.union([z.literal(1), z.literal(7), z.literal(30)]),
});

const agentView = (a: typeof schema.agents.$inferSelect) => ({ keyId: a.keyId, name: a.name, operator: a.operator });

// Everyone watching a live drop polls the store; they share one read a second.
const storefront = shared(1_000, () => Promise.all([searchProducts(), currentDrop(), getRules()]));

export const customerRoutes = new Hono()
  .get("/api/config", (c) => c.json({ paypalClientId: env.PAYPAL_CLIENT_ID }))

  // Storefront data: products, the drop's state, the per-customer limit, and for a
  // signed-in customer what they already have in the live drop.
  .get("/api/store", async (c) => {
    const [[products, drop, { policy }], customer] = await Promise.all([storefront(), currentCustomer(c)]);
    const yours = customer && drop?.status === "live" ? await customerDropOrders(drop, customer.payerId) : null;
    return c.json({
      products: products.map((p) => ({ id: p.id, name: p.name, priceCents: p.priceCents, stock: p.stock, limitedDrop: p.limitedDrop })),
      drop: drop && !drop.cleared ? { status: drop.status, startedAt: drop.startedAt, stockTotal: drop.stockTotal } : null,
      perCustomerLimit: policy.dropLimitPerCustomer,
      yours: yours && { units: yours.units, approvalPath: yours.awaitingToken && `/approve/${yours.awaitingToken}` },
    });
  })

  .get("/api/me", async (c) => {
    const customer = await currentCustomer(c);
    return c.json({
      customer: customer && {
        name: customer.name,
        email: customer.email,
        payerId: customer.payerId,
        verified: customer.verified,
      },
    });
  })

  .get("/api/link-requests/:id", async (c) => {
    const view = await linkRequestView(c.req.param("id"));
    return view ? c.json(view) : c.json({ error: "not_found" }, 404);
  })

  .post("/api/link-requests/:id/approve", perMinute(20), async (c) => {
    const customer = await currentCustomer(c);
    if (!customer) return c.json({ error: "login_required" }, 401);
    const body = linkApproval.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_limits", issues: body.error.issues }, 400);
    const pass = await approveLinkRequest(c.req.param("id"), customer, body.data.capCents, body.data.days);
    return pass ? c.json({ pass }) : c.json({ error: "request_not_pending" }, 409);
  })

  // Agents a customer can pick when linking one from the store.
  .get("/api/agents", async (c) => {
    const agents = await db.select().from(schema.agents).where(eq(schema.agents.blocked, false));
    const listed = DEMO_AGENTS.filter((d) => d.listed).map((d) => demoKeyId(d.name));
    const shown = agents.filter((a) => listed.includes(a.keyId)).sort((a, b) => listed.indexOf(a.keyId) - listed.indexOf(b.keyId));
    return c.json({ agents: shown.map(agentView) });
  })

  // "Paste your agent's key": any registered agent, by its key ID.
  .get("/api/agents/:keyId", async (c) => {
    const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.keyId, c.req.param("keyId").trim()));
    if (!agent) return c.json({ error: "not_found", message: "Doorman doesn't know that key. Ask your agent to register with the store first." }, 404);
    if (agent.blocked) return c.json({ error: "blocked", message: `Static Supply has blocked ${agent.name}.` }, 409);
    return c.json(agentView(agent));
  })

  // The customer chose the agent themselves; it collects the pass next time it visits.
  .post("/api/passes", perMinute(20), async (c) => {
    const customer = await currentCustomer(c);
    if (!customer) return c.json({ error: "login_required" }, 401);
    const body = linkApproval.extend({ agentKeyId: z.string().min(1) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_limits", issues: body.error.issues }, 400);
    const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.keyId, body.data.agentKeyId));
    if (!agent || agent.blocked) return c.json({ error: "unknown_agent", message: "That agent can't be linked." }, 404);
    const pass = await grantPass(agent.keyId, customer, body.data.capCents, body.data.days);
    return c.json({ pass: (await passesFor(customer)).find((p) => p.id === pass.id) });
  })

  .get("/api/passes", async (c) => {
    const customer = await currentCustomer(c);
    if (!customer) return c.json({ error: "login_required" }, 401);
    return c.json({ passes: await passesFor(customer) });
  })

  .post("/api/passes/:id/revoke", perMinute(30), async (c) => {
    const customer = await currentCustomer(c);
    if (!customer) return c.json({ error: "login_required" }, 401);
    const pass = await revokePass(c.req.param("id"), customer);
    return pass ? c.json({ pass }) : c.json({ error: "not_found" }, 404);
  })

  .get("/api/approvals/:token", async (c) => c.json(await approvalView(c.req.param("token"))))

  .post("/api/approvals/:token/authorize", perMinute(30), async (c) =>
    c.json(await authorizeApproval(c.req.param("token"), await currentCustomer(c))),
  )

  .post("/api/approvals/:token/decline", perMinute(30), async (c) => c.json(await declineApproval(c.req.param("token"))))

  .onError((err, c) => {
    if (err instanceof ApprovalError) return c.json({ error: err.code, message: err.message }, err.status);
    throw err;
  });
