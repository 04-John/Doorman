// PayPal's webhook deliveries. Anything PayPal can't vouch for is turned away.
import { Hono } from "hono";
import { handlePayPalEvent } from "../doorman/paypal-events.js";
import { verifyWebhook, WEBHOOK_PATH, type WebhookEvent } from "../paypal/webhooks.js";

export const webhookRoutes = new Hono().post(WEBHOOK_PATH, async (c) => {
  const raw = await c.req.text();
  let event: WebhookEvent;
  try {
    event = JSON.parse(raw) as WebhookEvent;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (!(await verifyWebhook((name) => c.req.header(name), raw))) {
    console.warn(`[paypal] turned away a webhook PayPal couldn't verify (${event.event_type ?? "no type"})`);
    return c.json({ error: "invalid_signature" }, 401);
  }
  // An error here answers 5xx, so PayPal delivers the event again later.
  const outcome = await handlePayPalEvent(event);
  console.log(`[paypal] ${event.event_type} ${event.resource?.id ?? ""}: ${outcome}`);
  return c.json({ ok: true });
});
