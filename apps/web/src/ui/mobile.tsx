// Shell for customer pages: mobile-first, content column capped at 440px on desktop.
import type { ReactNode } from "react";
import { Link } from "react-router";
import { LogoMark } from "./chrome";
import { ICON, Icon } from "./status";

export function MobileShell({ brand, right, children }: { brand: "store" | "doorman"; right?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ minHeight: "100%", background: "#FFFFFF" }}>
      <div style={{ maxWidth: 440, margin: "0 auto", minHeight: "calc(100vh - var(--demo-nav-h, 0px))", display: "flex", flexDirection: "column", borderLeft: "1px solid #EEEDE8", borderRight: "1px solid #EEEDE8" }}>
        <header style={{ height: 52, flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", borderBottom: "1px solid #EEEDE8" }}>
          {brand === "store" ? (
            <Link to="/store" style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 16, fontWeight: 600 }}>
              <span style={{ width: 28, height: 28, borderRadius: 7, background: "#15171C", color: "#FFFFFF", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>SS</span>
              Static Supply
            </Link>
          ) : (
            <Link to="/" style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 16, fontWeight: 600 }}>
              <LogoMark size={20} color="#15171C" />
              Doorman
            </Link>
          )}
          {right ?? (
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 500, color: "#4A4D55" }}>
              <LogoMark size={16} color="#15171C" />
              Protected by Doorman
            </span>
          )}
        </header>
        <main style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 16, position: "relative" }}>{children}</main>
        <footer style={{ padding: "10px 20px 18px", textAlign: "center", fontSize: 12, color: "#8E919A" }}>Sandbox demo, no real money</footer>
      </div>
    </div>
  );
}

// A row with a round green tick, used in "Your limits" and receipts.
export function TickLine({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 15 }}>
      <span style={{ width: 20, height: 20, flex: "none", borderRadius: "50%", background: "#E4F4EA", display: "grid", placeItems: "center" }}>
        <Icon d={ICON.check} color="#0F6B3E" size={11} width={2.6} />
      </span>
      {children}
    </div>
  );
}

export function KeyValues({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <div style={{ border: "1px solid #E4E2DC", borderRadius: 16, padding: "6px 16px" }}>
      {rows.map(([k, v], i) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, minHeight: 44, alignItems: "center", fontSize: 15, borderTop: i ? "1px solid #EEEDE8" : "none" }}>
          <span style={{ color: "#4A4D55" }}>{k}</span>
          <span style={{ textAlign: "right" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

export function BigButton({ children, onClick, href, variant = "primary", disabled }: { children: ReactNode; onClick?: () => void; href?: string; variant?: "primary" | "secondary" | "plain" | "danger"; disabled?: boolean }) {
  const style: React.CSSProperties = {
    height: variant === "plain" ? 48 : 52,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    fontSize: variant === "plain" ? 15 : 16,
    fontWeight: variant === "plain" ? 500 : 600,
    width: "100%",
    border: variant === "secondary" ? "1.5px solid #D3D0C8" : 0,
    background: variant === "primary" ? "#15171C" : variant === "danger" ? "#B42318" : "transparent",
    color: variant === "primary" || variant === "danger" ? "#FFFFFF" : variant === "plain" ? "#4A4D55" : "#15171C",
    opacity: disabled ? 0.6 : 1,
  };
  if (href) {
    return href.startsWith("/") ? (
      <Link to={href} style={style}>
        {children}
      </Link>
    ) : (
      <a href={href} style={style}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={style}>
      {children}
    </button>
  );
}

// "Log in with PayPal" — sends the customer through PayPal and back to this page.
export function PayPalLoginButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      style={{
        height: 50,
        borderRadius: 25,
        background: "#FFFFFF",
        border: "1.5px solid #15171C",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        fontSize: 16,
        fontWeight: 600,
        color: "#15171C",
      }}
    >
      Log in with <span style={{ fontWeight: 800, fontStyle: "italic", color: "#003087" }}>PayPal</span>
    </a>
  );
}
