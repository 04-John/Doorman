// Customer-facing API: who am I, link an agent, my passes, approve a purchase.
import { Hono } from "hono";
import { z } from "zod";
import { ApprovalError, approvalView, authorizeApproval, declineApproval } from "../doorman/approvals.js";
import { approveLinkRequest, linkRequestView, passesFor, revokePass } from "../doorman/passes.js";
import { currentCustomer } from "../doorman/sessions.js";
import { env } from "../env.js";

const linkApproval = z.object({
  capCents: z.number().int().min(100).max(1_000_000),
  days: z.union([z.literal(1), z.literal(7), z.literal(30)]),
});

export const customerRoutes = new Hono()
  .get("/api/config", (c) => c.json({ paypalClientId: env.PAYPAL_CLIENT_ID }))

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

  .post("/api/link-requests/:id/approve", async (c) => {
    const customer = await currentCustomer(c);
    if (!customer) return c.json({ error: "login_required" }, 401);
    const body = linkApproval.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_limits", issues: body.error.issues }, 400);
    const pass = await approveLinkRequest(c.req.param("id"), customer, body.data.capCents, body.data.days);
    return pass ? c.json({ pass }) : c.json({ error: "request_not_pending" }, 409);
  })

  .get("/api/passes", async (c) => {
    const customer = await currentCustomer(c);
    if (!customer) return c.json({ error: "login_required" }, 401);
    return c.json({ passes: await passesFor(customer) });
  })

  .post("/api/passes/:id/revoke", async (c) => {
    const customer = await currentCustomer(c);
    if (!customer) return c.json({ error: "login_required" }, 401);
    const pass = await revokePass(c.req.param("id"), customer);
    return pass ? c.json({ pass }) : c.json({ error: "not_found" }, 404);
  })

  .get("/api/approvals/:token", async (c) => c.json(await approvalView(c.req.param("token"))))

  .post("/api/approvals/:token/authorize", async (c) =>
    c.json(await authorizeApproval(c.req.param("token"), await currentCustomer(c))),
  )

  .post("/api/approvals/:token/decline", async (c) => c.json(await declineApproval(c.req.param("token"))))

  .onError((err, c) => {
    if (err instanceof ApprovalError) return c.json({ error: err.code, message: err.message }, err.status);
    throw err;
  });
