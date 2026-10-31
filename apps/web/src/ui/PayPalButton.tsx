// The PayPal button (JS SDK v6). `order` runs on click and resolves to the PayPal
// order ID, so a cart only creates its order when the shopper decides to pay.
import { useEffect, useRef, useState } from "react";
import { loadPayPal } from "../lib/paypal";
import { Skeleton } from "./bits";

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
      .then(async (sdk) => {
        const methods = await sdk.findEligibleMethods({ currencyCode: "USD" });
        if (cancelled) return;
        if (!methods.isEligible("paypal")) return handlers.current.onMessage("PayPal isn't available in this browser.");
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
    <div style={{ width: "100%", minHeight: 50, display: "grid" }}>
      {!ready && <Skeleton width="100%" height={50} radius={25} />}
      <paypal-button ref={button} type="pay" hidden={!ready} />
    </div>
  );
}
