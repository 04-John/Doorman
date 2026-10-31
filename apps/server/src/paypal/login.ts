import { env } from "../env.js";
import { PayPalError } from "./client.js";

const CONNECT_URL = "https://www.sandbox.paypal.com/connect";
const API_URL = "https://api-m.sandbox.paypal.com";

// "paypalattributes" carries the account verification status and the payer ID.
const SCOPES = ["openid", "profile", "email", "https://uri.paypal.com/services/paypalattributes"];

export interface PayPalProfile {
  userId: string;
  payerId: string | null;
  name: string | null;
  email: string | null;
  verifiedAccount: boolean;
}

export function loginUrl(state: string): string {
  const params = new URLSearchParams({
    flowEntry: "static",
    client_id: env.PAYPAL_CLIENT_ID,
    scope: SCOPES.join(" "),
    redirect_uri: env.PAYPAL_LOGIN_RETURN_URL,
    state,
  });
  return `${CONNECT_URL}?${params}`;
}

// Swap the one-time code PayPal sent to our return URL for the customer's access token.
export async function exchangeCode(code: string): Promise<string> {
  const basic = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${API_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code }),
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new PayPalError(res.status, res.headers.get("paypal-debug-id") ?? undefined, body);
  return String(body.access_token);
}

interface UserInfo {
  user_id: string;
  payer_id?: string;
  name?: string;
  verified_account?: string | boolean;
  emails?: { value: string; primary?: boolean }[];
  email?: string;
}

export async function fetchProfile(customerToken: string): Promise<PayPalProfile> {
  const res = await fetch(`${API_URL}/v1/identity/oauth2/userinfo?schema=paypalv1.1`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  const body = (await res.json()) as UserInfo;
  if (!res.ok) throw new PayPalError(res.status, res.headers.get("paypal-debug-id") ?? undefined, body);

  return {
    userId: body.user_id,
    payerId: body.payer_id ?? null,
    name: body.name ?? null,
    email: body.emails?.find((e) => e.primary)?.value ?? body.emails?.[0]?.value ?? body.email ?? null,
    verifiedAccount: body.verified_account === true || body.verified_account === "true",
  };
}
