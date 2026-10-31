// Test bench for Phase 1. Uses PayPal JS SDK v6 for the buyer approval step.

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

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const logEl = $<HTMLPreElement>("log");
let authorizationId: string | null = null;

function log(message: string, data?: unknown) {
  const line = `${new Date().toLocaleTimeString()}  ${message}${data === undefined ? "" : `\n${JSON.stringify(data, null, 2)}`}`;
  logEl.textContent = `${line}\n\n${logEl.textContent ?? ""}`;
}

async function api<T>(path: string, method: "GET" | "POST" = "GET"): Promise<T> {
  const res = await fetch(path, { method, credentials: "same-origin" });
  const body = (await res.json()) as T;
  if (!res.ok) {
    log(`Server error on ${path}`, body);
    throw new Error(`${path} failed with ${res.status}`);
  }
  return body;
}

async function showLogin() {
  const params = new URLSearchParams(location.search);
  if (params.get("login") === "failed") log(`Login failed: ${params.get("reason")}`);

  const { profile } = await api<{ profile: null | { name: string; email: string; payerId: string; verifiedAccount: boolean } }>("/api/lab/me");
  const el = $("login-status");
  if (!profile) {
    el.textContent = "Not logged in.";
    return;
  }
  el.innerHTML = "";
  el.append(
    `Logged in as ${profile.name ?? "unknown"} (${profile.email ?? "no email shared"}). `,
    Object.assign(document.createElement("span"), {
      className: profile.verifiedAccount ? "ok" : "bad",
      textContent: profile.verifiedAccount ? "Verified PayPal account." : "Not a verified account.",
    }),
    ` Payer ID: ${profile.payerId ?? "not shared"}`,
  );
  log("Profile from Log in with PayPal", profile);
}

function loadSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://www.sandbox.paypal.com/web-sdk/v6/core";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Couldn't load the PayPal SDK"));
    document.head.append(script);
  });
}

async function setUpCheckout() {
  const status = $("checkout-status");
  const { clientId } = await api<{ clientId: string }>("/api/lab/config");
  await loadSdk();
  const sdk = await window.paypal!.createInstance({ clientId, components: ["paypal-payments"], pageType: "checkout" });
  const methods = await sdk.findEligibleMethods({ currencyCode: "USD" });
  if (!methods.isEligible("paypal")) {
    status.textContent = "PayPal isn't available for this browser or region.";
    return;
  }

  const session = sdk.createPayPalOneTimePaymentSession({
    async onApprove({ orderId }) {
      log(`Buyer approved order ${orderId}. Authorizing (holding the money)…`);
      const result = await api<{
        order: { authorizationId: string; authorizationStatus: string; payerId: string; payerEmail: string };
        loggedInPayerId: string | null;
        match: boolean | null;
      }>(`/api/lab/orders/${orderId}/authorize`, "POST");
      log("Authorization result", result);

      authorizationId = result.order.authorizationId;
      const matchEl = $("match-status");
      matchEl.className = result.match === true ? "ok" : result.match === false ? "bad" : "";
      matchEl.textContent =
        result.match === true
          ? `Held ${authorizationId}. The payer matches the logged-in PayPal account.`
          : result.match === false
            ? `Held ${authorizationId}. MISMATCH: paid by ${result.order.payerEmail}, not the logged-in account.`
            : `Held ${authorizationId}. Log in first to compare payer IDs.`;
      $<HTMLButtonElement>("capture").disabled = false;
      $<HTMLButtonElement>("void").disabled = false;
    },
    onCancel() {
      log("Buyer cancelled in PayPal.");
    },
    onError(error) {
      log("PayPal checkout error", String(error));
    },
  });

  const button = $("paypal-button");
  button.removeAttribute("hidden");
  status.textContent = "Click the button and approve with a sandbox buyer account.";
  button.addEventListener("click", () => {
    const order = api<{ id: string }>("/api/lab/orders", "POST").then(({ id }) => {
      log(`Created order ${id} (intent: authorize)`);
      return { orderId: id };
    });
    session.start({ presentationMode: "auto" }, order).catch((err: unknown) => log("Couldn't start checkout", String(err)));
  });
}

async function settle(action: "capture" | "void") {
  if (!authorizationId) return;
  $<HTMLButtonElement>("capture").disabled = true;
  $<HTMLButtonElement>("void").disabled = true;
  const result = await api<{ id: string; status: string }>(`/api/lab/authorizations/${authorizationId}/${action}`, "POST");
  log(action === "capture" ? "Captured: the buyer has been charged" : "Voided: the hold was released", result);
  $("match-status").textContent += ` → ${result.status}`;
}

$("capture").addEventListener("click", () => void settle("capture"));
$("void").addEventListener("click", () => void settle("void"));

showLogin().catch((err: unknown) => log("Couldn't check login", String(err)));
setUpCheckout().catch((err: unknown) => {
  $("checkout-status").textContent = "PayPal checkout failed to load. See the log.";
  log("Checkout setup failed", String(err));
});

export {};
