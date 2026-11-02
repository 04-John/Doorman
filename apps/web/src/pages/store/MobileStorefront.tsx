// Static Supply's store as a phone app: full-bleed drop photo, a buy bar that stays
// in reach of the thumb, products you swipe through, and Shop / Passes tabs.
// State and actions come from Storefront.tsx; this file only lays them out.
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Pass, StoreInfo } from "../../lib/api";
import { money } from "../../lib/format";
import { CustomerTabBar } from "../../mobile/chrome";
import { Skeleton } from "../../ui/bits";
import { DROP_HERO, ProductPhoto } from "../../ui/product";
import { AgentAvatar } from "../../ui/status";

type Product = StoreInfo["products"][number];

export interface MobileStorefrontProps {
  store: StoreInfo | null;
  failed: boolean;
  onRetry: () => void;
  hero: Product | undefined;
  sizes: readonly string[];
  size: string;
  setSize: (s: string) => void;
  cartCount: number;
  openCart: () => void;
  addToCart: (product: Product, size: string | null) => void;
  askAgent: (product: Product) => void;
  asking: boolean;
  linked: Pass | null;
  refusal: string | null;
  owned: boolean;
  description: ReactNode;
  pill: ReactNode;
  gotYours: ReactNode;
}

const AGENT_STEPS = [
  ["Log in with PayPal", " to prove it's you"],
  ["Pick your assistant", " and set a spending cap"],
  ["Approve each purchase", " in PayPal"],
] as const;

export function MobileStorefront(p: MobileStorefrontProps) {
  const { store, hero } = p;
  const soldOut = hero?.stock === 0;

  return (
    <div className="m-app m-white" data-screen-label="M3 Storefront" style={{ paddingBottom: `calc(var(--m-tabbar-h) + var(--m-safe-b) + ${p.gotYours ? 0 : 76}px)` }}>
      <header className="m-topbar" style={{ justifyContent: "space-between" }}>
        <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em", textTransform: "uppercase" }}>Static Supply</span>
        <button type="button" onClick={p.openCart} aria-label={`Cart, ${p.cartCount} items`} className="m-icon-btn m-tap" style={{ position: "relative" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8zM9 8V6.5a3 3 0 0 1 6 0V8" stroke="#15171C" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
          {p.cartCount > 0 && (
            <span key={p.cartCount} className="m-pop" style={{ position: "absolute", top: 4, right: 3, minWidth: 18, height: 18, borderRadius: 9, background: "#15171C", color: "#FFFFFF", font: "700 11px var(--mono)", display: "grid", placeItems: "center" }}>
              {p.cartCount}
            </span>
          )}
        </button>
      </header>

      <div className="m-fade" style={{ margin: "6px 16px 0", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 16, background: "#15171C", color: "#FFFFFF" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "none" }}>
          <path d="M5 21V10a7 7 0 0 1 14 0v11" stroke="#FFFFFF" strokeWidth="2.4" />
          <path d="M2.5 21h19" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 600 }}>Agent-ready · Protected by Doorman</span>
          <span style={{ display: "block", fontSize: 13, color: "#C9CBD1", marginTop: 1 }}>AI assistants with a pass can shop here for you.</span>
        </span>
      </div>

      {p.failed && !store ? (
        <div role="alert" className="m-fade" style={{ margin: "24px 16px", border: "1.5px dashed #D3D0C8", borderRadius: 20, padding: "28px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Couldn't load the store</div>
          <div style={{ fontSize: 15, color: "#4A4D55", marginTop: 6, lineHeight: 1.5 }}>Doorman's server didn't respond. Check it's running, then try again.</div>
          <button type="button" className="m-btn m-btn-secondary m-tap" style={{ margin: "16px auto 0", height: 48 }} onClick={p.onRetry}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <section id="drop" style={{ position: "relative", margin: "14px 16px 0" }}>
            <img src={DROP_HERO.src} alt={DROP_HERO.alt} fetchPriority="high" style={{ display: "block", width: "100%", aspectRatio: "4 / 5", objectFit: "cover", borderRadius: 26, background: "#1B1D22" }} />
            {store && hero && <div style={{ position: "absolute", top: 14, left: 14, display: "flex", filter: "drop-shadow(0 4px 14px rgba(21,23,28,.18))" }}>{p.pill}</div>}
          </section>

          <section className="m-pad" style={{ paddingTop: 22, display: "flex", flexDirection: "column", gap: 14 }}>
            {store && hero ? (
              <>
                <h1 style={{ fontSize: 46, lineHeight: 0.94, fontWeight: 700, letterSpacing: "-0.04em", textTransform: "uppercase", margin: 0 }}>{hero.name}</h1>
                <div className="mono" style={{ fontSize: 26, fontWeight: 600 }}>
                  {money(hero.priceCents)}
                </div>
                {p.description}
              </>
            ) : (
              <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <span className="sr-only">Loading the drop</span>
                <Skeleton width="85%" height={88} radius={10} />
                <Skeleton width={80} height={30} />
                <Skeleton width="100%" height={14} />
              </div>
            )}
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Size</div>
              <div role="group" aria-label="Size" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8 }}>
                {p.sizes.map((s) => {
                  const on = p.size === s;
                  return (
                    <button key={s} type="button" aria-pressed={on} onClick={() => p.setSize(s)} className="m-tap" style={{ height: 52, borderRadius: 14, border: on ? "2px solid #15171C" : "1.5px solid #D3D0C8", background: "#FFFFFF", color: "#15171C", fontSize: 16, fontWeight: on ? 700 : 600 }}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
            {store && hero && (
              <div>
                <div role="img" aria-label={`${hero.stock} of ${store.drop?.stockTotal ?? hero.stock} left`} style={{ height: 6, borderRadius: 3, background: "#EEEDE8", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, (hero.stock / Math.max(1, store.drop?.stockTotal ?? hero.stock)) * 100)}%`, height: "100%", background: "#15171C", transition: "width .4s ease" }} />
                </div>
                <div style={{ fontSize: 13, color: "#6B6E76", marginTop: 7 }}>
                  {hero.stock} of {store.drop?.stockTotal ?? hero.stock} left
                </div>
              </div>
            )}
            {p.gotYours}
            {p.linked && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 16, background: "#F4F3EF", fontSize: 14.5, lineHeight: 1.4, color: "#4A4D55" }}>
                <AgentAvatar name={p.linked.agentName} size={28} />
                <span style={{ flex: 1 }}>
                  <b style={{ color: "#15171C", fontWeight: 600 }}>{p.linked.agentName}</b> can buy for you here: {money(Math.max(0, p.linked.capCents - p.linked.usedCents))} left of your {money(p.linked.capCents)} cap.
                </span>
                <Link to="/passes" className="m-hit" style={{ color: "#15171C", fontWeight: 600, padding: "10px 2px" }}>
                  Manage
                </Link>
              </div>
            )}
            {p.refusal && !p.owned && (
              <div role="alert" className="m-fade" style={{ padding: "12px 14px", borderRadius: 14, background: "#FDEAE7", border: "1px solid #F2BBB4", color: "#8E1B12", fontSize: 14.5, lineHeight: 1.45 }}>
                <b>Doorman stopped {p.linked?.agentName ?? "your assistant"}:</b> {p.refusal}
              </div>
            )}
          </section>

          <section id="shop" style={{ paddingTop: 34 }}>
            <h2 className="m-pad" style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", textTransform: "uppercase", margin: 0 }}>
              Shop
            </h2>
            <ul className="m-hscroll" style={{ listStyle: "none", margin: 0, gap: 12, padding: "14px 20px 4px" }}>
              {(store?.products ?? [null, null, null]).map((prod, i) => (
                <li key={prod?.id ?? i} style={{ width: 200, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ aspectRatio: "1", borderRadius: 18, position: "relative", overflow: "hidden", background: "#ECEAE4" }}>
                    {prod && <ProductPhoto productId={prod.id} style={{ width: "100%", height: "100%" }} />}
                    {prod?.limitedDrop && (
                      <span style={{ position: "absolute", top: 10, left: 10, height: 24, padding: "0 9px", borderRadius: 999, background: "#15171C", color: "#FFFFFF", fontSize: 11.5, fontWeight: 700, display: "flex", alignItems: "center" }}>DROP</span>
                    )}
                  </div>
                  {prod ? (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 15.5, fontWeight: 600 }}>
                        <span>{prod.name}</span>
                        <span className="mono">{money(prod.priceCents)}</span>
                      </div>
                      <button
                        type="button"
                        className="m-tap"
                        disabled={prod.stock === 0 || (prod.limitedDrop && p.owned)}
                        onClick={() => p.addToCart(prod, prod.limitedDrop ? p.size : null)}
                        aria-label={`Add ${prod.name} to cart`}
                        style={{ height: 44, borderRadius: 12, border: "1.5px solid #C9C6BD", background: "#FFFFFF", color: "#15171C", fontSize: 14.5, fontWeight: 600, opacity: prod.stock === 0 || (prod.limitedDrop && p.owned) ? 0.5 : 1 }}
                      >
                        {prod.limitedDrop && p.owned ? "You've got yours" : prod.stock === 0 ? "Sold out" : "Add to cart"}
                      </button>
                    </>
                  ) : (
                    <Skeleton width="70%" height={16} />
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section id="agents" style={{ margin: "34px 16px 0", padding: "22px 18px 18px", borderRadius: 24, background: "#F4F3EF", border: "1px solid #E4E2DC", display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 27, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.08, margin: 0 }}>Shop with your AI assistant</h2>
        <p style={{ fontSize: 15.5, lineHeight: 1.5, color: "#4A4D55", margin: 0 }}>Doorman lets your assistant in and keeps scalper bots out, so drops go to real people.</p>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {AGENT_STEPS.map(([lead, rest], i) => (
            <li key={lead} style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 16px", background: "#FFFFFF", border: "1px solid #E4E2DC", borderRadius: 16 }}>
              <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: "#6B6E76" }}>
                0{i + 1}
              </span>
              <span style={{ fontSize: 15.5 }}>
                <b>{lead}</b>
                {rest}
              </span>
            </li>
          ))}
        </ol>
        <Link to="/link" className="m-btn m-tap" style={{ marginTop: 4, color: "#FFFFFF" }}>
          Link your agent
        </Link>
      </section>

      <footer className="m-pad" style={{ padding: "26px 20px 24px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, fontSize: 13, color: "#6B6E76" }}>
        <span>© Static Supply · sandbox demo store</span>
        <Link to="/" className="m-hit" style={{ color: "#4A4D55", fontWeight: 500 }}>
          Back to demo hub
        </Link>
      </footer>

      {!p.gotYours && hero && (
        <div className="m-actionbar">
          <button type="button" className="m-btn m-tap" style={{ flex: 1 }} disabled={soldOut} onClick={() => p.addToCart(hero, p.size)}>
            {soldOut ? "Sold out" : `Add to cart · ${p.size}`}
          </button>
          {p.linked ? (
            <button type="button" className="m-btn m-btn-secondary m-tap" disabled={p.asking || soldOut} onClick={() => p.askAgent(hero)} style={{ maxWidth: "48%" }}>
              <AgentAvatar name={p.linked.agentName} size={22} />
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.asking ? "Checking out…" : `Ask ${p.linked.agentName}`}</span>
            </button>
          ) : (
            <Link to="/link" className="m-btn m-btn-secondary m-tap" style={{ fontSize: 15, color: "#15171C" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 21V10a7 7 0 0 1 14 0v11" stroke="#15171C" strokeWidth="2.2" />
                <path d="M2.5 21h19" stroke="#15171C" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
              Buy with AI
            </Link>
          )}
        </div>
      )}
      <CustomerTabBar />
    </div>
  );
}
