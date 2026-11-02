// The assistant's conversation in the drop (Ava, unless the customer linked another):
// the customer's request, every store reply, and the assistant's message back.
import { useEffect, useRef } from "react";
import type { Transcript, TranscriptEntry } from "../../lib/api";
import { clock, money } from "../../lib/format";
import { ICON, Icon } from "../../ui/status";

export type Message =
  | { kind: "customer"; at: string; text: string }
  | { kind: "store"; at: string; call: string; ok: boolean; text: string }
  | { kind: "note"; text: string; tone: "adapt" | "paid" | "released" }
  | { kind: "assistant"; at: string; text: string; link: string | null };

// Who's talking, as the conversation names them.
export interface People {
  agent: string;
  // "John", or "Customer" when nobody has logged in.
  first: string;
  // "John D.", or "the customer".
  short: string;
}

export function chatPeople(t: Transcript | null): People {
  const name = t?.customer?.trim() || null;
  return {
    agent: t?.agent ?? "Ava",
    first: name?.split(/\s+/)[0] ?? "Customer",
    short: name ? name.replace(/^(\S+)\s+(\S).*$/, "$1 $2.") : "the customer",
  };
}

const firstOrTheCustomer = (who: People) => (who.first === "Customer" ? "the customer" : who.first);

interface StoreTurn {
  request: Record<string, unknown>;
  response: Record<string, unknown>;
}

function describe(entry: TranscriptEntry, turn: StoreTurn, who: People): { call: string; text: string } {
  const { request, response } = turn;
  const quantity = typeof request.quantity === "number" ? ` ×${request.quantity}` : "";
  const query = typeof request.query === "string" ? ` "${request.query.toLowerCase()}"` : "";
  const call = `${entry.tool}${entry.tool === "search_products" ? query : entry.tool === "add_to_cart" ? quantity : ""}`;
  if (!entry.ok) return { call, text: `Refused: ${String(response.reason ?? response.error ?? "not allowed")}` };
  if (entry.tool === "search_products") {
    const products = (response.products as { name: string; price: string; limitedDrop: boolean }[] | undefined) ?? [];
    const hit = products[0];
    return { call, text: hit ? `${hit.name} · ${hit.price}${hit.limitedDrop ? " · drop live" : ""}` : "No matching products" };
  }
  if (entry.tool === "add_to_cart") return { call, text: `Cart created · ${String(response.total ?? "")}` };
  if (entry.tool === "checkout") return { call, text: `Approval link ready · nothing charged until ${firstOrTheCustomer(who)} approves` };
  return { call, text: "OK" };
}

export function toMessages(t: Transcript): Message[] {
  const { transcript, orders } = t;
  const who = chatPeople(t);
  const messages: Message[] = [];
  let lastRefusedCart: number | null = null;
  for (const entry of transcript) {
    if (entry.from === "customer") {
      messages.push({ kind: "customer", at: entry.at, text: entry.text });
    } else if (entry.from === "store") {
      let turn: StoreTurn;
      try {
        turn = JSON.parse(entry.text) as StoreTurn;
      } catch {
        continue;
      }
      const quantity = typeof turn.request.quantity === "number" ? turn.request.quantity : null;
      if (entry.tool === "add_to_cart" && entry.ok && lastRefusedCart != null && quantity != null && quantity !== lastRefusedCart) {
        messages.push({ kind: "note", tone: "adapt", text: `${who.agent} adapts: ${quantity} hoodie${quantity === 1 ? "" : "s"} instead of ${lastRefusedCart}` });
      }
      lastRefusedCart = entry.tool === "add_to_cart" && !entry.ok ? quantity : entry.tool === "add_to_cart" ? null : lastRefusedCart;
      messages.push({ kind: "store", at: entry.at, ...describe(entry, turn, who), ok: entry.ok ?? false });

      const order = entry.orderId ? orders.find((o) => o.id === entry.orderId) : undefined;
      if (order?.status === "charged") messages.push({ kind: "note", tone: "paid", text: `${who.first} approved in PayPal · ${money(order.amountCents)} charged` });
      if (order?.status === "released") messages.push({ kind: "note", tone: "released", text: "Payment released · no money was taken" });
    } else {
      // Exactly the approval link, without anything the AI put around it (a full stop, brackets, markdown).
      const link = /https?:\/\/[^\s()<>[\]"'`*]+\/approve\/[A-Za-z0-9_-]+/.exec(entry.text)?.[0] ?? null;
      messages.push({ kind: "assistant", at: entry.at, text: link ? entry.text.replace(link, "").replace(/\s+([:.!])?\s*$/, "$1").trim() : entry.text, link });
    }
  }
  // A charge shows after the assistant's message, the way it happened.
  const paid = messages.findIndex((m) => m.kind === "note" && m.tone !== "adapt");
  if (paid >= 0) messages.push(...messages.splice(paid, 1));
  return messages;
}

const NOTE_STYLE = {
  adapt: { fg: "#8A5300", bg: "#FDF1DC", bd: "#EBC98C", icon: ICON.arrow },
  paid: { fg: "#0F6B3E", bg: "#E4F4EA", bd: "#B2DCC2", icon: ICON.check },
  released: { fg: "#4A4D55", bg: "#F1F0EC", bd: "#D3D0C8", icon: ICON.dash },
};

const meta = { display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6B6E76" } as const;

export function MessageView({ m, who }: { m: Message; who: People }) {
  if (m.kind === "customer")
    return (
      <>
        <div style={meta}>
          <span style={{ fontWeight: 600, color: "#4A4D55" }}>
            {who.first} → {who.agent}
          </span>
          <span className="mono">{clock(m.at)}</span>
        </div>
        <div style={{ alignSelf: "flex-start", maxWidth: "92%", padding: "10px 13px", borderRadius: "4px 14px 14px 14px", background: "#F1F0EC", fontSize: 14.5, lineHeight: 1.45 }}>{m.text}</div>
      </>
    );
  if (m.kind === "store")
    return (
      <>
        <div style={meta}>
          <span style={{ fontWeight: 600, color: "#4A4D55" }}>Store → {who.agent}</span>
          <span className="mono">{clock(m.at)}</span>
        </div>
        <div
          style={{
            border: `1px solid ${m.ok ? "#E4E2DC" : "#F2BBB4"}`,
            background: m.ok ? "#FFFFFF" : "#FEF6F5",
            borderRadius: 10,
            padding: "9px 11px",
            boxShadow: `inset 3px 0 0 ${m.ok ? "transparent" : "#B42318"}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <code className="mono" style={{ fontSize: 13, fontWeight: 600, color: "#15171C" }}>
              {m.call}
            </code>
            <span
              style={{
                marginLeft: "auto",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                height: 22,
                padding: "0 8px 0 6px",
                borderRadius: 999,
                background: m.ok ? "#E4F4EA" : "#FDEAE7",
                color: m.ok ? "#0F6B3E" : "#B42318",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <Icon d={m.ok ? ICON.check : ICON.cross} color={m.ok ? "#0F6B3E" : "#B42318"} size={11} width={2.6} />
              {m.ok ? "OK" : "Refused"}
            </span>
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.4, marginTop: 5, color: m.ok ? "#4A4D55" : "#8E1B12", fontWeight: m.ok ? 400 : 600 }}>{m.text}</div>
        </div>
      </>
    );
  if (m.kind === "note") {
    const s = NOTE_STYLE[m.tone];
    return (
      <div style={{ alignSelf: "center", display: "flex", alignItems: "center", gap: 7, padding: "5px 11px", borderRadius: 999, border: `1px dashed ${s.bd}`, background: s.bg, fontSize: 12.5, fontWeight: 600, color: s.fg }}>
        <Icon d={s.icon} color={s.fg} size={12} />
        {m.text}
      </div>
    );
  }
  return (
    <>
      <div style={meta}>
        <span className="mono">{clock(m.at)}</span>
        <span style={{ fontWeight: 600, color: "#4A4D55" }}>
          {who.agent} → {who.first}
        </span>
      </div>
      <div style={{ alignSelf: "flex-end", maxWidth: "92%", padding: "10px 13px", borderRadius: "14px 4px 14px 14px", background: "#15171C", color: "#FFFFFF", fontSize: 14.5, lineHeight: 1.45 }}>
        {m.text}
        {m.link && (
          <a
            href={m.link}
            target="_blank"
            rel="noreferrer"
            title={`Open ${firstOrTheCustomer(who)}'s approval page`}
            style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 7, padding: "7px 9px", borderRadius: 8, background: "rgba(255,255,255,.1)", fontFamily: "var(--mono)", fontSize: 12.5, color: "#F6E3B4", wordBreak: "break-all" }}
          >
            <Icon d={ICON.link} color="#F6E3B4" size={12} width={1.5} />
            {m.link.replace(/^https?:\/\//, "").replace(/(\/approve\/.{4}).*$/, "$1…")}
          </a>
        )}
      </div>
    </>
  );
}

export function AvaChat({ transcript, live, open, onToggle }: { transcript: Transcript | null; live: boolean; open: boolean; onToggle: () => void }) {
  const messages = transcript ? toMessages(transcript) : [];
  const who = chatPeople(transcript);
  const scroller = useRef<HTMLDivElement>(null);
  const last = transcript?.transcript.at(-1);
  const typing = live && !!transcript?.running && !!last && last.from !== "assistant";

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, typing]);

  if (!open)
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Show ${who.agent}'s conversation`}
        style={{ width: 48, flex: "none", border: "1px solid #E4E2DC", borderRadius: 12, background: "#FFFFFF", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "12px 0" }}
      >
        <span style={{ width: 30, height: 30, borderRadius: 8, background: "#EADFCB", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700 }}>{who.agent[0]}</span>
        <span style={{ writingMode: "vertical-rl", fontSize: 14, fontWeight: 600, color: "#15171C" }}>{who.agent}'s conversation</span>
        {messages.length > 0 && (
          <span style={{ minWidth: 22, height: 22, padding: "0 5px", borderRadius: 11, background: "#15171C", color: "#FFFFFF", font: "600 12px var(--mono)", display: "grid", placeItems: "center" }}>{messages.length}</span>
        )}
      </button>
    );

  return (
    <aside aria-label={`${who.agent}'s conversation`} className="card" style={{ width: 340, flex: "none", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flex: "none", padding: "11px 10px 11px 16px", borderBottom: "1px solid #E4E2DC", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 32, height: 32, flex: "none", borderRadius: 8, background: "#EADFCB", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 700 }}>{who.agent[0]}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{who.agent}'s conversation</span>
            {live && transcript?.running && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, letterSpacing: ".06em", color: "#B42318" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#B42318", animation: "dm-pulse 1.6s infinite" }} />
                LIVE
              </span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: "#6B6E76", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Gemini agent shopping for {who.short} through the store's tools</div>
        </div>
        <button type="button" onClick={onToggle} aria-label="Hide conversation" className="btn-ghost" style={{ width: 34, height: 34, flex: "none", border: 0, borderRadius: 8, background: "transparent", display: "grid", placeItems: "center" }}>
          <Icon d={ICON.chevronRight} color="#4A4D55" width={1.8} />
        </button>
      </div>
      <div ref={scroller} aria-live="polite" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "14px 14px 16px", display: "flex", flexDirection: "column", gap: 12, scrollBehavior: "smooth" }}>
        {messages.length === 0 && (
          <div style={{ margin: "auto 0", textAlign: "center", padding: "0 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, border: "1.5px dashed #C9C6BD", display: "grid", placeItems: "center" }}>
              <Icon d="M2.5 4.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v4.5a2 2 0 0 1-2 2H7l-3 2.5v-2.5h0a2 2 0 0 1-1.5-2z" color="#8E919A" size={22} width={1.4} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{who.agent} hasn't arrived yet</div>
            <div style={{ fontSize: 14, lineHeight: 1.5, color: "#4A4D55" }}>When the drop starts, {who.agent}'s messages and every reply from the store appear here.</div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 5, animation: "dm-fade .35s ease both" }}>
            <MessageView m={m} who={who} />
          </div>
        ))}
        {typing && (
          <div style={{ alignSelf: "flex-end", display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#6B6E76" }}>
            {who.agent} is thinking
            <span style={{ display: "flex", gap: 3, padding: "9px 11px", borderRadius: 12, background: "#15171C" }}>
              {[0, 0.15, 0.3].map((delay) => (
                <span key={delay} style={{ width: 5, height: 5, borderRadius: "50%", background: "#FFFFFF", animation: `dm-dot 1.1s ${delay}s infinite` }} />
              ))}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
