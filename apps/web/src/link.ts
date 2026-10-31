// Link your agent + My passes (test page). /link/<request id> comes from an
// agent asking to be linked; /link on its own just shows your passes.
import { $, api, loginHref, me, money, pageStyle } from "./common.js";

interface LinkRequest {
  id: string;
  status: "pending" | "approved" | "expired";
  agent: { name: string; operator: string };
}
interface Pass {
  id: string;
  capCents: number;
  expiresAt: string;
  revokedAt: string | null;
  agentName: string;
  operator: string;
}

document.head.append(Object.assign(document.createElement("style"), { textContent: pageStyle }));
const requestId = location.pathname.split("/").filter(Boolean)[1];
const app = $("app");

async function renderPasses() {
  const { passes } = await api<{ passes: Pass[] }>("/api/passes");
  const box = $("passes");
  if (passes.length === 0) {
    box.innerHTML = `<p class="muted">No passes yet.</p>`;
    return;
  }
  box.innerHTML = passes
    .map((p) => {
      const state = p.revokedAt ? "Revoked" : new Date(p.expiresAt) < new Date() ? "Expired" : "Active";
      return `<div class="card"><b>${p.agentName}</b> <span class="muted">(${p.operator})</span><br/>
        Cap ${money(p.capCents)} · expires ${new Date(p.expiresAt).toLocaleDateString()} · <span class="${state === "Active" ? "ok" : "muted"}">${state}</span>
        ${state === "Active" ? `<br/><button data-revoke="${p.id}">Revoke</button>` : ""}</div>`;
    })
    .join("");
  box.querySelectorAll<HTMLButtonElement>("[data-revoke]").forEach((button) =>
    button.addEventListener("click", async () => {
      if (!confirm("This agent will no longer be able to buy for you here. Revoke?")) return;
      await api(`/api/passes/${button.dataset.revoke}/revoke`, { method: "POST" });
      await renderPasses();
    }),
  );
}

async function render() {
  const customer = await me();
  if (!customer) {
    app.innerHTML = `<p><b>Step 1.</b> Log in with PayPal so the store knows the agent works for you.</p>
      <a class="button" href="${loginHref()}">Log in with PayPal</a>`;
    $("passes").innerHTML = `<p class="muted">Log in to see your passes.</p>`;
    return;
  }

  const who = `<p>Logged in as <b>${customer.name ?? customer.email}</b> · ${
    customer.verified ? `<span class="ok">Verified PayPal account</span>` : `<span class="bad">Not verified</span>`
  }</p>`;
  await renderPasses();
  if (!requestId) {
    app.innerHTML = who + `<p class="muted">Open the link your agent sent you to give it a pass.</p>`;
    return;
  }

  const request = await api<LinkRequest>(`/api/link-requests/${requestId}`);
  if (request.status !== "pending") {
    app.innerHTML = who + `<p class="muted">This link is ${request.status}.</p>`;
    return;
  }
  app.innerHTML =
    who +
    `<div class="card"><p><b>${request.agent.name}</b> (${request.agent.operator}) is asking to shop for you at Static Supply.</p>
      <label>Spending cap per purchase
        <select id="cap"><option value="5000">$50</option><option value="15000" selected>$150</option><option value="30000">$300</option></select></label><br/><br/>
      <label>Expires after
        <select id="days"><option value="1">24 hours</option><option value="7" selected>7 days</option><option value="30">30 days</option></select></label><br/><br/>
      <button id="create">Create pass</button></div>`;
  $("create").addEventListener("click", async () => {
    await api(`/api/link-requests/${requestId}/approve`, {
      method: "POST",
      body: { capCents: Number($<HTMLSelectElement>("cap").value), days: Number($<HTMLSelectElement>("days").value) },
    });
    app.innerHTML = who + `<p class="ok">Pass created. ${request.agent.name} can now shop for you here. You can revoke it any time below.</p>`;
    await renderPasses();
  });
}

render().catch((err) => {
  app.innerHTML = `<p class="bad">${err instanceof Error ? err.message : String(err)}</p>`;
});
