// Screen 4: a customer links their AI assistant (gives it an agent pass), and manages passes.
// /link: the customer picks the agent. /link/:id: an agent sent the customer a link.
// /passes: My passes.
import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { api, ApiError, loginHref, type AgentInfo, type Customer, type LinkRequest, type Pass } from "../lib/api";
import { expiresIn, money, shortId } from "../lib/format";
import { Skeleton } from "../ui/bits";
import { BigButton, MobileShell, PayPalLoginButton } from "../ui/mobile";
import { AgentAvatar, ICON, Icon, IDENTITY } from "../ui/status";
import { useToast } from "../ui/toast";

const CAPS = [5000, 15000, 30000];
const DAYS = [
  { days: 1 as const, label: "24 hours" },
  { days: 7 as const, label: "7 days" },
  { days: 30 as const, label: "30 days" },
];

const navText = (text: string) => <span style={{ fontSize: 14, fontWeight: 500, color: "#4A4D55" }}>{text}</span>;

// Who's logged in, or null; undefined while loading.
function useCustomer() {
  const [customer, setCustomer] = useState<Customer | null | undefined>(undefined);
  const [unreachable, setUnreachable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setUnreachable(false);
    api
      .me()
      .then(setCustomer)
      .catch(() => setUnreachable(true));
  }, [attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { customer, setCustomer, unreachable, retry };
}

function Unreachable({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center", gap: 10 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Couldn't reach Doorman</h1>
      <div style={{ fontSize: 15.5, color: "#4A4D55", lineHeight: 1.5 }}>The server didn't respond. Check it's running, then try again.</div>
      <div style={{ marginTop: 12 }}>
        <BigButton variant="secondary" onClick={onRetry}>
          Try again
        </BigButton>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Skeleton width="100%" height={4} radius={2} />
      <Skeleton width="80%" height={28} />
      <Skeleton width="100%" height={60} />
      <Skeleton width="100%" height={120} radius={14} />
    </div>
  );
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }} aria-label={`Step ${step} of 3`}>
      {["Log in", "Agent", "Limits"].map((label, i) => (
        <div key={label}>
          <div style={{ height: 4, borderRadius: 2, background: i < step ? "#15171C" : "#E4E2DC" }} />
          <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 6, color: i < step ? "#15171C" : "#6B6E76" }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

function Choice({ selected, onClick, children, mono }: { selected: boolean; onClick: () => void; children: React.ReactNode; mono?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      style={{
        height: 48,
        borderRadius: 12,
        border: selected ? "2px solid #15171C" : "1.5px solid #D3D0C8",
        background: selected ? "#15171C" : "#FFFFFF",
        color: selected ? "#FFFFFF" : "#15171C",
        fontFamily: mono ? "var(--mono)" : "inherit",
        fontSize: 15,
        fontWeight: selected ? 600 : 500,
      }}
    >
      {children}
    </button>
  );
}

// 4a / 4b: log in with PayPal first.
function LoginStep({ title, intro, failed, stepper }: { title: string; intro: React.ReactNode; failed: boolean; stepper: boolean }) {
  return (
    <>
      {stepper && <Stepper step={1} />}
      <h1 style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.2, letterSpacing: "-0.015em", margin: "6px 0 0", textWrap: "balance" }}>{title}</h1>
      <div style={{ fontSize: 16, lineHeight: 1.5, color: "#4A4D55" }}>{intro}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, background: "#F4F3EF", borderRadius: 14 }}>
        {["You approve every purchase in PayPal.", "Your agent can't spend over your cap.", "Revoke the pass any time."].map((line, i) => (
          <div key={line} style={{ display: "flex", gap: 11, fontSize: 15, lineHeight: 1.4 }}>
            <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: "#6B6E76", width: 18, paddingTop: 2 }}>
              0{i + 1}
            </span>
            {line}
          </div>
        ))}
      </div>
      {failed && (
        <div role="alert" style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", borderRadius: 12, background: "#FDEAE7", border: "1px solid #F2BBB4", color: "#8E1B12", fontSize: 15, lineHeight: 1.4 }}>
          <Icon d="M8 5v3.4M8 10.8v.2" color="#B42318" size={18} width={1.8} />
          PayPal login didn't complete. Try again.
        </div>
      )}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        <PayPalLoginButton href={loginHref(location.pathname)} />
        <div style={{ fontSize: 13.5, color: "#6B6E76", textAlign: "center" }}>Doorman never sees your PayPal password.</div>
      </div>
    </>
  );
}

function LoggedInBanner({ customer }: { customer: Customer }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 12, background: "#E4F4EA", fontSize: 14.5, color: "#0B4F2E" }}>
      <Icon d={ICON.check} color="#0F6B3E" size={16} width={2.2} />
      <span>
        Logged in as <b>{customer.name ?? customer.email}</b>
        {customer.verified ? " · Verified PayPal account" : ""}
      </span>
    </div>
  );
}

function AgentOption({ agent, selected, onSelect }: { agent: AgentInfo; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        minHeight: 62,
        padding: "0 14px",
        borderRadius: 14,
        border: selected ? "2px solid #15171C" : "1px solid #E4E2DC",
        background: selected ? "#FAF9F6" : "#FFFFFF",
        textAlign: "left",
        color: "#15171C",
      }}
    >
      <AgentAvatar name={agent.name} size={40} />
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", fontSize: 16, fontWeight: 600 }}>{agent.name}</span>
        <span style={{ display: "block", fontSize: 13.5, color: "#4A4D55" }}>by {agent.operator}</span>
      </span>
      <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: "50%", border: selected ? "7px solid #15171C" : "1.5px solid #A3A6AD" }} />
    </button>
  );
}

// "Paste your agent's key": link an agent that isn't in the list by its key ID.
function PasteKey({ onFound }: { onFound: (agent: AgentInfo) => void }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    setBusy(true);
    setError(null);
    try {
      onFound(await api.agent(key.trim()));
      setOpen(false);
      setKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't find that agent.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 52, padding: "0 14px", borderRadius: 14, border: "1.5px dashed #D3D0C8", background: "#FFFFFF", color: "#15171C", textAlign: "left" }}
      >
        <Icon d={IDENTITY.signed.icon} color="#4A4D55" size={16} width={1.6} />
        <span style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>Paste your agent's key</span>
        <span style={{ fontSize: 12.5, color: "#6B6E76" }}>Advanced</span>
      </button>
    );
  }
  return (
    <form onSubmit={find} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14, borderRadius: 14, border: "1.5px dashed #D3D0C8" }}>
      <label htmlFor="agent-key" style={{ fontSize: 14, fontWeight: 600 }}>
        Your agent's key ID
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          id="agent-key"
          autoFocus
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="e.g. 8f3kQ…v2Qa"
          spellCheck={false}
          style={{ flex: 1, minWidth: 0, height: 44, borderRadius: 10, border: "1.5px solid #D3D0C8", padding: "0 12px", fontSize: 14, fontFamily: "var(--mono)" }}
        />
        <button type="submit" disabled={busy || !key.trim()} className="btn btn-secondary" style={{ height: 44 }}>
          {busy ? "Finding…" : "Find"}
        </button>
      </div>
      <div style={{ fontSize: 13, color: error ? "#8E1B12" : "#6B6E76", lineHeight: 1.4 }} role={error ? "alert" : undefined}>
        {error ?? "Your agent shows its key ID when it registers with a store."}
      </div>
    </form>
  );
}

function PassCard({ pass, holder }: { pass: Pass; holder: string }) {
  return (
    <div style={{ borderRadius: 20, background: "#15171C", color: "#FFFFFF", padding: 20, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", right: -30, top: -30, width: 140, height: 140, borderRadius: "50%", border: "1px solid rgba(255,255,255,.1)" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "#C9CBD1" }}>Agent pass</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 22, padding: "0 9px", borderRadius: 999, background: "rgba(123,211,160,.16)", color: "#9BE0B8", fontSize: 12, fontWeight: 700 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7BD3A0" }} />
          Active
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
        <AgentAvatar name={pass.agentName} size={44} />
        <div>
          <div style={{ fontSize: 19, fontWeight: 600 }}>{pass.agentName}</div>
          <div style={{ fontSize: 14, color: "#C9CBD1" }}>{pass.operator} → Static Supply</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 20, paddingTop: 16, borderTop: "1px dashed rgba(255,255,255,.22)" }}>
        <div>
          <div style={{ fontSize: 12.5, color: "#C9CBD1" }}>Cap per purchase</div>
          <div className="mono" style={{ fontSize: 20, fontWeight: 600, marginTop: 2 }}>
            {money(pass.capCents)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12.5, color: "#C9CBD1" }}>Expires</div>
          <div style={{ fontSize: 17, fontWeight: 600, marginTop: 4 }}>{expiresIn(pass.expiresAt)}</div>
        </div>
      </div>
      <div className="mono" style={{ fontSize: 12, color: "#A9ABB1", marginTop: 16 }}>
        Holder {holder} · Key {shortId(pass.agentKeyId)}
      </div>
    </div>
  );
}

export default function LinkAgent() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { customer, unreachable, retry } = useCustomer();
  const [request, setRequest] = useState<LinkRequest | null | undefined>(id ? undefined : null);
  const [agents, setAgents] = useState<AgentInfo[] | null>(null);
  const [selected, setSelected] = useState<AgentInfo | null>(null);
  const [step, setStep] = useState<"agent" | "limits" | "created">("agent");
  const [cap, setCap] = useState(15000);
  const [custom, setCustom] = useState<string | null>(null);
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [created, setCreated] = useState<Pass | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestFailed, setRequestFailed] = useState(false);

  // An agent's link names the agent; otherwise the customer picks from the list.
  useEffect(() => {
    if (!id) return;
    setRequestFailed(false);
    api
      .linkRequest(id)
      .then((r) => {
        setRequest(r);
        setSelected(r.agent);
      })
      .catch((err: unknown) => (err instanceof ApiError && err.status === 404 ? setRequest(null) : setRequestFailed(true)));
  }, [id, customer]);

  useEffect(() => {
    if (id || !customer) return;
    api.agents().then(
      (list) => {
        setAgents(list);
        setSelected((s) => s ?? list[0] ?? null);
      },
      () => setAgents([]),
    );
  }, [id, customer]);

  const capCents = custom != null ? Math.round(Number(custom) * 100) : cap;
  const capValid = Number.isFinite(capCents) && capCents >= 100 && capCents <= 1_000_000;
  const until = new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  async function createPass() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const pass = id ? (await api.approveLink(id, capCents, days)).pass : await api.createPass(selected.keyId, capCents, days);
      setCreated({ ...pass, agentName: selected.name, operator: selected.operator, agentKeyId: selected.keyId, usedCents: 0 });
      setStep("created");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the pass");
    } finally {
      setSaving(false);
    }
  }

  const loading = customer === undefined || request === undefined || (customer && !id && agents === null);
  const nav = step === "created" ? "Done" : !customer ? "Step 1 of 3" : step === "agent" ? "Step 2 of 3" : "Step 3 of 3";
  const stale = id && (!request || request.status !== "pending") && step !== "created";

  return (
    <MobileShell brand="doorman" right={navText(nav)}>
      {unreachable || requestFailed ? (
        <Unreachable onRetry={retry} />
      ) : loading ? (
        <PageSkeleton />
      ) : stale ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center", gap: 10 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{!request ? "This link isn't valid" : request.status === "expired" ? "This link has expired" : "This link was already used"}</h1>
          <div style={{ fontSize: 16, color: "#4A4D55", lineHeight: 1.5 }}>Ask your agent for a new one, or pick your agent yourself.</div>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <BigButton href="/link">Link an agent</BigButton>
            <BigButton href="/passes" variant="plain">
              View my passes
            </BigButton>
          </div>
        </div>
      ) : !customer ? (
        <LoginStep
          stepper
          failed={params.get("login") === "failed"}
          title="Let your AI assistant shop at Static Supply"
          intro={
            <>
              You'll give {request?.agent.name ?? "it"} an <b style={{ color: "#15171C" }}>agent pass</b>: permission to buy here, with a spending cap and an expiry date.
            </>
          }
        />
      ) : step === "agent" ? (
        <>
          <Stepper step={2} />
          <LoggedInBanner customer={customer} />
          {request ? (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>Confirm your agent</h1>
              <AgentOption agent={request.agent} selected onSelect={() => {}} />
              <div style={{ fontSize: 15, lineHeight: 1.5, color: "#4A4D55" }}>
                <b style={{ color: "#15171C" }}>{request.agent.name}</b> asked to shop for you at Static Supply. Doorman checks its signing key <span className="mono">{shortId(request.agent.keyId)}</span> on every request.
              </div>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>Choose your agent</h1>
              <div role="radiogroup" aria-label="Your agent" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[...(agents ?? []), ...(selected && !agents?.some((a) => a.keyId === selected.keyId) ? [selected] : [])].map((agent) => (
                  <AgentOption key={agent.keyId} agent={agent} selected={selected?.keyId === agent.keyId} onSelect={() => setSelected(agent)} />
                ))}
                <PasteKey onFound={setSelected} />
              </div>
            </>
          )}
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            <BigButton onClick={() => setStep("limits")} disabled={!selected}>
              {selected ? `Continue with ${selected.name}` : "Choose an agent"}
            </BigButton>
            {request && (
              <BigButton href="/link" variant="plain">
                This isn't my agent
              </BigButton>
            )}
          </div>
        </>
      ) : step === "limits" && selected ? (
        <>
          <Stepper step={3} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: "#F4F3EF" }}>
            <AgentAvatar name={selected.name} size={40} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{selected.name}</div>
              <div style={{ fontSize: 13.5, color: "#4A4D55" }}>by {selected.operator}</div>
            </div>
            <button type="button" onClick={() => setStep("agent")} style={{ border: 0, background: "transparent", fontSize: 14, fontWeight: 500, color: "#4A4D55" }}>
              Change
            </button>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>Set limits</h1>
          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend style={{ fontSize: 15, fontWeight: 600, marginBottom: 9, padding: 0 }}>Spending cap per purchase</legend>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
              {CAPS.map((c) => (
                <Choice
                  key={c}
                  mono
                  selected={custom == null && cap === c}
                  onClick={() => {
                    setCustom(null);
                    setCap(c);
                  }}
                >
                  {money(c)}
                </Choice>
              ))}
              <Choice selected={custom != null} onClick={() => setCustom(custom ?? "100")}>
                Custom
              </Choice>
            </div>
            {custom != null && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 15 }}>
                <span>$</span>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  inputMode="decimal"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  aria-label="Custom cap in dollars"
                  style={{ flex: 1, height: 44, borderRadius: 10, border: "1.5px solid #D3D0C8", padding: "0 12px", fontSize: 16, fontFamily: "var(--mono)" }}
                />
              </label>
            )}
          </fieldset>
          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend style={{ fontSize: 15, fontWeight: 600, marginBottom: 9, padding: 0 }}>Expires</legend>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {DAYS.map((d) => (
                <Choice key={d.days} selected={days === d.days} onClick={() => setDays(d.days)}>
                  {d.label}
                </Choice>
              ))}
            </div>
          </fieldset>
          <div style={{ padding: "14px 16px", borderRadius: 14, border: "1px solid #E4E2DC", fontSize: 15, lineHeight: 1.5, color: "#4A4D55" }}>
            {selected.name} can buy at Static Supply for up to <b style={{ color: "#15171C" }}>{capValid ? money(capCents) : "—"} per purchase</b> until <b style={{ color: "#15171C" }}>{until}</b>. You still approve each payment in PayPal.
          </div>
          {error && (
            <div role="alert" style={{ fontSize: 14.5, color: "#8E1B12" }}>
              {error}
            </div>
          )}
          <div style={{ marginTop: "auto" }}>
            <BigButton onClick={() => void createPass()} disabled={!capValid || saving}>
              {saving ? "Creating pass…" : "Create pass"}
            </BigButton>
          </div>
        </>
      ) : (
        created && (
          <>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10, paddingTop: 12 }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#0F6B3E", display: "grid", placeItems: "center" }}>
                <Icon d={ICON.check} color="#FFFFFF" size={28} />
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.015em", margin: 0 }}>Pass created</h1>
              <div style={{ fontSize: 15.5, color: "#4A4D55" }}>{created.agentName} can now shop for you at Static Supply.</div>
            </div>
            <PassCard pass={created} holder={customer.name ?? customer.email ?? "You"} />
            <div style={{ fontSize: 14.5, color: "#4A4D55", textAlign: "center" }}>You can revoke this any time.</div>
            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
              <BigButton href="/passes">View my passes</BigButton>
              <BigButton href="/store" variant="plain">
                Back to Static Supply
              </BigButton>
            </div>
          </>
        )
      )}
    </MobileShell>
  );
}

function passStatus(p: Pass): "Active" | "Revoked" | "Expired" {
  if (p.revokedAt) return "Revoked";
  if (new Date(p.expiresAt) <= new Date()) return "Expired";
  return "Active";
}

// Every live pass, plus the latest ended one for agents that no longer have a live pass.
function shownPasses(passes: Pass[]): Pass[] {
  const active = passes.filter((p) => passStatus(p) === "Active");
  const ended = new Map<string, Pass>();
  for (const p of passes) {
    if (passStatus(p) === "Active" || active.some((a) => a.agentKeyId === p.agentKeyId) || ended.has(p.agentKeyId)) continue;
    ended.set(p.agentKeyId, p);
  }
  return [...active, ...ended.values()];
}

function PassRow({ pass, onRevoke }: { pass: Pass; onRevoke: () => void }) {
  const status = passStatus(pass);
  const active = status === "Active";
  const expires = active ? expiresIn(pass.expiresAt).replace(/^in /, "") : status === "Expired" ? new Date(pass.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
  return (
    <div style={{ border: "1px solid #E4E2DC", borderRadius: 16, padding: 16, background: active ? "#FFFFFF" : "#FAF9F6", opacity: active ? 1 : 0.62 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <AgentAvatar name={pass.agentName} size={40} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{pass.agentName}</div>
          <div style={{ fontSize: 13.5, color: "#4A4D55" }}>at Static Supply</div>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 24, padding: "0 9px", borderRadius: 999, background: active ? "#E4F4EA" : "#F1F0EC", color: active ? "#0F6B3E" : "#55585F", fontSize: 12.5, fontWeight: 700 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: active ? "#0F6B3E" : "#55585F" }} />
          {status}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 14, fontSize: 13, color: "#6B6E76" }}>
        {[
          ["Cap", money(pass.capCents), true],
          ["Used", money(pass.usedCents), true],
          ["Expires", expires, false],
        ].map(([label, value, mono]) => (
          <div key={String(label)}>
            {label}
            <div className={mono ? "mono" : undefined} style={{ fontSize: 15, fontWeight: 600, color: "#15171C", marginTop: 2 }}>
              {value}
            </div>
          </div>
        ))}
      </div>
      {active && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12, paddingTop: 10, borderTop: "1px solid #EEEDE8" }}>
          <button type="button" onClick={onRevoke} style={{ height: 36, padding: "0 12px", border: 0, borderRadius: 9, background: "transparent", color: "#B42318", fontSize: 14.5, fontWeight: 600 }}>
            Revoke
          </button>
        </div>
      )}
    </div>
  );
}

function PassesSkeleton() {
  return (
    <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Skeleton width={140} height={26} />
        <Skeleton width={80} height={16} />
      </div>
      {[1, 0.7, 0.45].map((op) => (
        <div key={op} style={{ border: "1px solid #E4E2DC", borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 16, opacity: op }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Skeleton width={40} height={40} radius={10} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
              <Skeleton width="40%" height={13} radius={5} />
              <Skeleton width="60%" height={11} radius={5} />
            </div>
            <Skeleton width={62} height={24} radius={999} />
          </div>
          <Skeleton width="100%" height={28} />
        </div>
      ))}
    </div>
  );
}

// 4f–4h: My passes, with revoke.
export function Passes() {
  const [params] = useSearchParams();
  const { customer, setCustomer, unreachable, retry } = useCustomer();
  const [passes, setPasses] = useState<Pass[] | null>(null);
  const [revoking, setRevoking] = useState<Pass | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!customer) return;
    api
      .passes()
      .then(setPasses)
      .catch(() => {
        setPasses([]);
        toast("Couldn't load your passes. Refresh to try again.");
      });
  }, [customer, toast]);

  async function revoke(pass: Pass) {
    setRevoking(null);
    try {
      await api.revokePass(pass.id);
      setPasses(await api.passes());
      toast(`${pass.agentName}'s pass is revoked`);
    } catch {
      toast("Couldn't revoke the pass. Try again.");
    }
  }

  async function logout() {
    await api.logout();
    setCustomer(null);
    setPasses(null);
  }

  const shown = passes && shownPasses(passes);

  return (
    <MobileShell brand="doorman" right={navText("My passes")}>
      {unreachable ? (
        <Unreachable onRetry={retry} />
      ) : customer === undefined ? (
        <PassesSkeleton />
      ) : !customer ? (
        <LoginStep
          stepper={false}
          failed={params.get("login") === "failed"}
          title="Manage your agent passes"
          intro={
            <>
              An <b style={{ color: "#15171C" }}>agent pass</b> lets your AI assistant buy at Static Supply, with a spending cap and an expiry date. Log in to see and revoke yours.
            </>
          }
        />
      ) : !shown ? (
        <PassesSkeleton />
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.015em", margin: 0 }}>My passes</h1>
            <span style={{ fontSize: 14, color: "#4A4D55", textAlign: "right" }}>
              {customer.name ?? customer.email} ·{" "}
              <button type="button" onClick={() => void logout()} style={{ border: 0, background: "transparent", padding: 0, fontSize: 14, color: "#4A4D55", textDecoration: "underline" }}>
                Log out
              </button>
            </span>
          </div>
          {shown.length === 0 ? (
            <div style={{ border: "1.5px dashed #D3D0C8", borderRadius: 16, padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>No passes yet</div>
              <div style={{ fontSize: 14.5, color: "#4A4D55", marginTop: 6, lineHeight: 1.5 }}>Link your AI assistant to let it shop at Static Supply for you.</div>
            </div>
          ) : (
            shown.map((p) => <PassRow key={p.id} pass={p} onRevoke={() => setRevoking(p)} />)
          )}
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            <BigButton href="/link" variant="secondary">
              Link {shown.some((p) => passStatus(p) === "Active") ? "another" : "an"} agent
            </BigButton>
            <BigButton href="/store" variant="plain">
              Back to Static Supply
            </BigButton>
          </div>

          {revoking && (
            <div role="dialog" aria-modal="true" aria-labelledby="revoke-title" style={{ position: "fixed", inset: 0, zIndex: 25, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
              <div onClick={() => setRevoking(null)} style={{ position: "absolute", inset: 0, background: "rgba(21,23,28,.4)", animation: "dm-fade .25s ease both" }} />
              <div style={{ position: "relative", width: "100%", maxWidth: 440, background: "#FFFFFF", borderRadius: "24px 24px 0 0", padding: "12px 20px 20px", display: "flex", flexDirection: "column", gap: 12, animation: "dm-fade .3s ease both" }}>
                <span style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, background: "#D3D0C8" }} />
                <div id="revoke-title" style={{ fontSize: 21, fontWeight: 600, marginTop: 6 }}>
                  Revoke {revoking.agentName}'s pass?
                </div>
                <div style={{ fontSize: 16, lineHeight: 1.5, color: "#4A4D55" }}>{revoking.agentName} will no longer be able to buy for you at Static Supply.</div>
                <div style={{ marginTop: 6 }}>
                  <BigButton variant="danger" onClick={() => void revoke(revoking)}>
                    Revoke pass
                  </BigButton>
                </div>
                <BigButton variant="plain" onClick={() => setRevoking(null)}>
                  Keep it
                </BigButton>
              </div>
            </div>
          )}
        </>
      )}
    </MobileShell>
  );
}
