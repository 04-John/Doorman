// Screen 3: the customer approves (or declines) what their agent wants to buy.
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { api, ApiError, loginHref, type Approval, type Customer } from "../lib/api";
import { expiresIn, money } from "../lib/format";
import { Skeleton } from "../ui/bits";
import { BigButton, KeyValues, MobileShell, PayPalLoginButton, TickLine } from "../ui/mobile";
import { PayPalButton } from "../ui/PayPalButton";
import { AgentAvatar, ICON, Icon, IdentityBadge } from "../ui/status";

// "Size M · Qty 1"
const itemLine = (a: Approval) => [a.size && `Size ${a.size}`, `Qty ${a.quantity}`].filter(Boolean).join(" · ");

function Loading({ agent }: { agent?: string }) {
  return (
    <div aria-busy="true" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Skeleton width={44} height={44} radius={12} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <Skeleton width="90%" height={16} />
          <Skeleton width="60%" height={16} />
        </div>
      </div>
      <Skeleton width="100%" height={236} radius={16} />
      <Skeleton width="100%" height={96} radius={14} />
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <Skeleton width="100%" height={50} radius={25} />
        <Skeleton width={150} height={14} />
      </div>
      <div style={{ textAlign: "center", fontSize: 13.5, color: "#6B6E76" }}>{agent ? `Checking ${agent}'s pass…` : "Checking the agent's pass…"}</div>
    </div>
  );
}

function ProductCard({ a }: { a: Approval }) {
  return (
    <div style={{ border: "1px solid #E4E2DC", borderRadius: 16, overflow: "hidden" }}>
      <div aria-hidden="true" style={{ height: 170, background: "repeating-linear-gradient(135deg,#ECEAE4 0 8px,#F4F3EF 8px 16px)", display: "grid", placeItems: "center", font: "500 11px var(--mono)", color: "#6B6E76" }}>
        product photo
      </div>
      <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{a.product.name}</div>
          <div style={{ fontSize: 14, color: "#4A4D55", marginTop: 2 }}>{itemLine(a)}</div>
        </div>
        <div className="mono" style={{ fontSize: 19, fontWeight: 600 }}>
          {money(a.amountCents, { decimals: true })}
        </div>
      </div>
    </div>
  );
}

function Held({ agent, amountCents }: { agent: string | null; amountCents: number }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 14, paddingBottom: 60 }} aria-live="polite">
      <span className="spinner" style={{ width: 72, height: 72, borderWidth: 4, borderColor: "#EEEDE8", borderTopColor: "#15171C", animationDuration: "1s" }} />
      <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em" }}>Payment held</div>
      <div style={{ fontSize: 16, color: "#4A4D55" }}>Doorman is confirming your order…</div>
      <div style={{ width: "100%", marginTop: 18, border: "1px solid #E4E2DC", borderRadius: 14, padding: "6px 16px", textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, minHeight: 46, fontSize: 15 }}>
          <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#E4F4EA", display: "grid", placeItems: "center" }}>
            <Icon d={ICON.check} color="#0F6B3E" size={12} width={2.6} />
          </span>
          {money(amountCents, { decimals: true })} held on your PayPal
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 11, minHeight: 46, fontSize: 15, borderTop: "1px solid #EEEDE8" }}>
          <span className="spinner" style={{ width: 22, height: 22, borderWidth: 2.5, borderColor: "#EEEDE8", borderTopColor: "#8A5300" }} />
          {agent ? `Checking you're the one who linked ${agent}` : "Checking it's your account"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 11, minHeight: 46, fontSize: 15, borderTop: "1px solid #EEEDE8", color: "#6B6E76" }}>
          <span style={{ width: 22, height: 22, borderRadius: "50%", border: "1.5px solid #C9C6BD" }} />
          Charge and confirm order
        </div>
      </div>
    </div>
  );
}

const linkButton = { border: 0, background: "transparent", fontSize: 15, fontWeight: 500, color: "#4A4D55", padding: 6, textDecoration: "underline", textUnderlineOffset: 3 } as const;

function Outcome({ a, onRetry, retrying }: { a: Approval; onRetry: () => void; retrying: boolean }) {
  const agent = a.agent?.name ?? "your agent";
  const review = a.agent ? `Review ${a.agent.name}'s pass` : "Review your passes";
  const retry = a.canRetry && (
    <BigButton onClick={onRetry} disabled={retrying}>
      {retrying ? `Asking ${agent}…` : "Try again"}
    </BigButton>
  );
  if (a.status === "charged") {
    return (
      <>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 12, paddingTop: 28 }}>
          <div style={{ width: 76, height: 76, borderRadius: "50%", background: "#0F6B3E", display: "grid", placeItems: "center" }}>
            <Icon d={ICON.check} color="#FFFFFF" size={38} width={1.8} />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1.2, margin: 0, textWrap: "balance" }}>Done. Your {a.product.name} is on its way.</h1>
        </div>
        <KeyValues
          rows={[
            ["Charged", <b className="mono" style={{ fontWeight: 600 }}>{money(a.amountCents, { decimals: true })}</b>],
            ["Paid by", `${a.paidBy ?? "You"} · PayPal`],
            ...(a.agent ? [["Bought by", `${a.agent.name} · ${a.agent.operator}`] as [string, string]] : []),
            ["Order", <span className="mono" style={{ fontSize: 13 }}>{a.paypalOrderId}</span>],
          ]}
        />
        {a.pass && a.agent && (
          <div style={{ padding: "14px 16px", background: "#F4F3EF", borderRadius: 14, fontSize: 14.5 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{a.agent.name}'s pass · Static Supply</span>
              <span style={{ color: "#4A4D55" }}>
                {money(a.pass.usedCents)} of {money(a.pass.capCents)} used
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "#E4E2DC", marginTop: 9, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(100, (a.pass.usedCents / a.pass.capCents) * 100)}%`, background: "#15171C" }} />
            </div>
          </div>
        )}
        <div style={{ marginTop: "auto" }}>
          <BigButton href="/passes" variant="secondary">
            Manage your agent passes
          </BigButton>
        </div>
      </>
    );
  }

  if (a.status === "released") {
    const mismatch = a.releaseReason?.startsWith("Paid from a different PayPal account");
    return (
      <>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 12, paddingTop: 28 }}>
          <div style={{ width: 76, height: 76, borderRadius: "50%", background: "#FDF1DC", border: "1.5px solid #EBC98C", display: "grid", placeItems: "center" }}>
            <Icon d="M8 4.5v4.2M8 11.3v.2" color="#8A5300" size={34} width={1.9} />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.015em", margin: 0 }}>We released the hold</h1>
          <div style={{ fontSize: 16, lineHeight: 1.5, color: "#4A4D55" }}>
            {mismatch
              ? `This was approved by a different PayPal account than the one linked to ${agent}. We released the hold, so no money was taken.`
              : `${a.releaseReason ?? "The order couldn't go through"}. We released the hold, so no money was taken.`}
          </div>
        </div>
        <KeyValues
          rows={[
            ["Taken", <b className="mono" style={{ fontWeight: 600 }}>$0.00</b>],
            ...(a.pass?.customerName ? [["Pass holder", a.pass.customerName] as [string, string]] : []),
            ...(mismatch ? [["Approved by", "Another PayPal account"] as [string, string]] : []),
          ]}
        />
        {mismatch && <div style={{ fontSize: 14.5, lineHeight: 1.5, color: "#4A4D55" }}>If this was you, ask {agent} to try again and approve with the PayPal account you linked.</div>}
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {retry}
          <BigButton href="/passes" variant="plain">
            <span style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>{review}</span>
          </BigButton>
        </div>
      </>
    );
  }

  // Declined, expired, or cancelled by the store.
  const expired = a.releaseReason === "Approval link expired";
  return (
    <>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 12, paddingBottom: 80 }}>
        <div style={{ width: 76, height: 76, borderRadius: "50%", background: "#F1F0EC", display: "grid", placeItems: "center" }}>
          <Icon d={ICON.cross} color="#4A4D55" size={30} width={1.8} />
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.015em", margin: 0, textWrap: "balance" }}>Cancelled. Nothing was charged.</h1>
        <div style={{ fontSize: 16, lineHeight: 1.5, color: "#4A4D55", maxWidth: 300 }}>
          {a.releaseReason === "Cancelled by the merchant"
            ? "The store cancelled this order."
            : expired
              ? `This approval link expired after 15 minutes. Ask ${agent} to try again.`
              : `We told ${agent} you declined. Approval links also expire after 15 minutes.`}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {expired && retry}
        <BigButton href="/passes" variant="secondary">
          {review}
        </BigButton>
      </div>
    </>
  );
}

export default function Approve() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [approval, setApproval] = useState<Approval | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(params.get("login") === "failed" ? "PayPal login didn't complete. Try again." : null);
  const [holding, setHolding] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    setApproval(null);
    setError(null);
    Promise.all([api.approval(token), api.me()])
      .then(([a, c]) => {
        setApproval(a);
        setCustomer(c);
      })
      .catch((err: unknown) => setError(err instanceof ApiError && err.status === 404 ? "This approval link isn't valid." : "Couldn't load this purchase. Try again."));
  }, [token]);

  const onApproved = useCallback(async () => {
    setHolding(true);
    setMessage(null);
    try {
      setApproval(await api.authorizeApproval(token));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setHolding(false);
    }
  }, [token]);

  const decline = async () => setApproval(await api.declineApproval(token));

  // The agent asks again; the customer gets a fresh approval page.
  async function retry() {
    setRetrying(true);
    setMessage(null);
    try {
      const { approvalPath } = await api.retryApproval(token);
      navigate(approvalPath);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't ask the agent to try again.");
    } finally {
      setRetrying(false);
    }
  }

  const pay = useCallback(() => Promise.resolve(approval?.paypalOrderId ?? ""), [approval?.paypalOrderId]);

  const a = approval;
  const agent = a?.agent;

  return (
    <MobileShell brand="store">
      {error ? (
        <div style={{ flex: 1, display: "grid", placeItems: "center", textAlign: "center", fontSize: 16, color: "#4A4D55" }}>{error}</div>
      ) : !a ? (
        <Loading />
      ) : holding ? (
        <Held agent={agent?.name ?? null} amountCents={a.amountCents} />
      ) : a.status !== "awaiting_approval" ? (
        <>
          <Outcome a={a} onRetry={() => void retry()} retrying={retrying} />
          {message && (
            <div role="alert" style={{ fontSize: 14.5, color: "#8E1B12", textAlign: "center" }}>
              {message}
            </div>
          )}
        </>
      ) : a.stepUp ? (
        <>
          <div style={{ display: "flex", gap: 12, padding: 14, borderRadius: 14, background: "#FDF1DC", border: "1px solid #EBC98C" }}>
            <Icon d="M2.5 13h3.5V9.5h3.5V6H13V2.5" color="#8A5300" size={22} width={1.8} />
            <div style={{ fontSize: 15.5, lineHeight: 1.45, color: "#5C3800" }}>
              An agent called <b>{agent?.name ?? "an unknown agent"}</b> wants to buy for you. Doorman doesn't know it yet.
            </div>
          </div>
          {agent && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "1px solid #E4E2DC", borderRadius: 14 }}>
              <AgentAvatar name={agent.name} size={40} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{agent.name}</div>
                <div style={{ fontSize: 13.5, color: "#4A4D55" }}>{agent.operator}</div>
              </div>
              <IdentityBadge tier="signed" />
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "1px solid #E4E2DC", borderRadius: 14 }}>
            <div aria-hidden="true" style={{ width: 52, height: 52, borderRadius: 10, background: "repeating-linear-gradient(135deg,#ECEAE4 0 6px,#F4F3EF 6px 12px)" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15.5, fontWeight: 600 }}>{a.product.name}</div>
              <div style={{ fontSize: 13.5, color: "#4A4D55" }}>{itemLine(a)}</div>
            </div>
            <div className="mono" style={{ fontSize: 16, fontWeight: 600 }}>
              {money(a.amountCents, { decimals: true })}
            </div>
          </div>
          <ol style={{ listStyle: "none", margin: "4px 0 0", padding: 0 }}>
            <li style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ width: 28, height: 28, borderRadius: "50%", background: customer ? "#0F6B3E" : "#15171C", color: "#FFFFFF", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700 }}>
                  {customer ? <Icon d={ICON.check} color="#FFFFFF" size={14} /> : "1"}
                </span>
                <span style={{ flex: 1, width: 2, background: "#E4E2DC", margin: "4px 0" }} />
              </div>
              <div style={{ paddingBottom: 18 }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginTop: 3 }}>{customer ? `Confirmed as ${customer.name ?? customer.email}` : "Log in with PayPal to confirm it's yours"}</div>
                <div style={{ fontSize: 14, color: "#4A4D55", margin: "3px 0 12px" }}>
                  {customer ? "Only this PayPal account can pay for the order." : "Doorman checks the PayPal account you log in with is the one that pays."}
                </div>
                {!customer && <PayPalLoginButton href={loginHref()} />}
              </div>
            </li>
            <li style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 12 }}>
              <span style={{ width: 28, height: 28, borderRadius: "50%", border: customer ? "none" : "1.5px solid #C9C6BD", background: customer ? "#15171C" : "transparent", color: customer ? "#FFFFFF" : "#6B6E76", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700 }}>
                2
              </span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, marginTop: 3, color: customer ? "#15171C" : "#6B6E76" }}>Approve the payment</div>
                <div style={{ marginTop: 12 }}>
                  {customer ? (
                    <PayPalButton order={pay} onApproved={onApproved} onMessage={setMessage} />
                  ) : (
                    <div style={{ height: 48, borderRadius: 24, background: "#F1F0EC", border: "1.5px dashed #C9C6BD", display: "grid", placeItems: "center", fontSize: 13.5, fontWeight: 600, color: "#6B6E76" }}>Unlocks after step 1</div>
                  )}
                </div>
              </div>
            </li>
          </ol>
          {message && (
            <div role="alert" style={{ fontSize: 14.5, color: "#8E1B12" }}>
              {message}
            </div>
          )}
          <button type="button" onClick={decline} style={{ ...linkButton, marginTop: "auto", alignSelf: "center" }}>
            This isn't me / Decline
          </button>
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <AgentAvatar name={agent?.name ?? null} size={44} />
            <h1 style={{ fontSize: 21, fontWeight: 600, lineHeight: 1.28, letterSpacing: "-0.01em", margin: 0 }}>
              <b>{agent?.name ?? "Your agent"}</b> {agent && <span style={{ fontWeight: 500, color: "#4A4D55" }}>({agent.operator})</span>} wants to buy this for you
            </h1>
          </div>
          <ProductCard a={a} />
          {a.pass && (
            <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: "14px 16px", background: "#F4F3EF", borderRadius: 14 }}>
              <div className="label">Your limits</div>
              <TickLine>Within your {money(a.pass.capCents)} cap</TickLine>
              <TickLine>Pass expires {expiresIn(a.pass.expiresAt)}</TickLine>
            </div>
          )}
          {message && (
            <div role="alert" style={{ fontSize: 14.5, color: "#8E1B12" }}>
              {message}
            </div>
          )}
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <PayPalButton order={pay} onApproved={onApproved} onMessage={setMessage} />
            <button type="button" onClick={decline} style={linkButton}>
              This isn't me / Decline
            </button>
          </div>
        </>
      )}
    </MobileShell>
  );
}
