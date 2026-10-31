// PayPal JavaScript SDK v6, loaded once and shared.
import { api } from "./api";

export interface PaymentSession {
  start(options: { presentationMode: "auto" }, order: Promise<{ orderId: string }>): Promise<void>;
}

export interface PayPalSdk {
  findEligibleMethods(options: { currencyCode: string }): Promise<{ isEligible(method: string): boolean }>;
  createPayPalOneTimePaymentSession(handlers: {
    onApprove(data: { orderId: string }): Promise<void>;
    onCancel(): void;
    onError(error: unknown): void;
  }): PaymentSession;
}

declare global {
  interface Window {
    paypal?: { createInstance(options: { clientId: string; components: string[]; pageType?: string }): Promise<PayPalSdk> };
  }
}

// The <paypal-button> web component comes from the SDK.
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "paypal-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { type?: string };
    }
  }
}

let sdk: Promise<PayPalSdk> | null = null;

function loadScript(): Promise<void> {
  if (window.paypal) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://www.sandbox.paypal.com/web-sdk/v6/core";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Couldn't load PayPal. Check your connection and refresh."));
    document.head.append(script);
  });
}

// PayPal's sandbox takes several seconds to start (createInstance alone is often
// 10s+), so pages that will show a PayPal button start this as soon as they open.
// There's no findEligibleMethods call: PayPal is always available for a US
// merchant in USD, and in the sandbox that check alone took ~18s.
export function loadPayPal(): Promise<PayPalSdk> {
  sdk ??= (async () => {
    const [{ paypalClientId }] = await Promise.all([api.config(), loadScript()]);
    return window.paypal!.createInstance({ clientId: paypalClientId, components: ["paypal-payments"], pageType: "checkout" });
  })().catch((err) => {
    sdk = null;
    throw err;
  });
  return sdk;
}

export function preloadPayPal() {
  loadPayPal().catch(() => {});
}
