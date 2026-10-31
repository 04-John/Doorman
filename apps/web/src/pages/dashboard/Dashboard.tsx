// Screen 1: live agent dashboard (with Screen 2, the detail panel).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Dashboard as Summary, type Decision, type DoorEvent, type Tier, type Transcript } from "../../lib/api";
import { duration, money } from "../../lib/format";
import { KpiTile, Skeleton } from "../../ui/bits";
import { MerchantTopBar } from "../../ui/chrome";
import { DECISION, ICON, IDENTITY } from "../../ui/status";
import { useToast } from "../../ui/toast";
import { AvaChat } from "./AvaChat";
import { DetailPanel } from "./DetailPanel";
import { DropStrip, type Phase } from "./DropStrip";
import { moneyAfter, toRow, type Row } from "./rows";
import { TrafficGrid } from "./TrafficGrid";

const FRESH_MS = 2700;

function BootSkeleton() {
  return (
    <main aria-busy="true" aria-label="Loading dashboard" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 14, padding: "18px 24px 20px" }}>
      <div style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 12 }}>
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="card" style={{ padding: "15px 16px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
            <Skeleton width="62%" height={12} />
            <Skeleton width="42%" height={24} />
          </div>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ height: 36, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
            <Skeleton width={180} height={16} />
            <Skeleton width="min(560px,60%)" height={36} radius={10} />
          </div>
          <div className="card" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <div style={{ height: 42, background: "#FAF9F6", borderBottom: "1px solid #E4E2DC" }} />
            {[1, 0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.44, 0.36, 0.28].map((op) => (
              <div key={op} style={{ height: 46, display: "flex", alignItems: "center", gap: 22, padding: "0 16px", borderBottom: "1px solid #EEEDE8", opacity: op }}>
                <Skeleton width={58} height={11} radius={5} />
                <Skeleton width={26} height={26} radius={7} />
                <Skeleton width={84} height={12} radius={5} />
                <Skeleton width={118} height={24} />
                <Skeleton width={64} height={11} radius={5} />
                <Skeleton width={92} height={24} radius={999} />
                <Skeleton width="30%" height={11} radius={5} />
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ width: 340, flex: "none", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
          <Skeleton width="60%" height={30} radius={8} />
          <Skeleton width="88%" height={54} radius={14} />
          <Skeleton width="100%" height={58} radius={10} />
          <Skeleton width="100%" height={58} radius={10} />
          <Skeleton width="76%" height={72} radius={14} style={{ alignSelf: "flex-end" }} />
        </div>
      </div>
    </main>
  );
}

function Segmented<T extends string>({ label, options, value, counts, onChange }: { label: string; options: { value: T; label: string }[]; value: T; counts: Record<string, number>; onChange: (v: T) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#6B6E76" }}>{label}</span>
      <div className="segmented" role="group" aria-label={`Filter by ${label.toLowerCase()}`}>
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
            {o.label}
            <span className="count">{counts[o.value] ?? 0}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [perCustomer, setPerCustomer] = useState(1);
  const [booting, setBooting] = useState(true);
  const [decision, setDecision] = useState<Decision | "all">("all");
  const [tier, setTier] = useState<Tier | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [rps, setRps] = useState<number[]>([]);
  const dropId = useRef<string | null>(null);
  const hits = useRef<number[]>([]);
  const summaryTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useToast();

  const refreshSummary = useCallback(async () => setSummary(await api.dashboard()), []);

  const reloadAll = useCallback(async () => {
    const [s, events, t] = await Promise.all([api.dashboard(), api.events(), api.transcript()]);
    setSummary(s);
    setTranscript(t);
    dropId.current = s.drop?.id ?? null;
    setRows(events.flatMap((e) => toRow(e) ?? []));
  }, []);

  // First load: show the skeleton for at least 0.8s so nothing jumps.
  useEffect(() => {
    const started = Date.now();
    Promise.all([reloadAll(), api.rules().then((r) => setPerCustomer(r.policy.dropLimitPerCustomer))])
      .catch(() => toast("Couldn't reach the Doorman server. Is it running?"))
      .finally(() => setTimeout(() => setBooting(false), Math.max(0, 800 - (Date.now() - started))));
  }, [reloadAll, toast]);

  // Live feed: every decision appears the moment it's made.
  useEffect(() => {
    const source = new EventSource("/api/events/stream");
    source.addEventListener("event", (msg) => {
      const event = JSON.parse((msg as MessageEvent<string>).data) as DoorEvent;
      if (!event.dropId) return;
      hits.current.push(Date.now());
      if (event.dropId !== dropId.current) {
        dropId.current = event.dropId;
        void reloadAll();
        return;
      }
      setRows((prev) => {
        const after = moneyAfter(event);
        const next = after && event.orderId ? prev.map((r) => (r.orderId === event.orderId && r.action === "Checkout" ? { ...r, money: after } : r)) : prev;
        const row = toRow(event, true);
        return row ? [row, ...next] : next;
      });
      clearTimeout(summaryTimer.current);
      summaryTimer.current = setTimeout(() => void refreshSummary(), 400);
    });
    return () => source.close();
  }, [reloadAll, refreshSummary]);

  // Clock, requests/sec sampling, fading new-row flashes, and a slow refresh of totals.
  useEffect(() => {
    let tick = 0;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      hits.current = hits.current.filter((h) => t - h < 1000);
      setRps((prev) => [...prev, hits.current.length].slice(-48));
      setRows((prev) => (prev.some((r) => r.freshAt && t - r.freshAt > FRESH_MS) ? prev.map((r) => (r.freshAt && t - r.freshAt > FRESH_MS ? { ...r, freshAt: null } : r)) : prev));
      if (++tick % 4 === 0) {
        void refreshSummary().catch(() => {});
        void api.transcript().then(setTranscript).catch(() => {});
      }
    }, 500);
    return () => clearInterval(timer);
  }, [refreshSummary]);

  const drop = summary?.drop ?? null;
  const phase: Phase = !drop ? "before" : drop.stockLeft === 0 ? "soldout" : "live";
  const running = summary?.simulationRunning ?? false;

  async function run() {
    try {
      setSelected(null);
      const { dropId: id } = await api.runDrop();
      dropId.current = id;
      setRows([]);
      setRps([]);
      setTranscript(null);
      await refreshSummary();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't start the drop");
    }
  }

  async function reset() {
    try {
      setSelected(null);
      await api.resetDrop();
      dropId.current = null;
      setRows([]);
      setRps([]);
      setTranscript(null);
      await refreshSummary();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't reset");
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) {
      c[r.decision] = (c[r.decision] ?? 0) + 1;
      c[r.tier] = (c[r.tier] ?? 0) + 1;
    }
    return c;
  }, [rows]);
  const tierCounts = useMemo(() => ({ ...counts, all: rows.length }), [counts, rows.length]);

  const visible = useMemo(() => rows.filter((r) => (decision === "all" || r.decision === decision) && (tier === "all" || r.tier === tier)), [rows, decision, tier]);

  const k = summary?.kpis;
  const kpis = [
    { label: "Agents seen", value: k?.agentsSeen ?? 0, icon: ICON.people, fg: "#15171C", bg: "#EEEDE8" },
    { label: "Allowed", value: k?.allowed ?? 0, icon: DECISION.allowed.icon, fg: DECISION.allowed.fg, bg: DECISION.allowed.bg },
    { label: "Step up", value: k?.stepUp ?? 0, icon: DECISION.step_up.icon, fg: DECISION.step_up.fg, bg: DECISION.step_up.bg },
    { label: "Throttled", value: k?.throttled ?? 0, icon: DECISION.throttled.icon, fg: DECISION.throttled.fg, bg: DECISION.throttled.bg },
    { label: "Blocked", value: k?.blocked ?? 0, icon: DECISION.blocked.icon, fg: DECISION.blocked.fg, bg: DECISION.blocked.bg },
    // Agent orders wait for the customer in PayPal; a hold only lasts the seconds it takes to run the final checks.
    { label: "Awaiting approval", value: money((k?.awaitingApprovalCents ?? 0) + (k?.heldCents ?? 0)), icon: ICON.dollar, fg: "#8A5300", bg: "#FDF1DC" },
    { label: "Charged", value: money(k?.chargedCents ?? 0), icon: ICON.dollar, fg: "#0F6B3E", bg: "#E4F4EA" },
  ];

  const overlay =
    rows.length === 0 ? (
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "auto" }}>
        <div style={{ textAlign: "center", maxWidth: 380, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, border: "1.5px dashed #C9C6BD", display: "grid", placeItems: "center" }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 21V10a7 7 0 0 1 14 0v11" stroke="#8E919A" strokeWidth="1.6" />
              <path d="M2.5 21h19" stroke="#8E919A" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{running ? "Agents are on their way" : "No agents yet"}</div>
          <div style={{ fontSize: 15, lineHeight: 1.5, color: "#4A4D55" }}>
            {running ? (
              "The first requests will appear here in a moment."
            ) : (
              <>
                Press <b style={{ color: "#15171C" }}>Run the drop</b> to simulate launch traffic. Every agent that reaches the store will appear here with Doorman's decision.
              </>
            )}
          </div>
          {!running && (
            <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 6 }} onClick={run}>
              Run the drop
            </button>
          )}
        </div>
      </div>
    ) : visible.length === 0 ? (
      <div style={{ padding: 48, textAlign: "center", fontSize: 15, color: "#4A4D55" }}>No requests match these filters yet.</div>
    ) : null;

  return (
    <div data-screen-label="1 Dashboard" style={{ height: "100vh", minWidth: 1360, display: "flex", flexDirection: "column", background: "#F4F3EF", overflow: "hidden" }}>
      <MerchantTopBar />
      <DropStrip summary={summary} phase={phase} perCustomer={perCustomer} now={now} rps={rps} running={running} onRun={run} onReset={reset} />

      {booting ? (
        <BootSkeleton />
      ) : (
        <main style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 14, padding: "18px 24px 20px" }}>
          {phase === "soldout" && drop && (
            <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderRadius: 12, background: "#15171C", color: "#FFFFFF" }}>
              <span style={{ width: 30, height: 30, borderRadius: "50%", background: "#2FA66A", display: "grid", placeItems: "center" }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d={ICON.check} stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span style={{ fontSize: 17, fontWeight: 600 }}>Sold out in {duration(new Date(drop.endedAt ?? now).getTime() - new Date(drop.startedAt).getTime())}</span>
              <span style={{ fontSize: 16, color: "#C9CBD1" }}>
                {drop.sold} sold to verified customers · {k?.botsBlocked ?? 0} bots blocked
              </span>
              <button type="button" onClick={run} style={{ marginLeft: "auto", height: 36, padding: "0 14px", border: "1px solid rgba(255,255,255,.3)", background: "transparent", color: "#FFFFFF", fontSize: 14, fontWeight: 600, borderRadius: 9 }}>
                Run it again
              </button>
            </div>
          )}

          <div style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 12 }}>
            {kpis.map((kpi) => (
              <KpiTile key={kpi.label} {...kpi} />
            ))}
          </div>

          <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 14 }}>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ flex: "none", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 20px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>Live traffic</span>
                  <span className="mono" style={{ fontSize: 13, color: "#6B6E76" }}>
                    {rows.length} requests
                  </span>
                </div>
                <div style={{ marginLeft: "auto" }}>
                  <Segmented
                    label="Decision"
                    value={decision}
                    onChange={setDecision}
                    counts={counts}
                    options={[{ value: "all" as const, label: "All" }, ...(Object.keys(DECISION) as Decision[]).map((d) => ({ value: d, label: DECISION[d].label }))]}
                  />
                </div>
                <Segmented
                  label="Identity"
                  value={tier}
                  onChange={setTier}
                  counts={tierCounts}
                  options={[{ value: "all" as const, label: "All" }, ...(Object.keys(IDENTITY) as Tier[]).map((t) => ({ value: t, label: IDENTITY[t].label }))]}
                />
              </div>
              <TrafficGrid rows={visible} chatOpen={chatOpen} selectedId={selected} onSelect={setSelected} overlay={overlay} />
            </div>
            <AvaChat transcript={transcript} live={phase === "live"} open={chatOpen} onToggle={() => setChatOpen((o) => !o)} />
          </div>
        </main>
      )}

      <DetailPanel eventId={selected} perCustomer={perCustomer} onClose={() => setSelected(null)} onChanged={() => void reloadAll()} />
    </div>
  );
}
