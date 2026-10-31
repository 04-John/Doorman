// Phase 1 test bench: lets a person try Log in with PayPal and an
// authorize → capture/void purchase from the browser at /lab.html.
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { env } from "../env.js";
import { exchangeCode, fetchProfile, loginUrl, type PayPalProfile } from "../paypal/login.js";
import { authorizeOrder, captureAuthorization, createAuthorizeOrder, voidAuthorization } from "../paypal/orders.js";
import { findProduct } from "../store/catalog.js";

const SESSION_COOKIE = "doorman_sid";
const STATE_COOKIE = "doorman_login_state";
const sessions = new Map<string, PayPalProfile>();

export const labRoutes = new Hono()
  .get("/api/lab/config", (c) => c.json({ clientId: env.PAYPAL_CLIENT_ID }))

  .get("/auth/paypal/start", (c) => {
    const state = randomUUID();
    setCookie(c, STATE_COOKIE, state, { httpOnly: true, sameSite: "Lax", path: "/", maxAge: 600 });
    return c.redirect(loginUrl(state));
  })

  .get("/auth/paypal/callback", async (c) => {
    const { code, state, error } = c.req.query();
    const expected = getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: "/" });
    if (error) return c.redirect(`/lab.html?login=failed&reason=${encodeURIComponent(error)}`);
    if (!code || !state || state !== expected) return c.redirect("/lab.html?login=failed&reason=state_mismatch");

    try {
      const profile = await fetchProfile(await exchangeCode(code));
      const sid = randomUUID();
      sessions.set(sid, profile);
      setCookie(c, SESSION_COOKIE, sid, { httpOnly: true, sameSite: "Lax", path: "/" });
      return c.redirect("/lab.html?login=ok");
    } catch (err) {
      console.error("[doorman] Log in with PayPal failed:", err);
      return c.redirect("/lab.html?login=failed&reason=token_exchange");
    }
  })

  .get("/api/lab/me", (c) => c.json({ profile: sessions.get(getCookie(c, SESSION_COOKIE) ?? "") ?? null }))

  .post("/api/lab/orders", async (c) => {
    const product = findProduct("hoodie-night-shift")!;
    const order = await createAuthorizeOrder({
      referenceId: product.id,
      description: product.name,
      amount: product.price,
      idempotencyKey: randomUUID(),
    });
    return c.json({ id: order.id });
  })

  .post("/api/lab/orders/:id/authorize", async (c) => {
    const id = c.req.param("id");
    const order = await authorizeOrder(id, `authorize-${id}`);
    const profile = sessions.get(getCookie(c, SESSION_COOKIE) ?? "");
    // The core Doorman check: is the person who paid the person who linked the agent?
    const match = profile?.payerId && order.payerId ? profile.payerId === order.payerId : null;
    return c.json({ order, loggedInPayerId: profile?.payerId ?? null, match });
  })

  .post("/api/lab/authorizations/:id/capture", async (c) => {
    const id = c.req.param("id");
    return c.json(await captureAuthorization(id, `capture-${id}`));
  })

  .post("/api/lab/authorizations/:id/void", async (c) => {
    const id = c.req.param("id");
    return c.json(await voidAuthorization(id, `void-${id}`));
  });
