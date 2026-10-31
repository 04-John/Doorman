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

export function loadPayPal(): Promise<PayPalSdk> {
  sdk ??= (async () => {
    const { paypalClientId } = await api.config();
    if (!window.paypal) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://www.sandbox.paypal.com/web-sdk/v6/core";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Couldn't load PayPal. Check your connection and refresh."));
        document.head.append(script);
      });
    }
    return window.paypal!.createInstance({ clientId: paypalClientId, components: ["paypal-payments"], pageType: "checkout" });
  })().catch((err) => {
    sdk = null;
    throw err;
  });
  return sdk;
}
