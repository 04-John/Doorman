// App chrome: logo, sandbox tag, merchant top bar.
import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router";
import { api, type MerchantInfo } from "../lib/api";
import { shortId } from "../lib/format";
import { ICON, Icon } from "./status";

const REPO_URL = "https://github.com/04-John/Doorman";

export function LogoMark({ size = 24, color = "#FFFFFF" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 21V10a7 7 0 0 1 14 0v11" stroke={color} strokeWidth="2" />
      <path d="M2.5 21h19" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="15.2" cy="14.6" r="1.4" fill={color} />
    </svg>
  );
}

export function Logo({ dark = false }: { dark?: boolean }) {
  const color = dark ? "#FFFFFF" : "#15171C";
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 10, color }}>
      <LogoMark color={color} />
      <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.01em" }}>Doorman</span>
    </span>
  );
}

export function SandboxTag({ dark = false }: { dark?: boolean }) {
  return dark ? (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        height: 24,
        padding: "0 10px",
        border: "1px solid rgba(242,198,109,.55)",
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 500,
        color: "#F6E3B4",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#F2C66D" }} />
      Sandbox demo, no real money
    </span>
  ) : (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        height: 26,
        padding: "0 11px",
        border: "1px solid #D9B35C",
        background: "#FDF5E2",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 500,
        color: "#6B4600",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#C98A1B" }} />
      Sandbox demo, no real money
    </span>
  );
}

const navStyle = ({ isActive }: { isActive: boolean }) => ({
  color: isActive ? "#FFFFFF" : "#C9CBD1",
  padding: "7px 12px",
  borderRadius: 7,
  background: isActive ? "rgba(255,255,255,.12)" : "transparent",
});

export function MerchantTopBar() {
  return (
    <header style={{ height: 56, flex: "none", background: "#15171C", color: "#FFFFFF", display: "flex", alignItems: "center", gap: 18, padding: "0 24px" }}>
      <NavLink to="/" aria-label="Doorman home" style={{ display: "flex" }}>
        <Logo dark />
      </NavLink>
      <div className="dm-hide-narrow" style={{ width: 1, height: 22, background: "rgba(255,255,255,.2)" }} />
      <div className="dm-hide-narrow" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 500, whiteSpace: "nowrap" }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: "#2B2E35", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>SS</div>
        Static Supply
      </div>
      <span className="dm-hide-narrow">
        <SandboxTag dark />
      </span>
      <nav style={{ marginLeft: "auto", display: "flex", gap: 4, fontSize: 14, fontWeight: 500 }}>
        <NavLink to="/dashboard" style={navStyle}>
          Dashboard
        </NavLink>
        <NavLink to="/rules" style={navStyle}>
          Rules
        </NavLink>
        <NavLink to="/setup" style={navStyle}>
          Settings
        </NavLink>
        <NavLink to="/store" style={navStyle}>
          View store
        </NavLink>
      </nav>
      <ProfileMenu />
    </header>
  );
}

const menuItem = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 12px", borderRadius: 8, fontSize: 14.5, color: "#15171C" } as const;

// The merchant's avatar opens who's signed in, the connected PayPal account and shortcuts.
function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const [merchant, setMerchant] = useState<MerchantInfo | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    api.merchant().then(setMerchant, () => setMerchant({ connected: false, email: null, merchantId: null }));
    root.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const away = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={root} style={{ position: "relative" }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account: Maya, Static Supply"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: open ? "2px solid #FFFFFF" : "2px solid transparent",
          background: "#E9E1D3",
          color: "#15171C",
          display: "grid",
          placeItems: "center",
          fontSize: 13,
          fontWeight: 700,
          padding: 0,
        }}
      >
        M
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 10px)",
            zIndex: 40,
            width: 300,
            background: "#FFFFFF",
            color: "#15171C",
            border: "1px solid #E4E2DC",
            borderRadius: 14,
            boxShadow: "0 12px 32px rgba(21,23,28,.18)",
            padding: 8,
            animation: "dm-fade .2s ease both",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px 12px" }}>
            <span style={{ width: 40, height: 40, borderRadius: "50%", background: "#E9E1D3", display: "grid", placeItems: "center", fontSize: 16, fontWeight: 700 }}>M</span>
            <div>
              <div style={{ fontSize: 15.5, fontWeight: 600 }}>Maya</div>
              <div style={{ fontSize: 13.5, color: "#4A4D55" }}>Owner · Static Supply</div>
            </div>
          </div>
          <div style={{ margin: "0 4px 6px", padding: "10px 12px", borderRadius: 10, background: "#F4F3EF", fontSize: 13.5, lineHeight: 1.45 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 600 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: merchant?.connected === false ? "#B42318" : "#0F6B3E" }} />
              {merchant === null ? "Checking PayPal…" : merchant.connected ? "PayPal business account connected" : "PayPal not reachable"}
            </div>
            {merchant?.email && <div style={{ color: "#4A4D55", marginTop: 3, overflowWrap: "anywhere" }}>{merchant.email}</div>}
            {merchant?.merchantId && (
              <div className="mono" style={{ color: "#6B6E76", fontSize: 12.5, marginTop: 2 }}>
                Merchant ID {shortId(merchant.merchantId, 6, 4)}
              </div>
            )}
          </div>
          {[
            ["/setup", "Store settings"],
            ["/rules", "Rules"],
            ["/store", "View storefront"],
            ["/", "Demo overview"],
          ].map(([to, label]) => (
            <Link key={to} to={to!} role="menuitem" onClick={close} className="dm-menu-item" style={menuItem}>
              {label}
              <Icon d={ICON.chevronRight} color="#8E919A" size={13} />
            </Link>
          ))}
          <a href={REPO_URL} target="_blank" rel="noreferrer" role="menuitem" onClick={close} className="dm-menu-item" style={menuItem}>
            Source code on GitHub
            <span aria-hidden="true" style={{ color: "#8E919A", fontSize: 13 }}>
              ↗
            </span>
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <div style={{ borderTop: "1px solid #EEEDE8", margin: "6px 4px 0", padding: "10px 8px 4px", fontSize: 12.5, lineHeight: 1.45, color: "#6B6E76" }}>
            Demo merchant account: anyone can try the dashboard without signing in. Sandbox only, no real money.
          </div>
        </div>
      )}
    </div>
  );
}
