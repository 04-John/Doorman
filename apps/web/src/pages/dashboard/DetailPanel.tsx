// "Why did Doorman do this?" for one request. Slides in from the right.
import { useEffect, useState } from "react";
import { api, type Check, type DoorEvent, type EventDetail, type Explanation } from "../../lib/api";
import { clock, expiresIn, money, requestNumber, shortId } from "../../lib/format";
import { CheckRow, ExplanationSkeleton, Skeleton, Spinner, Timeline, type StepState } from "../../ui/bits";
import { AgentAvatar, DecisionBadge, ICON, Icon, IdentityBadge } from "../../ui/status";
import { useToast } from "../../ui/toast";
import { MONEY_BY_STATUS } from "./rows";

const CHECK_LABELS: Record<Check["id"], string> = {
  signature: "Signature valid",
  pass: "Agent pass valid and not expired",
  cap: "Within spending cap",
  drop_limit: "Drop limit",
  rate: "Request rate normal",
  payer_match: "Payer match",
};
const CHECK_ORDER: Check["id"][] = ["signature", "pass", "cap", "drop_limit", "rate", "payer_match"];

const ACTION = { browse: "Browsed", cart: "Added to cart", checkout: "Checkout", charge: "Paid", release: "Released", approve: "Approved", link: "Linked" } as const;

// Short notes for the right-hand side of each check row.
function checkNote(check: Check, detail: EventDetail): string {
  const d = check.detail;
  switch (check.id) {
    case "signature":
      return check.status === "pass" ? "Registered key" : "No signature";
    case "pass":
      if (check.status === "na") return "No pass";
      if (check.status === "fail") return d;
      return detail.pass ? `Expires ${expiresIn(detail.pass.expiresAt)}` : "Valid";
    case "cap":
      return check.status === "na" ? "" : d.replace(" of a ", " of ");
    case "drop_limit":
      if (check.status === "na") return "";
      if (d.startsWith("0 bought")) return "First hoodie";
      return d.replace(/ \(limit .*\)$/, "");
    case "rate": {
      const n = /^(\d+)/.exec(d)?.[1];
      return check.status === "pass" ? (n ? `${n} req/min` : "") : (n ? `${n} req/min` : d);
    }
    case "payer_match":
      return d;
  }
}

// The checks for this row. Payment events take theirs from the order's checkout.
function checksFor(detail: EventDetail): Check[] {
  const own = detail.event.checks;
  const checkout = detail.timeline.find((e) => e.action === "checkout");
  const base = own.length ? own : (checkout?.checks ?? []);
  const payer = own.find((c) => c.id === "payer_match");
  return CHECK_ORDER.map(
    (id) =>
      (id === "payer_match" && payer ? payer : base.find((c) => c.id === id)) ?? {
        id,
        status: "na" as const,
        detail: id === "payer_match" && detail.order ? "After approval in PayPal" : "",
      },
  );
}

function stepFor(e: DoorEvent, amount: string): { label: string; state: StepState; time: string } {
  const time = clock(e.at);
  if (e.action === "approve") return { label: "Customer approved in PayPal", state: "done", time };
  if (e.action === "charge") return { label: `Charged ${amount}`, state: "done", time };
  if (e.action === "release") return { label: e.reasonCode === "DECLINED" ? "Customer declined" : `Released ${amount}: ${e.reason.replace(/\. Hold released$/, "")}`, state: "fail", time };
  const what = ACTION[e.action];
  if (e.decision === "throttled") return { label: "Slowed down: too many requests", state: "fail", time };
  if (e.decision === "blocked") {
    const asked = /Tried to buy (\d+); the limit is (\d+)/.exec(e.reason);
    if (asked) return { label: `Add ${asked[1]} to cart refused: limit ${asked[2]} per customer`, state: "fail", time };
    return { label: `${e.action === "cart" ? "Add to cart" : what} refused`, state: "fail", time };
  }
  if (e.decision === "step_up") return { label: `${what}: paused for the customer to confirm`, state: "done", time };
  return { label: what, state: "done", time };
}

function timelineFor(detail: EventDetail) {
  const amount = money(detail.order?.amountCents ?? detail.event.amountCents ?? 0);
  // Collapse runs of identical steps (a bot browsing five times is one line).
  const steps: { label: string; state: StepState; time?: string }[] = [];
  for (const e of detail.timeline) {
    const step = stepFor(e, amount);
    const prev = steps.at(-1);
    if (prev && prev.label.replace(/ ×\d+$/, "") === step.label) {
      const n = Number(/×(\d+)$/.exec(prev.label)?.[1] ?? 1) + 1;
      prev.label = `${step.label} ×${n}`;
      prev.time = step.time;
    } else steps.push(step);
    if (e.action === "approve") steps.push({ label: `Held ${amount}`, state: "done", time: clock(e.at) });
  }
  const status = detail.order?.status;
  if (status === "awaiting_approval") {
    steps.push({ label: detail.event.decision === "step_up" ? "Waiting for a customer to confirm in PayPal" : "Waiting for the customer to approve in PayPal", state: "cur" });
    steps.push({ label: `Held ${amount}`, state: "pend" }, { label: `Charged ${amount}`, state: "pend" });
  }
  return steps.slice(-8);
}

function headline(detail: EventDetail): string {
  const { event } = detail;
  const who = detail.customer?.name?.split(" ")[0];
  switch (event.reasonCode) {
    case "CHARGED":
      return `${who ?? "The customer"} approved in PayPal and the payer matched the pass`;
    case "STEP_UP_NO_PASS":
      return "Signed agent with no linked customer. Paused until a customer confirms it in PayPal";
    case "UNKNOWN_BROWSING":
      return "Unknown agents can browse, but never buy";
    case "PAYER_MISMATCH":
      return "Approved by a different PayPal account than the pass holder. Hold released.";
    default:
      return event.reason;
  }
}

const card = { border: "1px solid #E4E2DC", borderRadius: 12, padding: 16 } as const;

export function DetailPanel({ eventId, perCustomer, onClose, onChanged }: { eventId: string | null; perCustomer: number; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const open = eventId != null;

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    setDetail(null);
    setExplanation(null);
    api.event(eventId).then((d) => {
      if (cancelled) return;
      setDetail(d);
      if (d.explanation) setExplanation(d.explanation);
      else api.explanation(eventId).then((x) => !cancelled && setExplanation(x)).catch(() => !cancelled && setExplanation({ text: d.event.reason, source: "rules" }));
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function act(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await fn();
      toast(message);
      onChanged();
      if (eventId) setDetail(await api.event(eventId));
    } catch (err) {
      toast(err instanceof Error ? err.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  const event = detail?.event;
  const unknown = event?.tier === "unknown";
  const order = detail?.order;
  const moneyLabel = order ? MONEY_BY_STATUS[order.status] : null;
  const used = order && (order.status === "held" || order.status === "charged" || order.status === "awaiting_approval") ? order.amountCents : 0;

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(21,23,28,.32)", opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none", transition: "opacity .25s ease", zIndex: 20 }}
      />
      <aside
        aria-label="Request detail"
        aria-hidden={!open}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 520,
          maxWidth: "100vw",
          background: "#FFFFFF",
          boxShadow: "-24px 0 60px rgba(21,23,28,.18)",
          transform: `translateX(${open ? "0" : "105%"})`,
          transition: "transform .34s cubic-bezier(.2,.8,.2,1)",
          zIndex: 21,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {!detail || !event ? (
          <div aria-busy="true" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
            <Skeleton width="60%" height={12} />
            <Skeleton width={140} height={36} radius={999} />
            <Skeleton width="90%" height={22} />
            <Skeleton width="100%" height={150} radius={12} />
            <Skeleton width="100%" height={240} radius={12} />
          </div>
        ) : (
          <>
            <div style={{ flex: "none", padding: "18px 24px 20px", borderBottom: "1px solid #E4E2DC" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="mono" style={{ fontSize: 12.5, color: "#6B6E76" }}>
                  Request {requestNumber(event.id)} · {clock(event.at)} · {ACTION[event.action]}
                </span>
                <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, border: 0, borderRadius: 8, background: "#F4F3EF", display: "grid", placeItems: "center" }}>
                  <Icon d={ICON.close} color="#15171C" width={1.8} />
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                <DecisionBadge decision={event.decision} size="l" />
                {order && moneyLabel && (
                  <span className="mono" style={{ fontSize: 14, color: "#4A4D55" }}>
                    {money(order.amountCents, { decimals: true })} · {moneyLabel}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.32, letterSpacing: "-0.01em", marginTop: 12 }}>{headline(detail)}</div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "18px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={card}>
                <div className="label">Agent</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
                  <AgentAvatar name={event.agentName} size={42} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>{unknown ? "Unknown agent" : event.agentName}</div>
                    <div style={{ fontSize: 14, color: "#4A4D55" }}>{unknown ? "No operator declared" : event.operator}</div>
                  </div>
                  <IdentityBadge tier={event.tier} size="m" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px", marginTop: 14, paddingTop: 14, borderTop: "1px solid #EEEDE8" }}>
                  {[
                    { k: "Signature", v: unknown ? "✗ No signature sent" : "✓ Valid", fg: unknown ? "#B42318" : "#0F6B3E", mono: false },
                    { k: unknown ? "Source" : "Key ID", v: unknown ? (detail.source ?? "unknown") : shortId(event.agentKeyId ?? ""), fg: "#15171C", mono: true },
                    { k: "First seen", v: clock(detail.firstSeen), fg: "#15171C", mono: true },
                    { k: "Customer", v: detail.customer?.name ?? event.customerName ?? "None linked", fg: detail.customer?.name || event.customerName ? "#15171C" : "#6B6E76", mono: false },
                  ].map((x) => (
                    <div key={x.k}>
                      <div style={{ fontSize: 12.5, color: "#6B6E76" }}>{x.k}</div>
                      <div style={{ fontSize: 14.5, fontWeight: 500, marginTop: 2, color: x.fg, fontFamily: x.mono ? "var(--mono)" : "inherit" }}>{x.v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {detail.pass && (
                <div style={{ ...card, background: "#FAF9F6" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="label">Agent pass</span>
                    {detail.pass.revokedAt ? (
                      <span style={{ height: 22, padding: "0 9px", borderRadius: 999, background: "#F1F0EC", color: "#4A4D55", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center" }}>Revoked</span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 22, padding: "0 9px", borderRadius: 999, background: "#E4F4EA", color: "#0F6B3E", fontSize: 12, fontWeight: 700 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#0F6B3E" }} />
                        Active
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 600, marginTop: 10 }}>{detail.customer?.name ?? "Customer"}</div>
                  {detail.customer?.verified && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, color: "#0F6B3E", fontWeight: 500, marginTop: 2 }}>
                      <Icon d={ICON.check} color="#0F6B3E" />
                      Verified PayPal account
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginTop: 14 }}>
                    <span style={{ color: "#4A4D55" }}>
                      Used <b className="mono" style={{ color: "#15171C", fontWeight: 600 }}>{money(used)}</b> of {money(detail.pass.capCents)}
                    </span>
                    <span style={{ color: "#4A4D55" }}>Expires {expiresIn(detail.pass.expiresAt)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "#E4E2DC", marginTop: 8, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, (used / detail.pass.capCents) * 100)}%`, background: "#15171C" }} />
                  </div>
                  <div style={{ fontSize: 13, color: "#6B6E76", marginTop: 8 }}>Cap {money(detail.pass.capCents)} per purchase</div>
                </div>
              )}

              <div style={{ ...card, padding: "6px 16px" }}>
                <div className="label" style={{ padding: "10px 0 4px" }}>
                  Checks
                </div>
                {checksFor(detail).map((check, i) => (
                  <CheckRow
                    key={check.id}
                    first={i === 0}
                    status={check.status}
                    label={check.id === "drop_limit" ? `${CHECK_LABELS.drop_limit} (${perCustomer} per customer)` : CHECK_LABELS[check.id]}
                    note={checkNote(check, detail)}
                  />
                ))}
              </div>

              <div style={{ borderRadius: 12, padding: 16, background: "#F4F3EF" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="label">Why Doorman did this</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 5, border: "1px solid #D3D0C8", color: "#4A4D55" }}>
                    {explanation?.source === "rules" ? "Rules summary" : "AI summary"}
                  </span>
                </div>
                {explanation ? (
                  <p className="fade-in" style={{ fontSize: 15, lineHeight: 1.58, margin: "10px 0 0" }}>
                    {explanation.text}
                  </p>
                ) : (
                  <ExplanationSkeleton />
                )}
              </div>

              <div style={card}>
                <div className="label" style={{ marginBottom: 12 }}>
                  Timeline
                </div>
                <Timeline steps={timelineFor(detail)} />
              </div>

              {order && (
                <div style={{ ...card, padding: "14px 16px" }}>
                  <div className="label" style={{ marginBottom: 6 }}>
                    PayPal references
                  </div>
                  {[
                    ["Order ID", order.paypal.orderId],
                    ["Authorization ID", order.paypal.authorizationId],
                    ["Capture ID", order.paypal.captureId],
                    [
                      "Payment status",
                      { awaiting_approval: "AWAITING APPROVAL", held: "AUTHORIZED", charged: "CAPTURED", released: order.paypal.authorizationId ? "VOIDED" : "NOT APPROVED", declined: "DECLINED" }[order.status],
                    ],
                  ]
                    .filter((x): x is [string, string] => Boolean(x[1]))
                    .map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 30, fontSize: 13.5 }}>
                        <span style={{ color: "#4A4D55" }}>{k}</span>
                        <span className="mono" style={{ fontSize: 13 }}>
                          {v}
                        </span>
                      </div>
                    ))}
                  {order.webhooks.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 12, borderTop: "1px solid #EEEDE8" }}>
                      <div className="label" style={{ marginBottom: 6 }}>
                        Confirmed by PayPal webhooks
                      </div>
                      {order.webhooks.map((w) => (
                        <div key={`${w.type}-${w.at}`} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "5px 0" }}>
                          <span style={{ marginTop: 2 }}>
                            <Icon d={ICON.check} color="#0F6B3E" size={14} width={1.8} />
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="mono" style={{ fontSize: 12.5, overflowWrap: "anywhere" }}>
                              {w.type}
                            </div>
                            <div style={{ fontSize: 13, color: "#4A4D55" }}>{w.outcome}</div>
                          </div>
                          <span className="mono" style={{ fontSize: 12, color: "#6B6E76" }}>
                            {clock(w.at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {order.status === "awaiting_approval" && (
                    <a href={order.approvalUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 14, fontWeight: 600, textDecoration: "underline" }}>
                      <Icon d={ICON.link} color="#15171C" width={1.5} />
                      Open the customer's approval page
                    </a>
                  )}
                </div>
              )}
            </div>

            <div style={{ flex: "none", display: "flex", gap: 10, padding: "14px 24px", borderTop: "1px solid #E4E2DC", background: "#FFFFFF", minHeight: 72 }}>
              {detail.agent && !detail.agent.blocked && (
                <button
                  type="button"
                  className="btn btn-destructive"
                  style={{ height: 44, fontSize: 14.5, borderRadius: 10 }}
                  disabled={busy}
                  onClick={() => act(() => api.blockAgent(detail.agent!.keyId), `${detail.agent!.name} is blocked. Future requests will be refused.`)}
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="8" cy="8" r="5.8" stroke="#B42318" strokeWidth="1.8" />
                    <path d="M4 12l8-8" stroke="#B42318" strokeWidth="1.8" />
                  </svg>
                  Block this agent
                </button>
              )}
              {detail.agent?.blocked && (
                <span style={{ height: 44, padding: "0 14px", display: "flex", alignItems: "center", fontSize: 14.5, fontWeight: 600, color: "#B42318", background: "#FDEAE7", borderRadius: 10 }}>Agent blocked</span>
              )}
              {order && (order.status === "held" || order.status === "awaiting_approval") && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ height: 44, fontSize: 14.5, borderRadius: 10 }}
                  disabled={busy}
                  onClick={() =>
                    act(
                      () => api.releaseOrder(order.id),
                      order.status === "held" ? "Hold released. No money was taken." : "Order cancelled. Nothing was charged.",
                    )
                  }
                >
                  {order.status === "held" ? "Release hold" : "Cancel order"}
                </button>
              )}
              {busy && (
                <span style={{ alignSelf: "center" }}>
                  <Spinner />
                </span>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
