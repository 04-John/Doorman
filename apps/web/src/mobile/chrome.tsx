// Mobile app chrome: bottom tab bars and the small top bars.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useSearchParams } from "react-router";
import { AccountPanel, LogoMark, useMerchantInfo } from "../ui/chrome";

function TabIcon({ d, active }: { d: string; active: boolean }) {
  return (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const TAB_ICON = {
  live: "M3 12h4l2.5-6 4 12 2.5-6H21",
  activity: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  rules: "M12 3l7 3v5.5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6zM9 12l2 2 4-4",
  settings: "M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5v5M9 14.5v5",
  shop: "M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8zM9 8V6.5a3 3 0 0 1 6 0V8",
  passes: "M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4zM14 6v12",
};

interface Tab {
  to: string;
  label: string;
  icon: string;
  active: boolean;
  badge?: number;
}

function TabBar({ tabs, label }: { tabs: Tab[]; label: string }) {
  return (
    <nav className="m-tabbar" aria-label={label}>
      {tabs.map((t) => (
        <Link key={t.label} to={t.to} className="m-tab" aria-current={t.active ? "page" : undefined}>
          <TabIcon d={t.icon} active={t.active} />
          {t.label}
          {t.badge ? <span className="m-tab-badge">{t.badge > 99 ? "99+" : t.badge}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

export function MerchantTabBar({ activityBadge = 0 }: { activityBadge?: number }) {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const view = params.get("view");
  const onDash = pathname === "/dashboard";
  return (
    <TabBar
      label="Merchant"
      tabs={[
        { to: "/dashboard", label: "Live", icon: TAB_ICON.live, active: onDash && view !== "activity" },
        { to: "/dashboard?view=activity", label: "Activity", icon: TAB_ICON.activity, active: onDash && view === "activity", badge: activityBadge },
        { to: "/rules", label: "Rules", icon: TAB_ICON.rules, active: pathname === "/rules" },
        { to: "/setup", label: "Settings", icon: TAB_ICON.settings, active: pathname === "/setup" },
      ]}
    />
  );
}

export function CustomerTabBar() {
  const { pathname } = useLocation();
  return (
    <TabBar
      label="Customer"
      tabs={[
        { to: "/store", label: "Store", icon: TAB_ICON.shop, active: pathname === "/store" },
        { to: "/passes", label: "Passes", icon: TAB_ICON.passes, active: pathname === "/passes" },
      ]}
    />
  );
}

export function SandboxPill() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 28, padding: "0 10px", border: "1px solid #D9B35C", background: "#FDF5E2", borderRadius: 999, fontSize: 12, fontWeight: 600, color: "#6B4600", whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#C98A1B" }} />
      Sandbox
    </span>
  );
}

// Merchant screens: store chip on the left, sandbox tag on the right.
// The merchant's avatar opens the same account details as the desktop menu, as a bottom sheet.
function AccountButton() {
  const [open, setOpen] = useState(false);
  const merchant = useMerchantInfo(open);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    sheet.current?.querySelector<HTMLElement>("a, button")?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Account: Maya, Static Supply"
        onClick={() => setOpen(true)}
        className="m-hit m-tap"
        style={{ width: 36, height: 36, flex: "none", borderRadius: "50%", border: "1px solid #E4E2DC", background: "#E9E1D3", color: "#15171C", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 700, padding: 0 }}
      >
        M
      </button>
      {/* Rendered into the page body: the top bar's blur would otherwise hold a fixed sheet inside the bar. */}
      {open &&
        createPortal(
            <div style={{ position: "fixed", inset: 0, zIndex: 30 }}>
              <div onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(21,23,28,.4)", animation: "dm-fade .25s ease both" }} />
              <div ref={sheet} role="dialog" aria-modal="true" aria-label="Account" className="m-sheet" style={{ position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "88dvh", overflowY: "auto", padding: "0 8px calc(12px + var(--m-safe-b))" }}>
                <div className="m-sheet-grab" aria-hidden="true">
                  <span />
                </div>
                <AccountPanel merchant={merchant} onClose={close} roomy />
              </div>
            </div>,
          document.body,
        )}
    </>
  );
}

// The account button is left off where the merchant isn't signed in yet.
export function MerchantTopBar({ right, account = true }: { right?: ReactNode; account?: boolean }) {
  return (
    <header className="m-topbar" style={{ justifyContent: "space-between" }}>
      <Link to="/" aria-label="Doorman demo overview" className="m-hit" style={{ display: "flex", alignItems: "center", gap: 9, height: 36, padding: "0 12px 0 5px", borderRadius: 999, background: "#FFFFFF", border: "1px solid #E4E2DC", fontSize: 14.5, fontWeight: 600 }}>
        <span style={{ width: 26, height: 26, borderRadius: "50%", background: "#15171C", display: "grid", placeItems: "center" }}>
          <LogoMark size={15} color="#FFFFFF" />
        </span>
        Static Supply
      </Link>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {right ?? <SandboxPill />}
        {account && <AccountButton />}
      </span>
    </header>
  );
}

export const closeIcon = (
  <span>
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="#15171C" strokeWidth="2" strokeLinecap="round" />
    </svg>
  </span>
);

export const backIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" stroke="#15171C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
