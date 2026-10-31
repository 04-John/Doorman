// Screen 4: a customer links their AI assistant (agent pass), and manages passes.
// /link/:id comes from an agent asking to be linked; /link alone shows "My passes".
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { api, ApiError, loginHref, type Customer, type LinkRequest, type Pass } from "../lib/api";
import { expiresIn, money, shortId } from "../lib/format";
import { Skeleton } from "../ui/bits";
import { BigButton, MobileShell, PayPalLoginButton } from "../ui/mobile";
import { AgentAvatar, ICON, Icon } from "../ui/status";
import { useToast } from "../ui/toast";

const CAPS = [5000, 15000, 30000];
const DAYS = [
  { days: 1 as const, label: "24 hours" },
  { days: 7 as const, label: "7 days" },
  { days: 30 as const, label: "30 days" },
];

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

function passStatus(p: Pass): "Active" | "Revoked" | "Expired" {
  if (p.revokedAt) return "Revoked";
  if (new Date(p.expiresAt) <= new Date()) return "Expired";
  return "Active";
}

function PassesList({ customer, onLogout }: { customer: Customer; onLogout: () => void }) {
  const [passes, setPasses] = useState<Pass[] | null>(null);
  const [revoking, setRevoking] = useState<Pass | null>(null);
  const toast = useToast();

  useEffect(() => {
    api
      .passes()
      .then(setPasses)
      .catch(() => {
        setPasses([]);
        toast("Couldn't load your passes. Refresh to try again.");
      });
  }, [toast]);

  async function revoke(pass: Pass) {
    await api.revokePass(pass.id);
    setRevoking(null);
    setPasses(await api.passes());
    toast(`${pass.agentName}'s pass is revoked`);
  }

  const sorted = passes && [...passes].sort((a, b) => Number(passStatus(a) !== "Active") - Number(passStatus(b) !== "Active"));

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.015em", margin: 0 }}>My passes</h1>
        <span style={{ fontSize: 14, color: "#4A4D55", textAlign: "right" }}>
          {customer.name ?? customer.email} ·{" "}
          <button type="button" onClick={onLogout} style={{ border: 0, background: "transparent", padding: 0, fontSize: 14, color: "#4A4D55", textDecoration: "underline" }}>
            Log out
          </button>
        </span>
      </div>
      {!sorted ? (
        <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
      ) : sorted.length === 0 ? (
        <div style={{ border: "1.5px dashed #D3D0C8", borderRadius: 16, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>No passes yet</div>
          <div style={{ fontSize: 14.5, color: "#4A4D55", marginTop: 6, lineHeight: 1.5 }}>When your AI assistant asks to shop at Static Supply, it sends you a link. Open it to give it a pass.</div>
        </div>
      ) : (
        sorted.map((p) => {
          const status = passStatus(p);
          const active = status === "Active";
          return (
            <div key={p.id} style={{ border: "1px solid #E4E2DC", borderRadius: 16, padding: 16, background: active ? "#FFFFFF" : "#FAF9F6", opacity: active ? 1 : 0.62 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <AgentAvatar name={p.agentName} size={40} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{p.agentName}</div>
                  <div style={{ fontSize: 13.5, color: "#4A4D55" }}>at Static Supply · {p.operator}</div>
                </div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 24, padding: "0 9px", borderRadius: 999, background: active ? "#E4F4EA" : "#F1F0EC", color: active ? "#0F6B3E" : "#55585F", fontSize: 12.5, fontWeight: 700 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: active ? "#0F6B3E" : "#55585F" }} />
                  {status}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 14, fontSize: 13, color: "#6B6E76" }}>
                <div>
                  Cap
                  <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: "#15171C", marginTop: 2 }}>
                    {money(p.capCents)}
                  </div>
                </div>
                <div>
                  Used
                  <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: "#15171C", marginTop: 2 }}>
                    {money(p.usedCents)}
                  </div>
                </div>
                <div>
                  Expires
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#15171C", marginTop: 2 }}>{active ? expiresIn(p.expiresAt).replace(/^in /, "") : "—"}</div>
                </div>
              </div>
              {active && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12, paddingTop: 10, borderTop: "1px solid #EEEDE8" }}>
                  <button type="button" onClick={() => setRevoking(p)} style={{ height: 36, padding: "0 12px", border: 0, borderRadius: 9, background: "transparent", color: "#B42318", fontSize: 14.5, fontWeight: 600 }}>
                    Revoke
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
      <div style={{ marginTop: "auto" }}>
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
  );
}

export default function LinkAgent() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const loginFailed = params.get("login") === "failed";
  const [customer, setCustomer] = useState<Customer | null | undefined>(undefined);
  const [request, setRequest] = useState<LinkRequest | null | undefined>(undefined);
  const [step, setStep] = useState<"agent" | "limits" | "created">("agent");
  const [cap, setCap] = useState(15000);
  const [custom, setCustom] = useState<string | null>(null);
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [created, setCreated] = useState<Pass | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setUnreachable(false);
    api
      .me()
      .then(setCustomer)
      .catch(() => setUnreachable(true));
    if (id) api.linkRequest(id).then(setRequest).catch((err: unknown) => (err instanceof ApiError && err.status === 404 ? setRequest(null) : setUnreachable(true)));
    else setRequest(null);
  }, [id, attempt]);

  const capCents = custom != null ? Math.round(Number(custom) * 100) : cap;
  const capValid = Number.isFinite(capCents) && capCents >= 100 && capCents <= 1_000_000;
  const until = new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  async function createPass() {
    if (!id || !request) return;
    setSaving(true);
    setError(null);
    try {
      const { pass } = await api.approveLink(id, capCents, days);
      setCreated({ ...pass, agentName: request.agent.name, operator: request.agent.operator, agentKeyId: request.agent.keyId, usedCents: 0 });
      setStep("created");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the pass");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await api.logout();
    setCustomer(null);
  }

  const loading = customer === undefined || request === undefined;
  const linking = Boolean(id);
  const nav = !linking ? "My passes" : step === "created" ? "Done" : !customer ? "Step 1 of 3" : step === "agent" ? "Step 2 of 3" : "Step 3 of 3";

  return (
    <MobileShell brand="doorman" right={<span style={{ fontSize: 14, fontWeight: 500, color: "#4A4D55" }}>{nav}</span>}>
      {unreachable ? (
        <div role="alert" style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center", gap: 10 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Couldn't reach Doorman</h1>
          <div style={{ fontSize: 15.5, color: "#4A4D55", lineHeight: 1.5 }}>The server didn't respond. Check it's running, then try again.</div>
          <div style={{ marginTop: 12 }}>
            <BigButton variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </BigButton>
          </div>
        </div>
      ) : loading ? (
        <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Skeleton width="80%" height={28} />
          <Skeleton width="100%" height={60} />
          <Skeleton width="100%" height={120} radius={14} />
        </div>
      ) : linking && (!request || request.status !== "pending") && step !== "created" ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center", gap: 10 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{!request ? "This link isn't valid" : request.status === "expired" ? "This link has expired" : "This link was already used"}</h1>
          <div style={{ fontSize: 16, color: "#4A4D55", lineHeight: 1.5 }}>Ask your agent for a new one.</div>
          <div style={{ marginTop: 16 }}>
            <BigButton href="/link" variant="secondary">
              View my passes
            </BigButton>
          </div>
        </div>
      ) : !customer ? (
        <>
          {linking && <Stepper step={1} />}
          <h1 style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.2, letterSpacing: "-0.015em", margin: "6px 0 0", textWrap: "balance" }}>
            {linking ? "Let your AI assistant shop at Static Supply" : "Manage your agent passes"}
          </h1>
          <div style={{ fontSize: 16, lineHeight: 1.5, color: "#4A4D55" }}>
            {linking ? (
              <>
                You'll give {request?.agent.name ?? "it"} an <b style={{ color: "#15171C" }}>agent pass</b>: permission to buy here, with a spending cap and an expiry date.
              </>
            ) : (
              <>
                An <b style={{ color: "#15171C" }}>agent pass</b> lets your AI assistant buy at Static Supply, with a spending cap and an expiry date. Log in to see and revoke yours.
              </>
            )}
          </div>
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
          {loginFailed && (
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
      ) : !linking ? (
        <PassesList customer={customer} onLogout={logout} />
      ) : step === "agent" ? (
        <>
          <Stepper step={2} />
          <LoggedInBanner customer={customer} />
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>Confirm your agent</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 64, padding: "0 14px", borderRadius: 14, border: "2px solid #15171C", background: "#FAF9F6" }}>
            <AgentAvatar name={request!.agent.name} size={40} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{request!.agent.name}</div>
              <div style={{ fontSize: 13.5, color: "#4A4D55" }}>by {request!.agent.operator}</div>
            </div>
            <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: "50%", border: "7px solid #15171C" }} />
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.5, color: "#4A4D55" }}>
            <b style={{ color: "#15171C" }}>{request!.agent.name}</b> is asking to shop for you at Static Supply. Its identity is checked on every request with its signing key <span className="mono">{shortId(request!.agent.keyId)}</span>.
          </div>
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            <BigButton onClick={() => setStep("limits")}>Continue with {request!.agent.name}</BigButton>
            <BigButton href="/link" variant="plain">
              This isn't my agent
            </BigButton>
          </div>
        </>
      ) : step === "limits" ? (
        <>
          <Stepper step={3} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: "#F4F3EF" }}>
            <AgentAvatar name={request!.agent.name} size={40} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{request!.agent.name}</div>
              <div style={{ fontSize: 13.5, color: "#4A4D55" }}>by {request!.agent.operator}</div>
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
            {request!.agent.name} can buy at Static Supply for up to <b style={{ color: "#15171C" }}>{capValid ? money(capCents) : "—"} per purchase</b> until <b style={{ color: "#15171C" }}>{until}</b>. You still approve each payment in PayPal.
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
              <BigButton href="/link">View my passes</BigButton>
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
