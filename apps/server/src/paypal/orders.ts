import { paypal } from "./client.js";

interface PayPalOrder {
  id: string;
  status: string;
  payer?: { payer_id?: string; email_address?: string };
  purchase_units?: {
    payments?: {
      authorizations?: { id: string; status: string }[];
    };
  }[];
}

export interface OrderSummary {
  id: string;
  status: string;
  payerId: string | null;
  payerEmail: string | null;
  authorizationId: string | null;
  authorizationStatus: string | null;
}

function summarize(order: PayPalOrder): OrderSummary {
  const authorization = order.purchase_units?.[0]?.payments?.authorizations?.[0];
  return {
    id: order.id,
    status: order.status,
    payerId: order.payer?.payer_id ?? null,
    payerEmail: order.payer?.email_address ?? null,
    authorizationId: authorization?.id ?? null,
    authorizationStatus: authorization?.status ?? null,
  };
}

// Doorman never charges straight away: it authorizes (holds) the money first,
// then captures it once the sale is confirmed or voids it if the buyer loses the drop.
export async function createAuthorizeOrder(input: {
  referenceId: string;
  description: string;
  amount: string;
  idempotencyKey: string;
}): Promise<OrderSummary> {
  const order = await paypal<PayPalOrder>("/v2/checkout/orders", {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    body: {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: input.referenceId,
          description: input.description,
          amount: { currency_code: "USD", value: input.amount },
        },
      ],
    },
  });
  return summarize(order);
}

export async function getOrder(orderId: string): Promise<OrderSummary> {
  return summarize(await paypal<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`));
}

// Call after the buyer approves in PayPal.
export async function authorizeOrder(orderId: string, idempotencyKey: string): Promise<OrderSummary> {
  const order = await paypal<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, {
    method: "POST",
    idempotencyKey,
    body: {},
  });
  return summarize(order);
}

export async function captureAuthorization(authorizationId: string, idempotencyKey: string) {
  return paypal<{ id: string; status: string }>(
    `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`,
    { method: "POST", idempotencyKey, body: { final_capture: true } },
  );
}

export async function voidAuthorization(authorizationId: string, idempotencyKey: string) {
  await paypal(`/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`, {
    method: "POST",
    idempotencyKey,
  });
  return { id: authorizationId, status: "VOIDED" };
}
