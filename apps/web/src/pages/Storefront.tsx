// Screen 6: the Static Supply storefront. Shows the drop with live stock and invites
// customers to link their AI assistant. People can't check out here in this demo.
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, type StoreInfo } from "../lib/api";
import { money } from "../lib/format";
import { Skeleton } from "../ui/bits";
import { useToast } from "../ui/toast";
import "./store/store.css";

type Product = StoreInfo["products"][number];

const SIZES = ["S", "M", "L", "XL"] as const;
const NUMBER_WORDS = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const AGENT_STEPS = [
  ["Log in with PayPal", " to prove it's you"],
  ["Pick your assistant", " and set a spending cap"],
  ["Approve each purchase", " in PayPal"],
] as const;

// Striped stand-in for product photography.
const stripes = (step: number) => `repeating-linear-gradient(135deg,#ECEAE4 0 ${step}px,#F4F3EF ${step}px ${step * 2}px)`;

export default function Storefront() {
  const toast = useToast();
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [size, setSize] = useState<(typeof SIZES)[number]>("M");

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
        <button
          type="button"
          onClick={() => toast("This demo store sells through AI agents. Link your assistant below.")}
          style={{ marginLeft: "auto", border: 0, background: "transparent", fontSize: 15, fontWeight: 500, color: "#15171C", padding: "6px 0" }}
        >
          Cart (0)
        </button>
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
            <div
              style={{
                aspectRatio: "4 / 5",
                borderRadius: 20,
                background: stripes(10),
                display: "grid",
                placeItems: "center",
                fontFamily: "var(--mono)",
                fontSize: 12,
                fontWeight: 500,
                color: "#6B6E76",
              }}
            >
              hero photo · {hero?.name ?? "Night Shift Hoodie"}
            </div>

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

              <div className="sf-actions">
                <button type="button" className="sf-btn sf-btn-primary" onClick={() => toast("This demo store sells through AI agents. Link your assistant below.")}>
                  Add to cart
                </button>
                <Link to="/link" className="sf-btn sf-btn-secondary">
                  Let my AI assistant buy it
                </Link>
              </div>
            </div>
          </section>

          <section id="shop" className="sf-wrap sf-gutter" style={{ paddingBottom: 64 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "0 0 20px" }}>Shop</h2>
            <ul className="sf-products" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {store ? store.products.map((p) => <ProductCard key={p.id} product={p} />) : [0, 1, 2].map((i) => <ProductCard key={i} product={null} />)}
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

function ProductCard({ product }: { product: Product | null }) {
  return (
    <li style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div aria-hidden="true" style={{ aspectRatio: "1", borderRadius: 16, background: stripes(8), position: "relative" }}>
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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 16.5, fontWeight: 600 }}>
          <span>
            {product.name}
            {product.limitedDrop && <span className="sr-only"> (limited drop)</span>}
          </span>
          <span className="mono">{money(product.priceCents)}</span>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", height: 22, alignItems: "center" }}>
          <Skeleton width="55%" height={16} />
          <Skeleton width={40} height={16} />
        </div>
      )}
    </li>
  );
}
