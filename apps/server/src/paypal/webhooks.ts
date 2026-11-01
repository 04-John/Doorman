// PayPal webhooks: PayPal tells Doorman what happened to its orders. The server
// registers its own webhook on startup and checks every event's signature with
// PayPal before acting on it.
import { env } from "../env.js";
import { paypal } from "./client.js";

export const WEBHOOK_PATH = "/api/paypal/webhooks";

export const WEBHOOK_EVENTS = [
  "CHECKOUT.ORDER.APPROVED",
  "PAYMENT.AUTHORIZATION.CREATED",
  "PAYMENT.AUTHORIZATION.VOIDED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.DENIED",
] as const;

export interface WebhookEvent {
  id: string;
  event_type: string;
  resource?: {
    id?: string;
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
}

interface Webhook {
  id: string;
  url: string;
  event_types: { name: string }[];
}

let webhookId: Promise<string | null> | null = null;

// PayPal only delivers to a public HTTPS address, so locally there's no webhook.
// On the host: find this app's webhook for our address, or create it, and make
// sure it listens for the events above.
export function ensureWebhook(): Promise<string | null> {
  if (!env.PUBLIC_URL.startsWith("https://")) return Promise.resolve(null);
  webhookId ??= (async () => {
    const url = `${env.PUBLIC_URL}${WEBHOOK_PATH}`;
    const wanted = WEBHOOK_EVENTS.map((name) => ({ name }));
    const { webhooks } = await paypal<{ webhooks: Webhook[] }>("/v1/notifications/webhooks");
    const existing = webhooks.find((w) => w.url === url);
    if (!existing) {
      const created = await paypal<Webhook>("/v1/notifications/webhooks", { method: "POST", body: { url, event_types: wanted } });
      console.log(`[paypal] webhook registered for ${url}`);
      return created.id;
    }
    const names = existing.event_types.map((e) => e.name).sort().join();
    if (names !== [...WEBHOOK_EVENTS].sort().join()) {
      await paypal(`/v1/notifications/webhooks/${existing.id}`, {
        method: "PATCH",
        body: [{ op: "replace", path: "/event_types", value: wanted }],
      });
    }
    return existing.id;
  })().catch((err: unknown) => {
    webhookId = null; // try again with the next event
    throw err;
  });
  return webhookId;
}

const SIGNATURE_HEADERS = {
  auth_algo: "paypal-auth-algo",
  cert_url: "paypal-cert-url",
  transmission_id: "paypal-transmission-id",
  transmission_sig: "paypal-transmission-sig",
  transmission_time: "paypal-transmission-time",
} as const;

// Asks PayPal whether this delivery really came from PayPal, for our webhook.
// The event goes back exactly as it arrived: re-encoding it can break the check.
export async function verifyWebhook(header: (name: string) => string | undefined, rawEvent: string): Promise<boolean> {
  const id = await ensureWebhook();
  if (!id) return false;
  const fields: string[] = [];
  for (const [field, name] of Object.entries(SIGNATURE_HEADERS)) {
    const value = header(name);
    if (!value) return false;
    fields.push(`${JSON.stringify(field)}:${JSON.stringify(value)}`);
  }
  const rawBody = `{${fields.join(",")},"webhook_id":${JSON.stringify(id)},"webhook_event":${rawEvent}}`;
  const result = await paypal<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", { method: "POST", rawBody });
  return result.verification_status === "SUCCESS";
}
