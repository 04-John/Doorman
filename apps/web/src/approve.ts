// Approve purchase (test page). Opened from the link an agent sends its customer.
import { $, ApiError, api, loadPayPal, loginHref, me, money, pageStyle } from "./common.js";

interface Approval {
  status: "awaiting_approval" | "held" | "charged" | "released" | "declined";
  stepUp: boolean;
  paypalOrderId: string;
  product: { name: string };
  quantity: number;
  amountCents: number;
  agent: { name: string; operator: string } | null;
  pass: { capCents: number; expiresAt: string; customerName: string | null } | null;
  releaseReason: string | null;
}

document.head.append(Object.assign(document.createElement("style"), { textContent: pageStyle }));
const token = location.pathname.split("/").filter(Boolean).at(-1) ?? "";
const app = $("app");

const finalMessages: Record<Exclude<Approval["status"], "awaiting_approval">, (a: Approval) => string> = {
  held: () => `<p class="ok">Payment held. Doorman is confirming your order…</p>`,
  charged: (a) => `<p class="ok">Done. Your ${a.product.name} is on its way.</p>`,
  released: (a) => `<p class="bad">${a.releaseReason ?? "Released"}. We released the hold, so no money was taken.</p>`,
  declined: () => `<p class="muted">Cancelled. Nothing was charged.</p>`,
};

function summary(a: Approval): string {
  const who = a.agent
    ? a.stepUp
      ? `An agent called <b>${a.agent.name}</b> (${a.agent.operator}) wants to buy this for you. Doorman doesn't know it yet.`
      : `<b>${a.agent.name}</b> (${a.agent.operator}) wants to buy this for you.`
    : "Someone wants to buy this for you.";
  const limits = a.pass
    ? `<p class="muted">Within your ${money(a.pass.capCents)} cap · pass expires ${new Date(a.pass.expiresAt).toLocaleDateString()}</p>`
    : "";
  return `<div class="card"><p>${who}</p><h2>${a.product.name} × ${a.quantity}</h2><p><b>${money(a.amountCents)}</b></p>${limits}</div>`;
}

async function render() {
  const [approval, customer] = await Promise.all([api<Approval>(`/api/approvals/${token}`), me()]);
  if (approval.status !== "awaiting_approval") {
    app.innerHTML = summary(approval) + finalMessages[approval.status](approval);
    return;
  }

  if (approval.stepUp && !customer) {
    app.innerHTML =
      summary(approval) +
      `<p><b>Step 1.</b> Confirm this agent works for you.</p><a class="button" href="${loginHref()}">Log in with PayPal</a>` +
      `<p class="muted">Step 2: approve the payment.</p>`;
    return;
  }

  app.innerHTML =
    summary(approval) +
    (customer ? `<p class="muted">Logged in as ${customer.name ?? customer.email}</p>` : "") +
    `<paypal-button type="pay" id="pay"></paypal-button>
     <p id="status" class="muted"></p>
     <p><a href="#" id="decline">This isn't me / Decline</a></p>`;

  $("decline").addEventListener("click", async (e) => {
    e.preventDefault();
    await api(`/api/approvals/${token}/decline`, { method: "POST" });
    await render();
  });

  const sdk = await loadPayPal();
  const session = sdk.createPayPalOneTimePaymentSession({
    async onApprove() {
      $("status").textContent = "Payment held. Doorman is confirming your order…";
      try {
        await api(`/api/approvals/${token}/authorize`, { method: "POST" });
      } catch (err) {
        $("status").textContent = err instanceof ApiError ? err.message : String(err);
        return;
      }
      await render();
    },
    onCancel() {
      $("status").textContent = "You closed PayPal. Nothing was charged.";
    },
    onError(error) {
      $("status").textContent = `PayPal error: ${String(error)}`;
    },
  });
  $("pay").addEventListener("click", () => {
    void session.start({ presentationMode: "auto" }, Promise.resolve({ orderId: approval.paypalOrderId }));
  });
}

render().catch((err) => {
  app.innerHTML = `<p class="bad">${err instanceof Error ? err.message : String(err)}</p>`;
});
