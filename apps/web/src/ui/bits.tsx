// Small building blocks: KPI tile, stock bar, check row, timeline, loading states.
import type { Check } from "../lib/api";
import { ICON, Icon } from "./status";

export function KpiTile({ label, value, icon, fg, bg }: { label: string; value: string | number; icon: string; fg: string; bg: string }) {
  return (
    <div className="card" style={{ padding: "13px 16px 14px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 500, color: "#4A4D55", whiteSpace: "nowrap" }}>
        <span style={{ width: 20, height: 20, flex: "none", borderRadius: 6, background: bg, display: "grid", placeItems: "center" }}>
          <Icon d={icon} color={fg} size={13} />
        </span>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 6, transition: "color .4s ease" }}>
        {value}
      </div>
    </div>
  );
}

export function StockBar({ left, total }: { left: number; total: number }) {
  const pct = total > 0 ? (left / total) * 100 : 0;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span className="label" style={{ letterSpacing: ".06em" }}>
          Stock
        </span>
        <span className="mono" style={{ fontSize: 15, color: "#4A4D55" }}>
          <b style={{ fontSize: 22, fontWeight: 600, color: "#15171C" }}>{left}</b> / {total} left
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "#EEEDE8", marginTop: 8, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "#15171C", borderRadius: 4, transition: "width .4s ease" }} />
      </div>
    </div>
  );
}

const CHECK_STYLE = {
  pass: { bg: "#E4F4EA", fg: "#0F6B3E", icon: ICON.check, labelFg: "#15171C" },
  fail: { bg: "#FDEAE7", fg: "#B42318", icon: ICON.cross, labelFg: "#15171C" },
  na: { bg: "#F1F0EC", fg: "#8E919A", icon: ICON.dash, labelFg: "#6B6E76" },
};

export function CheckRow({ label, status, note, first }: { label: string; status: Check["status"]; note: string; first?: boolean }) {
  const s = CHECK_STYLE[status];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, minHeight: 40, borderTop: first ? "1px solid transparent" : "1px solid #EEEDE8" }}>
      <span style={{ width: 22, height: 22, flex: "none", borderRadius: "50%", background: s.bg, display: "grid", placeItems: "center" }}>
        <Icon d={s.icon} color={s.fg} size={12} width={2.4} />
      </span>
      <span style={{ fontSize: 14.5, flex: 1, color: s.labelFg }}>
        {label}
        <span className="sr-only"> — {status === "pass" ? "passed" : status === "fail" ? "failed" : "not applicable"}</span>
      </span>
      <span style={{ fontSize: 13, color: "#6B6E76", textAlign: "right" }}>{note}</span>
    </div>
  );
}

export type StepState = "done" | "cur" | "pend" | "fail";
const STEP_STYLE: Record<StepState, { dot: string; ring: string; fg: string; fw: number }> = {
  done: { dot: "#15171C", ring: "#15171C", fg: "#15171C", fw: 500 },
  cur: { dot: "#FFFFFF", ring: "#C98A1B", fg: "#8A5300", fw: 600 },
  pend: { dot: "#FFFFFF", ring: "#C9C6BD", fg: "#6B6E76", fw: 400 },
  fail: { dot: "#B42318", ring: "#B42318", fg: "#B42318", fw: 600 },
};

export function Timeline({ steps }: { steps: { label: string; state: StepState; time?: string }[] }) {
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {steps.map((step, i) => {
        const s = STEP_STYLE[step.state];
        return (
          <li key={i} style={{ display: "grid", gridTemplateColumns: "22px 1fr auto", gap: 10, minHeight: 34 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", marginTop: 4, background: s.dot, border: `2px solid ${s.ring}` }} />
              <span style={{ flex: 1, width: 2, background: i === steps.length - 1 ? "transparent" : "#E4E2DC", margin: "3px 0" }} />
            </div>
            <span style={{ fontSize: 14.5, fontWeight: s.fw, color: s.fg }}>{step.label}</span>
            <span className="mono" style={{ fontSize: 12.5, color: "#6B6E76" }}>
              {step.time ?? ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Skeleton({ width, height, radius = 6, style }: { width: number | string; height: number; radius?: number; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ width, height, borderRadius: radius, ...style }} />;
}

export function Spinner({ size = 13, light = false }: { size?: number; light?: boolean }) {
  return (
    <span
      className="spinner"
      aria-hidden="true"
      style={{ width: size, height: size, ...(light ? { borderColor: "rgba(255,255,255,.3)", borderTopColor: "#FFFFFF" } : {}) }}
    />
  );
}

export function ExplanationSkeleton() {
  return (
    <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 14 }}>
      {["100%", "94%", "97%", "58%"].map((w, i) => (
        <div
          key={i}
          style={{
            height: 12,
            width: w,
            borderRadius: 6,
            background: "linear-gradient(90deg,#E4E2DC 0,#EEEDE8 50%,#E4E2DC 100%)",
            backgroundSize: "800px 100%",
            animation: "dm-shimmer 1.3s linear infinite",
          }}
        />
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, fontSize: 13, color: "#6B6E76" }}>
        <Spinner />
        Writing an explanation from the checks…
      </div>
    </div>
  );
}
