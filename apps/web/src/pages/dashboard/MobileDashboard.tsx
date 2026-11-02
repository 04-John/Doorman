// The dashboard as a phone app: Live (the drop at a glance), Activity (every request),
// Ava's conversation as its own screen, and request details in a bottom sheet.
// All data and actions come from Dashboard.tsx; this file only lays them out.
import { useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { Dashboard as Summary, Decision, Tier, Transcript } from "../../lib/api";
import { clock, duration, elapsed, money } from "../../lib/format";
import { backIcon, MerchantTabBar, MerchantTopBar } from "../../mobile/chrome";
import { Spinner } from "../../ui/bits";
import { ProductPhoto } from "../../ui/product";
import { AgentAvatar, DECISION, ICON, Icon, IDENTITY } from "../../ui/status";
import { MessageView, toMessages } from "./AvaChat";
import { DetailPanel } from "./DetailPanel";
import type { Phase } from "./DropStrip";
import { MONEY_COLOUR, type Row } from "./rows";

export interface MobileDashboardProps {
  summary: Summary | null;
  rows: Row[];
  visible: Row[];
  transcript: Transcript | null;
  phase: Phase;
  running: boolean;
  booting: boolean;
  now: number;
  rps: number[];
  perCustomer: number;
  counts: Record<string, number>;
  decision: Decision | "all";
  setDecision: (d: Decision | "all") => void;
  tier: Tier | "all";
  setTier: (t: Tier | "all") => void;
  selected: string | null;
  setSelected: (id: string | null) => void;
  run: () => void;
  reset: () => void;
  reloadAll: () => void;
}

const DECISIONS = Object.keys(DECISION) as Decision[];
const TIERS: { value: Tier | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "verified", label: "Verified" },
  { value: "signed", label: "Signed" },
  { value: "unknown", label: "Unknown" },
];

function Sparkline({ samples }: { samples: number[] }) {
  const values = samples.length > 1 ? samples : Array.from({ length: 48 }, () => 0);
  const max = Math.max(40, ...values);
  const w = 320;
  const points = values.map((v, i) => [(i / Math.max(47, values.length - 1)) * w, 39 - (v / max) * 34] as const);
  const line = `M${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L")}`;
  const last = points.at(-1)!;
  return (
    <svg viewBox={`0 0 ${w} 40`} preserveAspectRatio="none" style={{ display: "block", width: "100%", height: 40 }} aria-hidden="true">
      <path d={`${line} L${last[0].toFixed(1)},40 L0,40 Z`} fill="rgba(255,255,255,.08)" />
      <path d={line} fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function RowItem({ row, first, selected, onSelect, showTime }: { row: Row; first: boolean; selected: boolean; onSelect: () => void; showTime?: boolean }) {
  const d = DECISION[row.decision];
  const unknown = row.tier === "unknown";
  const amount = row.amountCents != null ? `${money(row.amountCents)}${row.money ? ` · ${row.money}` : ""}` : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={row.freshAt ? "m-row-in" : undefined}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        minHeight: 68,
        padding: "10px 14px",
        border: 0,
        borderTop: first ? "0" : "1px solid #EEEDE8",
        background: selected ? "#F1F0EB" : row.freshAt ? "#FBF5E4" : "#FFFFFF",
        transition: "background .9s ease",
        textAlign: "left",
        color: "#15171C",
      }}
    >
      <AgentAvatar name={row.name} size={38} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 15.5, fontWeight: 600, color: unknown ? "#4A4D55" : "#15171C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {unknown ? (row.source ?? "Unknown agent") : row.name}
          </span>
          <Icon d={IDENTITY[row.tier].icon} color={row.tier === "verified" ? "#15171C" : row.tier === "signed" ? "#4A4D55" : "#A3A6AD"} size={13} width={1.7} />
          {showTime && (
            <span className="mono" style={{ marginLeft: "auto", fontSize: 11.5, color: "#8E919A" }}>
              {clock(row.at)}
            </span>
          )}
        </span>
        <span style={{ display: "block", fontSize: 13.5, color: "#4A4D55", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>
          {showTime ? `${row.action} · ${row.reason}` : row.reason}
        </span>
      </span>
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flex: "none" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 24, padding: "0 9px 0 7px", borderRadius: 999, border: `1px solid ${d.bd}`, background: d.bg, color: d.fg, fontSize: 12.5, fontWeight: 600 }}>
          <Icon d={d.icon} color={d.fg} size={12} width={2.2} />
          {d.label}
        </span>
        <span className="mono" style={{ fontSize: 12, color: row.money ? MONEY_COLOUR[row.money] : "#6B6E76", textDecoration: row.money === "Released" || row.money === "Declined" ? "line-through" : "none" }}>
          {amount ?? (showTime ? "—" : clock(row.at))}
        </span>
      </span>
    </button>
  );
}

function EmptyFeed({ running, onRun }: { running: boolean; onRun: () => void }) {
  return (
    <div style={{ border: "1.5px dashed #C9C6BD", borderRadius: 20, padding: "28px 22px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 21V10a7 7 0 0 1 14 0v11" stroke="#8E919A" strokeWidth="1.6" />
        <path d="M2.5 21h19" stroke="#8E919A" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <div style={{ fontSize: 17, fontWeight: 600 }}>{running ? "Agents are on their way" : "No agents yet"}</div>
      <div style={{ fontSize: 14.5, lineHeight: 1.5, color: "#4A4D55" }}>
        {running ? "The first requests will appear here in a moment." : "Tap Run the drop to simulate launch traffic. Every agent appears here with Doorman's decision."}
      </div>
      {!running && (
        <button type="button" className="m-btn m-tap" style={{ height: 48, marginTop: 4 }} onClick={onRun}>
          Run the drop
        </button>
      )}
    </div>
  );
}

function Live(p: MobileDashboardProps & { openChat: () => void }) {
  const { summary, phase, running, now, rps, perCustomer, rows, transcript } = p;
  const drop = summary?.drop;
  const k = summary?.kpis;
  const total = drop?.stockTotal ?? 50;
  const left = drop?.stockLeft ?? total;
  const started = drop ? new Date(drop.startedAt).getTime() : null;
  const since = started ? (drop?.endedAt ? new Date(drop.endedAt).getTime() : now) - started : 0;
  const decided = (k?.allowed ?? 0) + (k?.stepUp ?? 0) + (k?.throttled ?? 0) + (k?.blocked ?? 0);
  const decs = [
    { key: "allowed" as const, count: k?.allowed ?? 0 },
    { key: "step_up" as const, count: k?.stepUp ?? 0 },
    { key: "throttled" as const, count: k?.throttled ?? 0 },
    { key: "blocked" as const, count: k?.blocked ?? 0 },
  ];
  const messages = transcript ? toMessages(transcript) : [];
  const last = messages.at(-1);
  const preview = !last ? "Ava hasn't arrived yet. Her messages appear here when the drop starts." : last.kind === "store" ? `${last.call} · ${last.text}` : last.text;
  const pill = phase === "live" ? { label: "LIVE", bg: "rgba(255,138,122,.16)", fg: "#FFB4A9" } : phase === "soldout" ? { label: "SOLD OUT", bg: "#FFFFFF", fg: "#15171C" } : { label: "READY", bg: "rgba(255,255,255,.12)", fg: "#FFFFFF" };

  return (
    <div className="m-pad m-fade" style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 24 }}>
      <h1 className="m-title" style={{ marginTop: 6 }}>
        Live
      </h1>

      {p.booting ? (
        <div aria-busy="true" aria-label="Loading dashboard" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="m-sk" style={{ height: 290, borderRadius: 24 }} />
          <div className="m-sk" style={{ height: 190, borderRadius: 20 }} />
          <div className="m-sk" style={{ height: 84, borderRadius: 20 }} />
        </div>
      ) : (
        <>
          {phase === "soldout" && drop && (
            <div className="m-fade" style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 18, background: "#E4F4EA", border: "1px solid #B2DCC2" }}>
              <span style={{ width: 36, height: 36, flex: "none", borderRadius: "50%", background: "#0F6B3E", display: "grid", placeItems: "center" }}>
                <Icon d={ICON.check} color="#FFFFFF" size={18} width={2.2} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 16, fontWeight: 600, color: "#0B4F2E" }}>Sold out in {duration(new Date(drop.endedAt ?? now).getTime() - new Date(drop.startedAt).getTime())}</span>
                <span style={{ display: "block", fontSize: 13.5, color: "#0B4F2E", marginTop: 2 }}>
                  {drop.sold} to verified customers · {k?.botsBlocked ?? 0} bots blocked
                </span>
              </span>
            </div>
          )}

          <section aria-label="Drop" style={{ borderRadius: 24, background: "#15171C", color: "#FFFFFF", padding: "18px 18px 16px", display: "flex", flexDirection: "column", gap: 18, position: "relative", overflow: "hidden" }}>
            <div aria-hidden="true" style={{ position: "absolute", right: -60, top: -60, width: 200, height: 200, borderRadius: "50%", border: "1px solid rgba(255,255,255,.08)" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <ProductPhoto productId="hoodie-night-shift" style={{ width: 46, height: 46, borderRadius: 12 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>Night Shift Hoodie drop</div>
                <div style={{ fontSize: 13.5, color: "#C9CBD1", marginTop: 2 }}>
                  {money(drop?.priceCents ?? 6800)} · {perCustomer} per customer · {total} units
                </div>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 24, padding: "0 10px", borderRadius: 999, background: pill.bg, color: pill.fg, fontSize: 11.5, fontWeight: 700, letterSpacing: ".06em" }}>
                {phase === "live" && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FF8A7A", animation: "m-pulse-light 1.6s infinite" }} />}
                {pill.label}
              </span>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span className="mono" style={{ fontSize: 60, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 0.9 }}>
                  {left}
                </span>
                <span className="mono" style={{ fontSize: 16, color: "#C9CBD1" }}>
                  / {total} left
                </span>
              </div>
              <div role="img" aria-label={`${left} of ${total} left`} style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,.14)", marginTop: 14, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${total ? (left / total) * 100 : 0}%`, background: "#FFFFFF", borderRadius: 4, transition: "width .4s ease" }} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.12)" }}>
              {[
                ["Since start", elapsed(since)],
                ["Requests/sec", String(phase === "before" ? 0 : Math.round(rps.at(-1) ?? 0))],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: ".07em", textTransform: "uppercase", color: "#A9ABB1" }}>{label}</div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 600, marginTop: 3 }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: -6 }}>
              <Sparkline samples={rps} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {running ? (
                <button type="button" disabled className="m-btn" style={{ flex: 1, height: 52, border: "1.5px solid rgba(255,255,255,.4)", background: "transparent", opacity: 1 }}>
                  <Spinner size={15} light />
                  Agents arriving…
                </button>
              ) : (
                <button type="button" onClick={p.run} className="m-btn m-btn-light m-tap" style={{ flex: 1, height: 52 }}>
                  <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#15171C", display: "grid", placeItems: "center" }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                      <path d="M2.5 1.3l6 3.7-6 3.7z" fill="#FFFFFF" />
                    </svg>
                  </span>
                  {phase === "before" ? "Run the drop" : "Run it again"}
                </button>
              )}
              {phase !== "before" && !running && (
                <button type="button" onClick={p.reset} className="m-btn m-btn-ghost-dark m-tap" style={{ height: 52, fontWeight: 500 }}>
                  Reset
                </button>
              )}
            </div>
          </section>

          <section aria-label="Decisions" className="m-card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Decisions</h2>
              <span className="mono" style={{ fontSize: 12.5, color: "#6B6E76" }}>
                {rows.length} requests
              </span>
            </div>
            <div aria-hidden="true" style={{ display: "flex", gap: 3, height: 12, marginTop: 14, borderRadius: 6, overflow: "hidden", background: "#EEEDE8" }}>
              {decs.map((x) => (
                <div key={x.key} style={{ width: decided ? `${(x.count / decided) * 100}%` : 0, background: DECISION[x.key].fg, transition: "width .45s ease" }} />
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "14px 12px", marginTop: 16 }}>
              {decs.map((x) => (
                <div key={x.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 30, height: 30, flex: "none", borderRadius: 9, background: DECISION[x.key].bg, display: "grid", placeItems: "center" }}>
                    <Icon d={DECISION[x.key].icon} color={DECISION[x.key].fg} size={15} />
                  </span>
                  <span>
                    <span className="mono" style={{ display: "block", fontSize: 19, fontWeight: 600, lineHeight: 1.1 }}>
                      {x.count}
                    </span>
                    <span style={{ display: "block", fontSize: 13, color: "#4A4D55" }}>{DECISION[x.key].label}</span>
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", marginTop: 16, paddingTop: 14, borderTop: "1px solid #EEEDE8" }}>
              {[
                ["Agents seen", String(k?.agentsSeen ?? 0), "#6B6E76"],
                ["Awaiting", money((k?.awaitingApprovalCents ?? 0) + (k?.heldCents ?? 0)), "#8A5300"],
                ["Charged", money(k?.chargedCents ?? 0), "#0F6B3E"],
              ].map(([label, value, fg]) => (
                <div key={label}>
                  <div style={{ fontSize: 12, color: fg }}>{label}</div>
                  <div className="mono" style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <button type="button" onClick={p.openChat} className="m-card m-tap" style={{ display: "flex", gap: 12, alignItems: "center", padding: "14px 16px", textAlign: "left", color: "#15171C" }}>
            <AgentAvatar name="Ava" size={42} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15.5, fontWeight: 600 }}>Ava's conversation</span>
                {phase === "live" && transcript?.running && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: "#B42318" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#B42318", animation: "dm-pulse 1.6s infinite" }} />
                    LIVE
                  </span>
                )}
              </span>
              <span className="m-clamp2" style={{ fontSize: 14, lineHeight: 1.4, color: "#4A4D55", marginTop: 3 }}>
                {preview}
              </span>
            </span>
            {messages.length > 0 && (
              <span style={{ minWidth: 24, height: 24, padding: "0 6px", borderRadius: 12, background: "#15171C", color: "#FFFFFF", font: "600 12px var(--mono)", display: "grid", placeItems: "center" }}>{messages.length}</span>
            )}
            <Icon d={ICON.chevronRight} color="#8E919A" width={1.8} />
          </button>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>Latest</h2>
            <Link to="/dashboard?view=activity" style={{ fontSize: 15, fontWeight: 600, color: "#4A4D55", padding: "12px 4px" }}>
              See all
            </Link>
          </div>
          {rows.length === 0 ? (
            <EmptyFeed running={running} onRun={p.run} />
          ) : (
            <div className="m-card" style={{ overflow: "hidden", marginTop: -6 }}>
              {rows.slice(0, 5).map((r, i) => (
                <RowItem key={r.id} row={r} first={i === 0} selected={p.selected === r.id} onSelect={() => p.setSelected(r.id)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Activity(p: MobileDashboardProps) {
  const { rows, visible, counts, decision, tier } = p;
  return (
    <div className="m-fade" style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 24 }}>
      <div className="m-pad">
        <h1 className="m-title" style={{ marginTop: 6 }}>
          Activity
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14.5, color: "#4A4D55", marginTop: 6 }}>
          {p.phase === "live" && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#B42318", animation: "dm-pulse 1.6s infinite" }} />}
          {rows.length} requests · newest first
        </div>
      </div>
      <div className="m-hscroll" role="group" aria-label="Filter by decision" style={{ gap: 8, padding: "2px 20px" }}>
        {(["all", ...DECISIONS] as const).map((d) => {
          const on = decision === d;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              onClick={() => p.setDecision(d)}
              className="m-tap"
              style={{ height: 38, padding: "0 14px", borderRadius: 999, border: `1px solid ${on ? "#15171C" : "#E4E2DC"}`, background: on ? "#15171C" : "#FFFFFF", color: on ? "#FFFFFF" : "#15171C", fontSize: 14.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}
            >
              {d === "all" ? "All" : DECISION[d].label}
              <span className="mono" style={{ fontSize: 12, opacity: 0.7 }}>
                {counts[d] ?? 0}
              </span>
            </button>
          );
        })}
      </div>
      <div className="m-pad">
        <div role="group" aria-label="Filter by identity" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 2, padding: 3, background: "#EAE8E2", borderRadius: 12 }}>
          {TIERS.map((t) => {
            const on = tier === t.value;
            return (
              <button key={t.value} type="button" aria-pressed={on} onClick={() => p.setTier(t.value)} style={{ height: 36, border: 0, borderRadius: 9, background: on ? "#FFFFFF" : "transparent", boxShadow: on ? "0 1px 3px rgba(21,23,28,.14)" : "none", color: "#15171C", fontSize: 13.5, fontWeight: on ? 600 : 500 }}>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="m-pad">
        {p.booting ? (
          <div className="m-sk" style={{ height: 420, borderRadius: 20 }} />
        ) : rows.length === 0 ? (
          <EmptyFeed running={p.running} onRun={p.run} />
        ) : visible.length === 0 ? (
          <div style={{ padding: "40px 16px", textAlign: "center", fontSize: 15, color: "#4A4D55" }}>No requests match these filters yet.</div>
        ) : (
          <div className="m-card" style={{ overflow: "hidden" }}>
            {visible.slice(0, 80).map((r, i) => (
              <RowItem key={r.id} row={r} first={i === 0} selected={p.selected === r.id} onSelect={() => p.setSelected(r.id)} showTime />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Chat({ transcript, live, onBack }: { transcript: Transcript | null; live: boolean; onBack: () => void }) {
  const messages = transcript ? toMessages(transcript) : [];
  const scroller = useRef<HTMLDivElement>(null);
  const last = transcript?.transcript.at(-1);
  const typing = live && !!transcript?.running && !!last && last.from !== "ava";
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, typing]);

  return (
    <div className="m-push" role="dialog" aria-label="Ava's conversation">
      <header style={{ flex: "none", padding: "calc(8px + var(--m-safe-t)) 12px 8px 6px", display: "flex", alignItems: "center", gap: 4, borderBottom: "1px solid #E4E2DC", background: "rgba(250,249,246,.94)" }}>
        <button type="button" onClick={onBack} className="m-tap" style={{ height: 44, padding: "0 8px", border: 0, background: "transparent", display: "flex", alignItems: "center", gap: 2, fontSize: 16, fontWeight: 500, color: "#15171C" }}>
          {backIcon}
          Live
        </button>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", marginRight: 62 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Ava's conversation</span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#6B6E76" }}>
            {live && transcript?.running && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#B42318", animation: "dm-pulse 1.6s infinite" }} />}
            Shopping for John D.
          </span>
        </div>
      </header>
      <div ref={scroller} aria-live="polite" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 16px 20px", display: "flex", flexDirection: "column", gap: 14, scrollBehavior: "smooth" }}>
        {messages.length === 0 && (
          <div style={{ margin: "auto 0", textAlign: "center", padding: "0 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Ava hasn't arrived yet</div>
            <div style={{ fontSize: 15, lineHeight: 1.5, color: "#4A4D55" }}>When the drop starts, Ava's messages and every reply from the store appear here.</div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className="m-fade" style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <MessageView m={m} />
          </div>
        ))}
        {typing && (
          <div style={{ alignSelf: "flex-end", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#6B6E76" }}>
            Ava is thinking
            <span style={{ display: "flex", gap: 3, padding: "10px 12px", borderRadius: 14, background: "#15171C" }}>
              {[0, 0.15, 0.3].map((delay) => (
                <span key={delay} style={{ width: 5, height: 5, borderRadius: "50%", background: "#FFFFFF", animation: `dm-dot 1.1s ${delay}s infinite` }} />
              ))}
            </span>
          </div>
        )}
      </div>
      <div style={{ flex: "none", padding: "12px 20px calc(14px + var(--m-safe-b))", borderTop: "1px solid #E4E2DC", fontSize: 13, lineHeight: 1.4, color: "#6B6E76", textAlign: "center" }}>
        Read-only. Ava talks to your store through its tools; Doorman checks every call.
      </div>
    </div>
  );
}

export function MobileDashboard(p: MobileDashboardProps) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const view = params.get("view");

  // New requests since the merchant last looked at Activity, for the tab badge.
  const seen = useRef(p.rows.length);
  if (view === "activity" || p.rows.length < seen.current) seen.current = p.rows.length;
  const unseen = view === "activity" ? 0 : p.rows.length - seen.current;

  // Braces matter: scrollTo returns a promise in newer browsers, and an effect may only return a cleanup function.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  return (
    <div className="m-app" data-screen-label="M1 Dashboard">
      <MerchantTopBar />
      {view === "activity" ? <Activity {...p} /> : <Live {...p} openChat={() => navigate("/dashboard?view=chat")} />}
      {view === "chat" && <Chat transcript={p.transcript} live={p.phase === "live"} onBack={() => navigate("/dashboard")} />}
      <MerchantTabBar activityBadge={unseen} />
      <DetailPanel sheet eventId={p.selected} perCustomer={p.perCustomer} onClose={() => p.setSelected(null)} onChanged={p.reloadAll} />
    </div>
  );
}
