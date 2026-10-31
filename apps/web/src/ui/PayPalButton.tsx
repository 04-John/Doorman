// The PayPal button (JS SDK v6). `order` runs on click and resolves to the PayPal
// order ID, so a cart only creates its order when the shopper decides to pay.
import { useEffect, useRef, useState } from "react";
import { loadPayPal } from "../lib/paypal";
import { Spinner } from "./bits";

// Full width and pill-shaped, as in the design. Width and corner radius are the
// two things PayPal's button lets a page style.
const buttonStyle = { width: "100%", height: 48, "--paypal-button-border-radius": "24px" } as React.CSSProperties;

export function PayPalButton({
  order,
  onApproved,
  onMessage,
}: {
  order: () => Promise<string>;
  onApproved: (orderId: string) => void;
  onMessage: (message: string) => void;
}) {
  const button = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);
  // The SDK session is set up once; it always calls the latest handlers.
  const handlers = useRef({ order, onApproved, onMessage });
  handlers.current = { order, onApproved, onMessage };

  useEffect(() => {
    let cancelled = false;
    let detach = () => {};
    loadPayPal()
      .then((sdk) => {
        if (cancelled) return;
        const session = sdk.createPayPalOneTimePaymentSession({
          onApprove: async ({ orderId }) => handlers.current.onApproved(orderId),
          onCancel: () => handlers.current.onMessage("You closed PayPal. Nothing was charged."),
          onError: () => handlers.current.onMessage("PayPal had a problem. Try again."),
        });
        const orderId = () =>
          handlers.current.order().then(
            (id) => ({ orderId: id }),
            (err: unknown) => {
              handlers.current.onMessage(err instanceof Error ? err.message : "Couldn't start the payment.");
              throw err;
            },
          );
        const el = button.current;
        const start = () => void session.start({ presentationMode: "auto" }, orderId()).catch(() => {});
        el?.addEventListener("click", start);
        detach = () => el?.removeEventListener("click", start);
        setReady(true);
      })
      .catch((err: unknown) => handlers.current.onMessage(err instanceof Error ? err.message : "Couldn't load PayPal."));
    return () => {
      cancelled = true;
      detach();
    };
  }, []);

  return (
    <div style={{ width: "100%", minHeight: 48, display: "grid" }}>
      {!ready && (
        <div
          aria-live="polite"
          style={{ height: 48, borderRadius: 24, background: "#FDF5E2", border: "1px solid #F2DDA4", display: "flex", alignItems: "center", justifyContent: "center", gap: 9, fontSize: 14, fontWeight: 500, color: "#6B4600" }}
        >
          <Spinner size={14} />
          Loading PayPal…
        </div>
      )}
      <paypal-button ref={button} type="pay" hidden={!ready} style={buttonStyle} />
    </div>
  );
}
