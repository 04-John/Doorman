// Live monitor (test page): KPIs, a live event table, and the detail of one event.
import { $, api, money } from "./common.js";

interface EventRow {
  id: string;
  at: string;
  tier: string;
  agentName: string | null;
  operator: string | null;
  customerName: string | null;
  action: string;
  decision: string;
  reason: string;
  amountCents: number | null;
}
interface Dashboard {
  drop: null | { status: string; productName: string; stockLeft: number; stockTotal: number };
  kpis: null | Record<string, number>;
  simulationRunning: boolean;
}

const tierLabel: Record<string, string> = { verified: "Verified customer", signed: "Signed agent", unknown: "Unknown" };
const decisionLabel: Record<string, string> = { allowed: "Allowed", step_up: "Step up", throttled: "Throttled", blocked: "Blocked" };

function row(e: EventRow): HTMLTableRowElement {
  const tr = document.createElement("tr");
  tr.innerHTML = `<td>${new Date(e.at).toLocaleTimeString()}</td><td>${e.agentName ?? "Unknown"}</td><td>${e.operator ?? ""}</td>
    <td>${tierLabel[e.tier]}</td><td>${e.customerName ?? ""}</td><td>${e.action}</td>
    <td class="${e.decision}">${decisionLabel[e.decision]}</td><td>${e.reason}</td><td>${e.amountCents ? money(e.amountCents) : ""}</td>`;
  tr.addEventListener("click", () => void showDetail(e.id));
  return tr;
}

async function showDetail(id: string) {
  const panel = $("detail");
  panel.style.display = "block";
  panel.innerHTML = "Loading… (the AI explanation takes a few seconds)";
  const detail = await api<{ order?: { approvalUrl: string }; explanation: { text: string; source: string } }>(`/api/events/${id}`);
  panel.innerHTML =
    `<button id="close">Close</button>` +
    `<h3>Why Doorman did this</h3><p>${detail.explanation.text}</p><p class="muted">Written by ${detail.explanation.source === "ai" ? "Gemini" : "the built-in rules"}</p>` +
    (detail.order ? `<p><a href="${detail.order.approvalUrl}" target="_blank">Open the customer's approval link</a></p>` : "") +
    `<pre>${JSON.stringify(detail, null, 2)}</pre>`;
  $("close").addEventListener("click", () => (panel.style.display = "none"));
}

interface TranscriptEntry {
  from: "customer" | "ava" | "store";
  text: string;
  tool?: string;
  ok?: boolean;
}

async function showTranscript() {
  const { transcript } = await api<{ transcript: TranscriptEntry[] }>("/api/drop/transcript");
  $("transcript").innerHTML = transcript
    .map((t) => {
      if (t.from !== "store") return `<p><b>${t.from === "customer" ? "John" : "Ava"}:</b> ${t.text}</p>`;
      const { request, response } = JSON.parse(t.text) as { request: unknown; response: { reason?: string } };
      const outcome = t.ok ? "ok" : `refused: ${response.reason}`;
      return `<p class="muted">→ ${t.tool}(${JSON.stringify(request)}) · ${outcome}</p>`;
    })
    .join("");
}

async function refresh() {
  const d = await api<Dashboard>("/api/dashboard");
  $<HTMLButtonElement>("run").disabled = d.simulationRunning;
  if (!d.drop || !d.kpis) {
    $("drop").textContent = "No drop yet. Press Run the drop.";
    return;
  }
  $("drop").textContent = `${d.drop.productName} drop · ${d.drop.status.toUpperCase()} · ${d.drop.stockLeft} / ${d.drop.stockTotal} left`;
  const k = d.kpis;
  $("kpis").innerHTML = [
    ["Agents seen", k.agentsSeen],
    ["Allowed", k.allowed],
    ["Step up", k.stepUp],
    ["Throttled", k.throttled],
    ["Blocked", k.blocked],
    ["Awaiting approval", money(k.awaitingApprovalCents ?? 0)],
    ["Held", money(k.heldCents ?? 0)],
    ["Charged", money(k.chargedCents ?? 0)],
  ]
    .map(([label, value]) => `<span><b>${value}</b> ${label}</span>`)
    .join("");
}

async function loadEvents() {
  const { events } = await api<{ events: EventRow[] }>("/api/events?limit=300");
  $("rows").replaceChildren(...events.map(row));
}

$("run").addEventListener("click", async () => {
  await api("/api/drop/run", { method: "POST" });
  await Promise.all([loadEvents(), refresh()]);
});

new EventSource("/api/events/stream").addEventListener("event", (msg) => {
  $("rows").prepend(row(JSON.parse((msg as MessageEvent<string>).data)));
});

await Promise.all([loadEvents(), refresh(), showTranscript()]);
setInterval(() => void Promise.all([refresh(), showTranscript()]), 2000);
