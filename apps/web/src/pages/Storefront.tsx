// Screen 6: the Static Supply storefront. Shows the drop with live stock. People can
// buy in the browser with PayPal, or have their linked AI assistant buy for them.
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, type Pass, type StoreInfo } from "../lib/api";
import { money } from "../lib/format";
import { preloadPayPal } from "../lib/paypal";
import { Skeleton } from "../ui/bits";
import { DROP_HERO, ProductPhoto } from "../ui/product";
import { AgentAvatar, ICON, Icon } from "../ui/status";
import { useToast } from "../ui/toast";
import { CartDrawer, useCart } from "./store/Cart";
import "./store/store.css";

type Product = StoreInfo["products"][number];

const SIZES = ["S", "M", "L", "XL"] as const;
const NUMBER_WORDS = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const AGENT_STEPS = [
  ["Log in with PayPal", " to prove it's you"],
  ["Pick your assistant", " and set a spending cap"],
  ["Approve each purchase", " in PayPal"],
] as const;


// The customer's most recent live pass, if they've linked an assistant.
function useLinkedAgent() {
  const [pass, setPass] = useState<Pass | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((customer) => (customer ? api.passes() : []))
      .then(
        (passes) => {
          const live = passes.filter((p) => !p.revokedAt && new Date(p.expiresAt) > new Date());
          if (!cancelled) setPass(live[0] ?? null);
        },
        () => {},
      );
    return () => {
      cancelled = true;
    };
  }, []);
  return pass;
}

export default function Storefront() {
  const toast = useToast();
  const navigate = useNavigate();
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [size, setSize] = useState<(typeof SIZES)[number]>("M");
  const [cart, setCart] = useCart();
  const [cartOpen, setCartOpen] = useState(false);
  const linked = useLinkedAgent();
  const [asking, setAsking] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  // Warm PayPal up now: the cart and Ava's approval page (same tab) both need it.
  useEffect(preloadPayPal, []);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    api.store().then(
      (s) => {
        if (!cancelled) setStore(s);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Keep the stock count moving while a drop is live.
  const live = store?.drop?.status === "live";
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const timer = setInterval(() => {
      api.store().then(
        (s) => {
          if (!cancelled) setStore(s);
        },
        () => {},
      );
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [live]);

  const hero = store ? (store.products.find((p) => p.limitedDrop) ?? store.products[0]) : undefined;
  const dropLimit = live ? (store?.perCustomerLimit ?? null) : null;
  // The signed-in customer already has their share of the live drop.
  const gotYours = store?.yours && dropLimit != null && store.yours.units >= dropLimit ? store.yours : null;
  const cartCount = cart.reduce((n, i) => n + i.quantity, 0);

  function addToCart(product: Product, chosenSize: string | null) {
    if (product.limitedDrop && gotYours) return toast(`You already have your ${product.name} from this drop.`);
    const dropUnits = cart.filter((i) => i.limitedDrop).reduce((n, i) => n + i.quantity, 0);
    if (product.limitedDrop && dropLimit != null && dropUnits >= dropLimit) {
      toast(`The drop is limited to ${dropLimit} per customer. It's already in your cart.`);
      setCartOpen(true);
      return;
    }
    setCart((items) => {
      const same = items.findIndex((i) => i.productId === product.id && i.size === chosenSize);
      if (same >= 0) return items.map((i, n) => (n === same ? { ...i, quantity: i.quantity + 1 } : i));
      return [...items, { productId: product.id, size: chosenSize, quantity: 1, name: product.name, priceCents: product.priceCents, limitedDrop: product.limitedDrop }];
    });
    setCartOpen(true);
  }

  // The linked assistant checks out through Doorman; the customer lands on the approval page.
  async function askAgent(product: Product) {
    setAsking(true);
    setRefusal(null);
    try {
      const result = await api.agentCheckout(product.id, size);
      if (result.ok) return navigate(result.approvalPath);
      setRefusal(result.message);
      setAsking(false);
      refresh(); // a refusal can mean the customer already has theirs
    } catch (err) {
      setRefusal(err instanceof Error ? err.message : "Your assistant couldn't check out.");
      setAsking(false);
    }
  }

  const refresh = useCallback(() => {
    api.store().then(setStore, () => {});
  }, []);
  const closeCart = useCallback(() => setCartOpen(false), []);

  return (
    <div className="sf-page">
      <div className="sf-banner">
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 21V10a7 7 0 0 1 14 0v11" stroke="#FFFFFF" strokeWidth="2.4" />
            <path d="M2.5 21h19" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <b style={{ fontWeight: 600 }}>Agent-ready · Protected by Doorman</b>
        </span>
        <span style={{ color: "#C9CBD1" }}>AI assistants with a pass can shop here for you.</span>
      </div>

      <header className="sf-header sf-gutter">
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", textTransform: "uppercase" }}>Static Supply</span>
        <nav className="sf-nav" aria-label="Store">
          {[
            ["drop", "Drop"],
            ["shop", "Shop"],
            ["agents", "Shop with AI"],
          ].map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={(e) => {
                // Scroll smoothly to the section, even when it's already partly on screen.
                const target = document.getElementById(id!);
                if (!target) return;
                e.preventDefault();
                target.scrollIntoView({ behavior: "smooth", block: "start" });
                history.replaceState(null, "", `#${id}`);
              }}
            >
              {label}
            </a>
          ))}
        </nav>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 20 }}>
          <Link to="/passes" style={{ fontSize: 15, fontWeight: 500, color: "#4A4D55" }}>
            Agent passes
          </Link>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            style={{ border: 0, background: "transparent", fontSize: 15, fontWeight: 600, color: "#15171C", padding: "6px 0" }}
          >
            Cart ({cartCount})
          </button>
        </span>
      </header>

      {failed && !store ? (
        <section className="sf-wrap sf-gutter" style={{ paddingTop: 56, paddingBottom: 56 }}>
          <div role="alert" style={{ border: "1.5px dashed #D3D0C8", borderRadius: 16, padding: "28px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Couldn't load the store</div>
            <div style={{ fontSize: 15, color: "#4A4D55", marginTop: 6 }}>Doorman's server didn't respond. Check it's running, then try again.</div>
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 16 }} onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
        </section>
      ) : (
        <>
          <section id="drop" className="sf-wrap sf-gutter sf-hero">
            <img
              src={DROP_HERO.src}
              alt={DROP_HERO.alt}
              fetchPriority="high"
              style={{ display: "block", width: "100%", aspectRatio: "4 / 5", objectFit: "cover", borderRadius: 20, background: "#1B1D22" }}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
              {store && hero ? (
                <>
                  <DropPill store={store} product={hero} />
                  <h1 className="sf-title">{hero.name}</h1>
                  <div className="mono" style={{ fontSize: 26, fontWeight: 600 }}>
                    {money(hero.priceCents)}
                  </div>
                  {hero.limitedDrop && (
                    <p style={{ fontSize: 16.5, lineHeight: 1.55, color: "#4A4D55", maxWidth: 460, margin: 0 }}>
                      Heavyweight 450 gsm fleece, reflective back print. {store.drop?.stockTotal ?? hero.stock} made.{" "}
                      {NUMBER_WORDS[store.perCustomerLimit - 1] ?? store.perCustomerLimit} per customer.
                    </p>
                  )}
                </>
              ) : (
                <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <span className="sr-only">Loading the drop</span>
                  <Skeleton width={160} height={30} radius={999} />
                  <Skeleton width="85%" height={64} radius={10} />
                  <Skeleton width={80} height={30} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 9, maxWidth: 460 }}>
                    <Skeleton width="100%" height={14} />
                    <Skeleton width="70%" height={14} />
                  </div>
                </div>
              )}

              <div role="group" aria-label="Size" style={{ display: "flex", gap: 8 }}>
                {SIZES.map((s) => (
                  <button key={s} type="button" className="sf-size" aria-pressed={size === s} onClick={() => setSize(s)}>
                    {s}
                  </button>
                ))}
              </div>

              {store && hero ? (
                <StockBar left={hero.stock} total={store.drop?.stockTotal ?? hero.stock} />
              ) : (
                <Skeleton width="100%" height={6} radius={3} style={{ maxWidth: 460 }} />
              )}

              {gotYours && hero ? (
                <GotYours name={hero.name} limit={dropLimit!} approvalPath={gotYours.approvalPath} />
              ) : (
                <div className="sf-actions">
                  <button type="button" className="sf-btn sf-btn-primary" disabled={!hero || hero.stock === 0} onClick={() => hero && addToCart(hero, size)}>
                    {hero?.stock === 0 ? "Sold out" : "Add to cart"}
                  </button>
                  {linked ? (
                    <button type="button" className="sf-btn sf-btn-secondary" disabled={!hero || asking} onClick={() => hero && void askAgent(hero)}>
                      {asking ? `${linked.agentName} is checking out…` : `Ask ${linked.agentName} to buy it`}
                    </button>
                  ) : (
                    <Link to="/link" className="sf-btn sf-btn-secondary">
                      Let my AI assistant buy it
                    </Link>
                  )}
                </div>
              )}
              {linked && (
                <div className="sf-linked">
                  <AgentAvatar name={linked.agentName} size={22} />
                  <span>
                    <b style={{ color: "#15171C", fontWeight: 600 }}>{linked.agentName}</b> can buy for you here, up to {money(linked.capCents)} per purchase.
                  </span>
                  <Link to="/passes" style={{ color: "#4A4D55", textDecoration: "underline", textUnderlineOffset: 3 }}>
                    Manage
                  </Link>
                </div>
              )}
              {refusal && !gotYours && (
                <div role="alert" style={{ padding: "12px 14px", borderRadius: 12, background: "#FDEAE7", border: "1px solid #F2BBB4", color: "#8E1B12", fontSize: 14.5, lineHeight: 1.45, maxWidth: 460 }}>
                  <b>Doorman stopped {linked?.agentName ?? "your assistant"}:</b> {refusal}
                </div>
              )}
            </div>
          </section>

          <section id="shop" className="sf-wrap sf-gutter" style={{ paddingBottom: 64 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "0 0 20px" }}>Shop</h2>
            <ul className="sf-products" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {store
                ? store.products.map((p) => (
                    <ProductCard key={p.id} product={p} owned={p.limitedDrop && gotYours != null} onAdd={() => addToCart(p, p.limitedDrop ? size : null)} />
                  ))
                : [0, 1, 2].map((i) => <ProductCard key={i} product={null} />)}
            </ul>
          </section>
        </>
      )}

      <section id="agents" style={{ background: "#F4F3EF", borderTop: "1px solid #E4E2DC" }}>
        <div className="sf-wrap sf-gutter sf-agents">
          <div>
            <h2 style={{ fontSize: "clamp(28px, 3.4vw, 40px)", fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.08, margin: 0 }}>Shop with your AI assistant</h2>
            <p style={{ fontSize: 16.5, lineHeight: 1.55, color: "#4A4D55", margin: "12px 0 0", maxWidth: 440 }}>
              Doorman lets your assistant in and keeps scalper bots out, so drops go to real people.
            </p>
            <Link to="/link" className="sf-btn sf-btn-primary" style={{ height: 52, padding: "0 22px", marginTop: 22 }}>
              Link your agent
            </Link>
          </div>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {AGENT_STEPS.map(([lead, rest], i) => (
              <li
                key={lead}
                style={{ display: "flex", gap: 16, alignItems: "center", padding: "16px 18px", background: "#FFFFFF", border: "1px solid #E4E2DC", borderRadius: 14 }}
              >
                <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: "#6B6E76" }}>
                  0{i + 1}
                </span>
                <span style={{ fontSize: 16 }}>
                  <b>{lead}</b>
                  {rest}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="sf-footer sf-gutter">
        <span>© Static Supply · sandbox demo store</span>
        <Link to="/">Back to demo hub</Link>
      </footer>

      {cartOpen && <CartDrawer items={cart} setItems={setCart} dropLimit={dropLimit} onClose={closeCart} onPaid={refresh} />}
    </div>
  );
}

function DropPill({ store, product }: { store: StoreInfo; product: Product }) {
  const left = product.stock;
  const live = store.drop?.status === "live" && left > 0;
  const text = live ? `Drop live · ${left} left` : left === 0 ? "Sold out" : store.drop?.status === "ended" ? "Drop ended" : "Drop opens soon";
  return (
    <span
      style={{
        alignSelf: "flex-start",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: 30,
        padding: "0 12px",
        borderRadius: 999,
        background: live ? "#FDEAE7" : "#F1F0EC",
        color: live ? "#B42318" : "#4A4D55",
        fontSize: 14,
        fontWeight: 700,
      }}
    >
      <span className={live ? "sf-live-dot" : undefined} style={{ width: 8, height: 8, borderRadius: "50%", background: live ? "#B42318" : "#8E919A" }} />
      {text}
    </span>
  );
}

function StockBar({ left, total }: { left: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (left / total) * 100) : 0;
  return (
    <div role="img" aria-label={`${left} of ${total} left`} style={{ height: 6, borderRadius: 3, background: "#EEEDE8", overflow: "hidden", maxWidth: 460 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: "#15171C", transition: "width .4s ease" }} />
    </div>
  );
}

// Shown instead of the buy buttons once the customer has their share of the drop.
function GotYours({ name, limit, approvalPath }: { name: string; limit: number; approvalPath: string | null }) {
  const waiting = approvalPath != null;
  return (
    <div
      role="status"
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        padding: "14px 16px",
        borderRadius: 14,
        maxWidth: 460,
        background: waiting ? "#FDF1DC" : "#E4F4EA",
        border: `1px solid ${waiting ? "#EBC98C" : "#B2DCC2"}`,
        color: waiting ? "#5C3A00" : "#0B4F2E",
      }}
    >
      <span style={{ width: 24, height: 24, flex: "none", marginTop: 1, borderRadius: "50%", background: waiting ? "#8A5300" : "#0F6B3E", display: "grid", placeItems: "center" }}>
        <Icon d={waiting ? "M8 4.5V8l2.2 1.6" : ICON.check} color="#FFFFFF" size={14} width={2} />
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 15, lineHeight: 1.45 }}>
        <b style={{ fontSize: 16.5, fontWeight: 600, color: "#15171C" }}>{waiting ? "Waiting for your approval" : "You've got yours"}</b>
        <span>
          {waiting ? `Your assistant has a ${name} ready for you. Nothing is charged until you approve it in PayPal.` : `Your ${name} from this drop is on its way.`} It's
          limited to {limit} per customer.
        </span>
        {waiting && (
          <Link to={approvalPath} className="sf-btn sf-btn-primary" style={{ height: 44, padding: "0 18px", marginTop: 8, alignSelf: "flex-start", fontSize: 15 }}>
            Review and approve
          </Link>
        )}
      </div>
    </div>
  );
}

function ProductCard({ product, owned = false, onAdd }: { product: Product | null; owned?: boolean; onAdd?: () => void }) {
  return (
    <li style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="sf-photo" style={{ aspectRatio: "1", borderRadius: 16, position: "relative", overflow: "hidden", background: "#ECEAE4" }}>
        {product && <ProductPhoto productId={product.id} style={{ width: "100%", height: "100%" }} />}
        {product?.limitedDrop && (
          <span
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              height: 24,
              padding: "0 9px",
              borderRadius: 999,
              background: "#15171C",
              color: "#FFFFFF",
              fontSize: 12,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
            }}
          >
            DROP
          </span>
        )}
      </div>
      {product ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 16.5, fontWeight: 600 }}>
            <span>
              {product.name}
              {product.limitedDrop && <span className="sr-only"> (limited drop)</span>}
            </span>
            <span className="mono">{money(product.priceCents)}</span>
          </div>
          <button type="button" className="sf-add" disabled={product.stock === 0 || owned} onClick={onAdd} aria-label={owned ? undefined : `Add ${product.name} to cart`}>
            {owned ? "You've got yours" : product.stock === 0 ? "Sold out" : "Add to cart"}
          </button>
        </>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", height: 22, alignItems: "center" }}>
          <Skeleton width="55%" height={16} />
          <Skeleton width={40} height={16} />
        </div>
      )}
    </li>
  );
}
