import { env } from "../env.js";

const BASE_URL = "https://api-m.sandbox.paypal.com";

export class PayPalError extends Error {
  constructor(
    readonly status: number,
    readonly debugId: string | undefined,
    readonly body: unknown,
  ) {
    super(`PayPal responded ${status}${debugId ? ` (debug_id ${debugId})` : ""}`);
  }
}

interface CachedToken {
  value: string;
  scope: string;
  expiresAt: number;
}

let cached: CachedToken | undefined;

// App-level token (client credentials). Cached until a minute before it expires.
export async function getAppToken(): Promise<CachedToken> {
  if (cached && Date.now() < cached.expiresAt) return cached;

  const basic = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new PayPalError(res.status, res.headers.get("paypal-debug-id") ?? undefined, body);

  cached = {
    value: String(body.access_token),
    scope: String(body.scope ?? ""),
    expiresAt: Date.now() + (Number(body.expires_in) - 60) * 1000,
  };
  return cached;
}

interface PayPalRequest {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  // A body that's already JSON, sent byte for byte.
  rawBody?: string;
  // Stable key for one logical operation, sent as PayPal-Request-Id so a retry
  // can never create a second order or capture.
  idempotencyKey?: string;
}

export async function paypal<T>(path: string, { method = "GET", body, rawBody, idempotencyKey }: PayPalRequest = {}): Promise<T> {
  const token = await getAppToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token.value}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["PayPal-Request-Id"] = idempotencyKey;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await res.text();
  const parsed: unknown = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new PayPalError(res.status, res.headers.get("paypal-debug-id") ?? undefined, parsed);
  return parsed as T;
}
