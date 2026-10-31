// App chrome: logo, sandbox tag, merchant top bar.
import { NavLink } from "react-router";

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
      </nav>
      <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#E9E1D3", color: "#15171C", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700 }} title="Maya, Static Supply">
        M
      </div>
    </header>
  );
}
