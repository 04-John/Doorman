// Log in with PayPal for customers. `next` says where to land afterwards,
// e.g. the approval or link page the customer came from.
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { db, schema } from "../db/client.js";
import { endSession, startSession } from "../doorman/sessions.js";
import { PayPalError } from "../paypal/client.js";
import { exchangeCode, fetchProfile, loginUrl } from "../paypal/login.js";

const STATE_COOKIE = "doorman_login";

// Only same-site paths, so the login can't be used to bounce people elsewhere.
function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function withQuery(path: string, query: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${query}`;
}

export const authRoutes = new Hono()
  .get("/auth/paypal/start", (c) => {
    const state = randomUUID();
    const next = safeNext(c.req.query("next"));
    setCookie(c, STATE_COOKIE, `${state}|${encodeURIComponent(next)}`, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 600,
    });
    return c.redirect(loginUrl(state));
  })

  .get("/auth/paypal/callback", async (c) => {
    const { code, state, error } = c.req.query();
    const [expected, encodedNext] = (getCookie(c, STATE_COOKIE) ?? "").split("|");
    const next = safeNext(decodeURIComponent(encodedNext ?? ""));
    deleteCookie(c, STATE_COOKIE, { path: "/" });

    const fail = (reason: string) => c.redirect(withQuery(next, `login=failed&reason=${encodeURIComponent(reason)}`));
    if (error) return fail(error);
    if (!code || !state || state !== expected) return fail("state_mismatch");

    try {
      const profile = await fetchProfile(await exchangeCode(code));
      if (!profile.payerId) return fail("payer_id_not_shared");
      await db
        .insert(schema.customers)
        .values({
          payerId: profile.payerId,
          userId: profile.userId,
          name: profile.name,
          email: profile.email,
          verified: profile.verifiedAccount,
        })
        .onConflictDoUpdate({
          target: schema.customers.payerId,
          set: { name: profile.name, email: profile.email, verified: profile.verifiedAccount },
        });
      await startSession(c, profile.payerId);
      return c.redirect(withQuery(next, "login=ok"));
    } catch (err) {
      console.error("[doorman] Log in with PayPal failed:", err);
      // Surface PayPal's own reason (e.g. invalid_grant when a one-time code is reused).
      const detail = err instanceof PayPalError ? (err.body as { error?: string } | undefined)?.error : undefined;
      return fail(detail ? `token_exchange:${detail}` : "token_exchange");
    }
  })

  .post("/auth/logout", async (c) => {
    await endSession(c);
    return c.json({ ok: true });
  });
