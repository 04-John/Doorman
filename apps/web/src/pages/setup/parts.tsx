// Small pieces shared by the setup wizard and the Rules page.
import type { CSSProperties, ReactNode } from "react";
import { ICON, Icon } from "../../ui/status";

function Track({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{ display: "block", width: 42, height: 24, flex: "none", borderRadius: 12, background: on ? "#15171C" : "#D3D0C8", position: "relative", transition: "background .2s" }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: on ? 21 : 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#FFFFFF",
          boxShadow: "0 1px 2px rgba(0,0,0,.2)",
          transition: "left .2s",
        }}
      />
    </span>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      style={{ flex: "none", border: 0, padding: 0, background: "transparent", borderRadius: 12 }}
    >
      <Track on={on} />
    </button>
  );
}

// Display-only switch: the label next to it carries the state for screen readers.
export const StaticSwitch = ({ on }: { on: boolean }) => <Track on={on} />;

const WARNING = "M8 2.2L14.2 13H1.8zM8 6.6v2.8M8 11.4v.2";

export function Notice({ tone, title, children, action }: { tone: "error" | "warning"; title?: string; children: ReactNode; action?: ReactNode }) {
  const s =
    tone === "error"
      ? { fg: "#B42318", bg: "#FDEAE7", bd: "#F2BBB4", icon: ICON.cross }
      : { fg: "#8A5300", bg: "#FDF1DC", bd: "#EBC98C", icon: WARNING };
  return (
    <div
      role={tone === "error" ? "alert" : "note"}
      style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px", borderRadius: 12, background: s.bg, border: `1px solid ${s.bd}` }}
    >
      <span style={{ flex: "none", marginTop: 1 }}>
        <Icon d={s.icon} color={s.fg} size={17} />
      </span>
      <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, lineHeight: 1.5, color: "#15171C" }}>
        {title && <div style={{ fontWeight: 600, color: s.fg }}>{title}</div>}
        {children}
      </div>
      {action}
    </div>
  );
}

export const fieldLabel: CSSProperties = { display: "block", fontSize: 13, color: "#4A4D55", marginBottom: 6 };

export const fieldBox: CSSProperties = {
  width: "100%",
  height: 42,
  border: "1.5px solid #D3D0C8",
  borderRadius: 10,
  display: "flex",
  alignItems: "center",
  padding: "0 12px",
  fontSize: 15,
  background: "#FFFFFF",
  color: "#15171C",
};

// Read-only values sit on a softer box so the editable field stands out.
export const readOnlyBox: CSSProperties = { ...fieldBox, borderColor: "#E4E2DC", background: "#FAF9F6" };
