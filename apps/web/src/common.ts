// Shared helpers for the Phase 2 test pages (replaced by the real UI in Phase 3).

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export const money = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: { error?: string; message?: string },
  ) {
    super(body.message ?? body.error ?? `Request failed (${status})`);
  }
}

export async function api<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = await res.json();
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export interface Customer {
  name: string | null;
  email: string | null;
  payerId: string;
  verified: boolean;
}

export async function me(): Promise<Customer | null> {
  return (await api<{ customer: Customer | null }>("/api/me")).customer;
}

export function loginHref(): string {
  return `/auth/paypal/start?next=${encodeURIComponent(location.pathname)}`;
}

interface PaymentSession {
  start(options: { presentationMode: "auto" }, order: Promise<{ orderId: string }>): Promise<void>;
}
interface SdkInstance {
  findEligibleMethods(options: { currencyCode: string }): Promise<{ isEligible(method: string): boolean }>;
  createPayPalOneTimePaymentSession(handlers: {
    onApprove(data: { orderId: string }): Promise<void>;
    onCancel(): void;
    onError(error: unknown): void;
  }): PaymentSession;
}
declare global {
  interface Window {
    paypal?: { createInstance(options: { clientId: string; components: string[]; pageType?: string }): Promise<SdkInstance> };
  }
}

// PayPal JS SDK v6, ready to start one-time payment sessions.
export async function loadPayPal(): Promise<SdkInstance> {
  const { paypalClientId } = await api<{ paypalClientId: string }>("/api/config");
  if (!window.paypal) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://www.sandbox.paypal.com/web-sdk/v6/core";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Couldn't load the PayPal SDK"));
      document.head.append(script);
    });
  }
  return window.paypal!.createInstance({ clientId: paypalClientId, components: ["paypal-payments"], pageType: "checkout" });
}

export const pageStyle = `
  body { font-family: system-ui, sans-serif; max-width: 520px; margin: 32px auto; padding: 0 16px; line-height: 1.5; }
  .card { border: 1px solid #ccc; border-radius: 10px; padding: 16px; margin: 12px 0; }
  .ok { color: #0a7d2c; font-weight: 600; } .bad { color: #b42318; font-weight: 600; } .muted { color: #666; }
  button, .button { font: inherit; padding: 8px 14px; border-radius: 6px; border: 1px solid #888; background: #f4f4f4; cursor: pointer; color: inherit; text-decoration: none; display: inline-block; }
  .tag { display: inline-block; font-size: 12px; padding: 2px 8px; border-radius: 99px; background: #eee; }
`;
