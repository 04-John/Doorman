// The strip under the top bar: which drop, how much stock, how busy, and the Run button.
import type { Dashboard } from "../../lib/api";
import { elapsed, money } from "../../lib/format";
import { Spinner, StockBar } from "../../ui/bits";

export type Phase = "before" | "live" | "soldout";

function Sparkline({ samples }: { samples: number[] }) {
  const values = samples.length > 1 ? samples : [0, 0];
  const max = Math.max(40, ...values);
  const points = values.map((v, i) => [(i / Math.max(47, values.length - 1)) * 210, 33 - (v / max) * 30] as const);
  const line = `M${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L")}`;
  const last = points.at(-1)!;
  const area = `${line} L${last[0].toFixed(1)},34 L0,34 Z`;
  return (
    <svg width="210" height="34" viewBox="0 0 210 34" style={{ display: "block", marginTop: 6 }} aria-hidden="true">
      <path d={area} fill="#EEEDE8" />
      <path d={line} fill="none" stroke="#15171C" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

const pill = { display: "inline-flex", alignItems: "center", height: 22, padding: "0 9px", borderRadius: 999, fontSize: 12, fontWeight: 700, letterSpacing: ".06em" } as const;

export function DropStrip({
  summary,
  phase,
  perCustomer,
  now,
  rps,
  running,
  onRun,
  onReset,
}: {
  summary: Dashboard | null;
  phase: Phase;
  perCustomer: number;
  now: number;
  rps: number[];
  running: boolean;
  onRun: () => void;
  onReset: () => void;
}) {
  const drop = summary?.drop;
  const total = drop?.stockTotal ?? 50;
  const left = drop?.stockLeft ?? total;
  const started = drop ? new Date(drop.startedAt).getTime() : null;
  const ended = drop?.endedAt ? new Date(drop.endedAt).getTime() : null;
  const since = started ? (ended ?? now) - started : 0;

  return (
    <section
      style={{
        flex: "none",
        background: "#FFFFFF",
        borderBottom: "1px solid #E4E2DC",
        padding: "16px 24px",
        display: "grid",
        gridTemplateColumns: "minmax(300px,1.4fr) 280px 130px 210px auto",
        gap: 32,
        alignItems: "center",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        <div
          aria-hidden="true"
          style={{
            width: 54,
            height: 54,
            flex: "none",
            borderRadius: 10,
            background: "repeating-linear-gradient(135deg,#ECEAE4 0 6px,#F4F3EF 6px 12px)",
            border: "1px solid #E4E2DC",
            display: "grid",
            placeItems: "center",
            font: "500 10px var(--mono)",
            color: "#6B6E76",
          }}
        >
          IMG
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>Night Shift Hoodie drop</span>
            {phase === "live" && (
              <span style={{ ...pill, gap: 6, background: "#FDEAE7", color: "#B42318" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#B42318", animation: "dm-pulse 1.6s infinite" }} />
                LIVE
              </span>
            )}
            {phase === "before" && <span style={{ ...pill, background: "#F1F0EC", color: "#4A4D55" }}>READY</span>}
            {phase === "soldout" && <span style={{ ...pill, background: "#15171C", color: "#FFFFFF" }}>SOLD OUT</span>}
          </div>
          <div style={{ fontSize: 14, color: "#4A4D55", marginTop: 3 }}>
            {money(drop?.priceCents ?? 6800)} · {perCustomer} per customer · {total} units
          </div>
        </div>
      </div>

      <StockBar left={left} total={total} />

      <div>
        <div className="label" style={{ letterSpacing: ".06em" }}>
          Since start
        </div>
        <div className="mono" style={{ fontSize: 22, fontWeight: 600, marginTop: 2 }}>
          {elapsed(since)}
        </div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span className="label" style={{ letterSpacing: ".06em" }}>
            Requests/sec
          </span>
          <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>
            {phase === "before" ? 0 : Math.round(rps.at(-1) ?? 0)}
          </span>
        </div>
        <Sparkline samples={rps} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
        {phase !== "before" && !running && (
          <button type="button" className="btn btn-ghost" style={{ height: 44, padding: "0 14px", fontSize: 14, fontWeight: 500, borderRadius: 10 }} onClick={onReset}>
            Reset
          </button>
        )}
        {running ? (
          <button
            type="button"
            disabled
            style={{ height: 48, padding: "0 20px", border: "1.5px solid #15171C", background: "#FFFFFF", color: "#15171C", fontSize: 15, fontWeight: 600, borderRadius: 12, display: "flex", alignItems: "center", gap: 10, opacity: 1 }}
          >
            <Spinner size={15} />
            Agents arriving…
          </button>
        ) : (
          <button
            type="button"
            onClick={onRun}
            className="dm-run"
            style={{
              height: 48,
              padding: "0 22px 0 18px",
              border: 0,
              background: "#15171C",
              color: "#FFFFFF",
              fontSize: 16,
              fontWeight: 600,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              gap: 10,
              boxShadow: "0 1px 0 rgba(255,255,255,.12) inset,0 6px 16px rgba(21,23,28,.22)",
            }}
          >
            <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#FFFFFF", display: "grid", placeItems: "center" }}>
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M2.5 1.3l6 3.7-6 3.7z" fill="#15171C" />
              </svg>
            </span>
            {phase === "before" ? "Run the drop" : "Run it again"}
          </button>
        )}
      </div>
    </section>
  );
}
