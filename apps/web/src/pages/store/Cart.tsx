// The storefront cart: a drawer with the lines, the total and the PayPal button.
// One PayPal order covers the cart. It's held first, then charged once the drop's
// per-customer limit checks out against the PayPal account that paid.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type CartLine, type WebOrder } from "../../lib/api";
import { money } from "../../lib/format";
import { KeyValues } from "../../ui/mobile";
import { PayPalButton } from "../../ui/PayPalButton";
import { ICON, Icon } from "../../ui/status";

export interface CartItem extends CartLine {
  name: string;
  priceCents: number;
  limitedDrop: boolean;
}

const KEY = "sf-cart";

// The cart survives a page reload; it's only a convenience, so storage errors are ignored.
export function useCart() {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? "[]") as CartItem[];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      // Storage can be blocked; the cart still works for this visit.
    }
  }, [items]);
  return [items, setItems] as const;
}

const stripes = "repeating-linear-gradient(135deg,#ECEAE4 0 6px,#F4F3EF 6px 12px)";

function Result({ order, onClose }: { order: WebOrder; onClose: () => void }) {
  const charged = order.status === "charged";
  return (
    <div className="sf-cart-body" style={{ gap: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10, paddingTop: 12 }}>
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            background: charged ? "#0F6B3E" : "#FDF1DC",
            border: charged ? "none" : "1.5px solid #EBC98C",
          }}
        >
          {charged ? <Icon d={ICON.check} color="#FFFFFF" size={30} width={1.8} /> : <Icon d="M8 4.5v4.2M8 11.3v.2" color="#8A5300" size={28} width={1.9} />}
        </div>
        <h3 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>{charged ? "Order confirmed" : "We released the hold"}</h3>
        <div style={{ fontSize: 15, lineHeight: 1.5, color: "#4A4D55" }}>
          {charged ? `Paid with PayPal${order.paidBy ? ` · ${order.paidBy}` : ""}` : `${order.releaseReason ?? "The order couldn't go through"}. No money was taken.`}
        </div>
      </div>
      <KeyValues
        rows={[
          ...order.items.map((i): [string, React.ReactNode] => [
            `${i.name}${i.size ? ` · ${i.size}` : ""}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`,
            <span className="mono">{money(i.amountCents, { decimals: true })}</span>,
          ]),
          [charged ? "Charged" : "Taken", <b className="mono" style={{ fontWeight: 600 }}>{charged ? money(order.amountCents, { decimals: true }) : "$0.00"}</b>],
          ["PayPal order", <span className="mono" style={{ fontSize: 13 }}>{order.paypalOrderId}</span>],
        ]}
      />
      <button type="button" className="sf-btn sf-btn-primary" style={{ marginTop: "auto" }} onClick={onClose}>
        Continue shopping
      </button>
    </div>
  );
}

export function CartDrawer({
  items,
  setItems,
  dropLimit,
  onClose,
  onPaid,
}: {
  items: CartItem[];
  setItems: (update: (items: CartItem[]) => CartItem[]) => void;
  dropLimit: number | null;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<WebOrder | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const totalCents = items.reduce((n, i) => n + i.priceCents * i.quantity, 0);
  const dropUnits = items.filter((i) => i.limitedDrop).reduce((n, i) => n + i.quantity, 0);

  const order = useCallback(
    () => api.webCheckout(items.map(({ productId, size, quantity }) => ({ productId, size, quantity }))).then((r) => r.paypalOrderId),
    [items],
  );

  const onApproved = useCallback(
    async (paypalOrderId: string) => {
      setConfirming(true);
      setMessage(null);
      try {
        const done = await api.completeWebCheckout(paypalOrderId);
        setResult(done);
        if (done.status === "charged") setItems(() => []);
        onPaid();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Something went wrong. Nothing was charged.");
      } finally {
        setConfirming(false);
      }
    },
    [setItems, onPaid],
  );

  const change = (index: number, quantity: number) =>
    setItems((list) => (quantity <= 0 ? list.filter((_, i) => i !== index) : list.map((item, i) => (i === index ? { ...item, quantity } : item))));

  return (
    <div className="sf-cart" role="dialog" aria-modal="true" aria-labelledby="cart-title">
      <div className="sf-cart-scrim" onClick={onClose} />
      <aside className="sf-cart-panel">
        <header className="sf-cart-head">
          <h2 id="cart-title" style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", textTransform: "uppercase", margin: 0 }}>
            Your cart
          </h2>
          <button ref={close} type="button" aria-label="Close cart" onClick={onClose} className="sf-cart-close">
            <Icon d={ICON.close} color="#15171C" size={16} />
          </button>
        </header>

        {result ? (
          <Result order={result} onClose={onClose} />
        ) : confirming ? (
          <div className="sf-cart-body" style={{ alignItems: "center", justifyContent: "center", textAlign: "center", gap: 14 }} aria-live="polite">
            <span className="spinner" style={{ width: 56, height: 56, borderWidth: 4, borderColor: "#EEEDE8", borderTopColor: "#15171C", animationDuration: "1s" }} />
            <div style={{ fontSize: 20, fontWeight: 600 }}>Payment held</div>
            <div style={{ fontSize: 15, color: "#4A4D55" }}>Confirming your order…</div>
          </div>
        ) : items.length === 0 ? (
          <div className="sf-cart-body" style={{ alignItems: "center", justifyContent: "center", textAlign: "center", gap: 8 }}>
            <div style={{ fontSize: 17, fontWeight: 600 }}>Your cart is empty</div>
            <div style={{ fontSize: 15, color: "#4A4D55" }}>Add something from the shop, or let your AI assistant buy it for you.</div>
            <button type="button" className="sf-btn sf-btn-secondary" style={{ marginTop: 14 }} onClick={onClose}>
              Continue shopping
            </button>
          </div>
        ) : (
          <div className="sf-cart-body">
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
              {items.map((item, i) => {
                const atLimit = item.limitedDrop && dropLimit != null && dropUnits >= dropLimit;
                return (
                  <li key={`${item.productId}-${item.size}`} style={{ display: "flex", gap: 14, padding: "14px 0", borderTop: i ? "1px solid #EEEDE8" : "none" }}>
                    <div aria-hidden="true" style={{ width: 64, height: 64, flex: "none", borderRadius: 10, background: stripes }} />
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 15.5, fontWeight: 600 }}>{item.name}</div>
                          {item.size && <div style={{ fontSize: 13.5, color: "#4A4D55", marginTop: 2 }}>Size {item.size}</div>}
                        </div>
                        <span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>
                          {money(item.priceCents * item.quantity)}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div className="sf-qty" role="group" aria-label={`Quantity of ${item.name}`}>
                          <button type="button" aria-label="One fewer" onClick={() => change(i, item.quantity - 1)}>
                            −
                          </button>
                          <span className="mono" aria-live="polite">
                            {item.quantity}
                          </span>
                          <button type="button" aria-label="One more" disabled={atLimit || item.quantity >= 10} onClick={() => change(i, item.quantity + 1)}>
                            +
                          </button>
                        </div>
                        <button type="button" className="sf-cart-remove" onClick={() => change(i, 0)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 12, paddingTop: 16, borderTop: "1px solid #E4E2DC" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>Total</span>
                <span className="mono" style={{ fontSize: 22, fontWeight: 600 }}>
                  {money(totalCents, { decimals: true })}
                </span>
              </div>
              {dropUnits > 0 && dropLimit != null && (
                <div style={{ fontSize: 13.5, lineHeight: 1.45, color: "#4A4D55" }}>
                  The drop is limited to {dropLimit} per customer, checked against the PayPal account that pays.
                </div>
              )}
              <PayPalButton order={order} onApproved={(id) => void onApproved(id)} onMessage={setMessage} />
              {message && (
                <div role="alert" style={{ fontSize: 14, color: "#8E1B12" }}>
                  {message}
                </div>
              )}
              <div style={{ fontSize: 12.5, color: "#6B6E76", textAlign: "center" }}>Sandbox: pay with a PayPal sandbox buyer account. No real money.</div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
