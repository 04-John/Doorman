// Identity and decision styling. Identity badges are square-cornered tags;
// decision badges are pills, so the two never get confused.
import type { Decision, Tier } from "../lib/api";

export const DECISION: Record<Decision, { label: string; fg: string; bg: string; bd: string; icon: string }> = {
  allowed: { label: "Allowed", fg: "#0F6B3E", bg: "#E4F4EA", bd: "#B2DCC2", icon: "M3.5 8.5l3 3 6-7" },
  step_up: { label: "Step up", fg: "#8A5300", bg: "#FDF1DC", bd: "#EBC98C", icon: "M2.5 13h3.5V9.5h3.5V6H13V2.5" },
  throttled: { label: "Throttled", fg: "#5A3DB5", bg: "#EFEBFC", bd: "#CDC2F1", icon: "M2.5 11.5a5.5 5.5 0 0 1 11 0M8 11.5l2.8-3.3" },
  blocked: { label: "Blocked", fg: "#B42318", bg: "#FDEAE7", bd: "#F2BBB4", icon: "M4.5 4.5l7 7M11.5 4.5l-7 7" },
};

export const IDENTITY: Record<Tier, { label: string; fg: string; bg: string; bd: string; style: "solid" | "dashed"; icon: string }> = {
  verified: {
    label: "Verified customer",
    fg: "#FFFFFF",
    bg: "#15171C",
    bd: "#15171C",
    style: "solid",
    icon: "M8 1.8l5 2v4.1c0 3.1-2.1 5.4-5 6.3-2.9-.9-5-3.2-5-6.3V3.8zM5.8 8l1.6 1.6L10.4 6.4",
  },
  signed: { label: "Signed agent", fg: "#15171C", bg: "#FFFFFF", bd: "#8E919A", style: "solid", icon: "M10.2 2.8a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM8 7.9L2.8 13.2M4.6 11.4l1.6 1.6" },
  unknown: { label: "Unknown", fg: "#55585F", bg: "#F1F0EC", bd: "#A3A6AD", style: "dashed", icon: "M6 6.1a2.1 2.1 0 1 1 3 1.9c-.7.3-1 .8-1 1.5v.4M8 12.2v.3" },
};

export const ICON = {
  check: "M3.5 8.5l3 3 6-7",
  cross: "M4.5 4.5l7 7M11.5 4.5l-7 7",
  dash: "M4.5 8h7",
  people: "M8 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3.5 13.5c.6-2.4 2.3-3.6 4.5-3.6s3.9 1.2 4.5 3.6",
  dollar: "M8 2.5v11M11 5H6.8a1.8 1.8 0 0 0 0 3.6h2.4a1.8 1.8 0 0 1 0 3.6H5",
  arrow: "M2.5 8h9M8.5 4.5L12 8l-3.5 3.5",
  link: "M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 0 1 4.5 9l1-1",
  chevronRight: "M6 3.5l4.5 4.5L6 12.5",
  close: "M4 4l8 8M12 4l-8 8",
};

export function Icon({ d, color, size = 14, width = 2 }: { d: string; color: string; size?: number; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={d} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DecisionBadge({ decision, size = "s", label }: { decision: Decision; size?: "s" | "l"; label?: string }) {
  const s = DECISION[decision];
  const large = size === "l";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: large ? 8 : 6,
        height: large ? 36 : 26,
        padding: large ? "0 15px 0 11px" : "0 11px 0 8px",
        borderRadius: 999,
        border: `1px solid ${s.bd}`,
        background: s.bg,
        color: s.fg,
        fontSize: large ? 17 : 13,
        fontWeight: large ? 700 : 600,
        whiteSpace: "nowrap",
      }}
    >
      <Icon d={s.icon} color={s.fg} size={large ? 18 : 14} />
      {label ?? s.label}
    </span>
  );
}

export function IdentityBadge({ tier, size = "s" }: { tier: Tier; size?: "s" | "m" }) {
  const s = IDENTITY[tier];
  const m = size === "m";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: m ? 28 : 26,
        padding: m ? "0 10px 0 8px" : "0 9px 0 7px",
        borderRadius: 6,
        border: `1px ${s.style} ${s.bd}`,
        background: s.bg,
        color: s.fg,
        fontSize: m ? 13.5 : 13,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <Icon d={s.icon} color={s.fg} size={m ? 15 : 14} width={1.6} />
      {s.label}
    </span>
  );
}

// Each known agent keeps its colour across the app.
const AGENT_COLOURS: Record<string, string> = {
  Ava: "#EADFCB",
  Juniper: "#D5E6DD",
  Kestrel: "#E1DEEF",
  Wren: "#E8DCDC",
  Milo: "#DCE3EF",
  Sol: "#EFE3D2",
};
const FALLBACK_COLOURS = ["#DCE3EF", "#EFE3D2", "#E0EAD6", "#E6DCE8", "#D9E3EA"];

export function agentColour(name: string | null): string {
  if (!name) return "#F1F0EC";
  if (AGENT_COLOURS[name]) return AGENT_COLOURS[name]!;
  const n = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return FALLBACK_COLOURS[n % FALLBACK_COLOURS.length]!;
}

export function AgentAvatar({ name, size = 26 }: { name: string | null; size?: number }) {
  const unknown = !name;
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flex: "none",
        borderRadius: size >= 40 ? 10 : size >= 30 ? 8 : 7,
        background: agentColour(name),
        border: unknown ? "1px dashed #A3A6AD" : "1px solid transparent",
        display: "grid",
        placeItems: "center",
        fontSize: size >= 40 ? 17 : size >= 30 ? 14 : 12,
        fontWeight: 700,
        lineHeight: 1,
        color: "#15171C",
      }}
    >
      {unknown ? "?" : name![0]}
    </span>
  );
}
