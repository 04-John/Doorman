// Screen 5: merchant setup (Connect PayPal → Your products → Your rules) and the Rules page.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { api, type MerchantInfo, type Rules, type StoreInfo } from "../lib/api";
import { money } from "../lib/format";
import { Skeleton, Spinner } from "../ui/bits";
import { MerchantTopBar } from "../ui/chrome";
import { ProductPhoto } from "../ui/product";
import { DECISION, ICON, Icon } from "../ui/status";
import { Notice, StaticSwitch, fieldBox, fieldLabel, readOnlyBox } from "./setup/parts";
import { RulesEditor } from "./setup/RulesEditor";
import { RULE_KEYS, cardFor, errorText, ruleDetail, ruleIcon, type RuleKey } from "./setup/rules";
import "./setup/setup.css";

// null while loading
type Loaded<T> = T | "error" | null;

export default function Setup({ mode = "setup" }: { mode?: "setup" | "rules" }) {
  const [rules, setRules] = useState<Rules | null>(null);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [rulesAttempt, setRulesAttempt] = useState(0);
  const [store, setStore] = useState<Loaded<StoreInfo>>(null);
  const [storeAttempt, setStoreAttempt] = useState(0);
  const [merchant, setMerchant] = useState<Loaded<MerchantInfo>>(null);
  const [merchantAttempt, setMerchantAttempt] = useState(0);
  const setup = mode === "setup";

  useEffect(() => {
    let cancelled = false;
    setRulesError(null);
    api.rules().then(
      (r) => {
        if (!cancelled) setRules(r);
      },
      (err: unknown) => {
        if (!cancelled) setRulesError(errorText(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [rulesAttempt]);

  useEffect(() => {
    if (!setup) return;
    let cancelled = false;
    api.store().then(
      (s) => {
        if (!cancelled) setStore(s);
      },
      () => {
        if (!cancelled) setStore("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [setup, storeAttempt]);

  useEffect(() => {
    if (!setup) return;
    let cancelled = false;
    setMerchant(null);
    api.merchant().then(
      (m) => {
        if (!cancelled) setMerchant(m);
      },
      () => {
        if (!cancelled) setMerchant("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [setup, merchantAttempt]);

  let content: ReactNode;
  if (rulesError) {
    content = (
      <main className="su-main" style={{ maxWidth: setup ? 880 : 1080 }}>
        <Notice
          tone="error"
          title="Couldn't load your settings"
          action={
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRulesAttempt((n) => n + 1)}>
              Try again
            </button>
          }
        >
          {rulesError}
        </Notice>
      </main>
    );
  } else if (!rules || (setup && store === null)) {
    content = setup ? <SetupSkeleton /> : <RulesSkeleton />;
  } else if (!setup) {
    content = <RulesPage saved={rules} onSaved={setRules} />;
  } else {
    content = (
      <Wizard
        rules={rules}
        onRulesChange={setRules}
        store={store ?? "error"}
        onRetryStore={() => {
          setStore(null);
          setStoreAttempt((n) => n + 1);
        }}
        merchant={merchant}
        onRetryMerchant={() => setMerchantAttempt((n) => n + 1)}
      />
    );
  }

  return (
    <div style={{ minHeight: "calc(100% - var(--demo-nav-h, 0px))", display: "flex", flexDirection: "column" }}>
      <div className="su-topbar">
        <MerchantTopBar />
      </div>
      {content}
    </div>
  );
}

/* ---------------- Setup wizard ---------------- */

type Step = 1 | 2 | 3;
const STEPS: { n: Step; label: string; heading: string }[] = [
  { n: 1, label: "Connect PayPal", heading: "su-step-1" },
  { n: 2, label: "Your products", heading: "su-step-2" },
  { n: 3, label: "Your rules", heading: "su-rules-heading" },
];

const stepTitle = { fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", margin: 0 } as const;
const stepDesc = { fontSize: 15.5, color: "#4A4D55", margin: "6px 0 0", lineHeight: 1.5 } as const;
const ghostButton = { height: 46, padding: "0 16px", fontWeight: 500 } as const;

const pad = (n: number) => String(n).padStart(2, "0");

// "Today, 14:00"
function startLabel(drop: StoreInfo["drop"]): string {
  if (!drop) return "On “Run the drop”";
  const d = new Date(drop.startedAt);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.toDateString() === new Date().toDateString()) return `Today, ${time}`;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

function Wizard({
  rules,
  onRulesChange,
  store,
  onRetryStore,
  merchant,
  onRetryMerchant,
}: {
  rules: Rules;
  onRulesChange: (rules: Rules) => void;
  store: StoreInfo | "error";
  onRetryStore: () => void;
  merchant: Loaded<MerchantInfo>;
  onRetryMerchant: () => void;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [limit, setLimit] = useState(String(rules.policy.dropLimitPerCustomer));
  const [savingLimit, setSavingLimit] = useState(false);
  const [limitError, setLimitError] = useState<string | null>(null);

  // Move focus to the new step's heading so keyboard and screen-reader users follow along.
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    const id = STEPS.find((s) => s.n === step)?.heading;
    if (id) document.getElementById(id)?.focus();
  }, [step]);

  const hasDrop = store !== "error" && store.products.some((p) => p.limitedDrop);
  const parsedLimit = Number(limit);
  const limitValid = limit.trim() !== "" && Number.isInteger(parsedLimit) && parsedLimit >= 1 && parsedLimit <= 10;

  async function goTo(next: Step) {
    if (savingLimit || next === step) return;
    // Leaving the products step saves the drop limit, so later steps see it.
    if (step === 2 && hasDrop) {
      if (!limitValid) {
        setLimitError("Choose a limit per customer from 1 to 10.");
        return;
      }
      if (parsedLimit !== rules.policy.dropLimitPerCustomer) {
        setSavingLimit(true);
        setLimitError(null);
        try {
          onRulesChange(await api.saveRules({ ...rules.policy, dropLimitPerCustomer: parsedLimit }, rules.rulesText));
        } catch (err) {
          setLimitError(`Couldn't save the limit. ${errorText(err)}`);
          return;
        } finally {
          setSavingLimit(false);
        }
      }
    }
    setStep(next);
  }

  return (
    <main className="su-main" style={{ maxWidth: 880 }}>
      <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#6B6E76" }}>Setup · about 2 minutes</div>
      <h1 className="su-title">Make Static Supply agent‑ready</h1>

      <ol className="su-steps" aria-label="Setup steps">
        {STEPS.map(({ n, label }) => {
          const done = n < step;
          const cur = n === step;
          return (
            <li key={n}>
              <button type="button" className="su-step" onClick={() => void goTo(n)} aria-current={cur ? "step" : undefined}>
                <span style={{ display: "block", height: 4, borderRadius: 2, background: n <= step ? "#15171C" : "#E4E2DC", transition: "background .3s" }} />
                <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      flex: "none",
                      borderRadius: "50%",
                      background: done ? "#15171C" : "#FFFFFF",
                      color: cur ? "#15171C" : "#6B6E76",
                      border: `1.5px solid ${done || cur ? "#15171C" : "#C9C6BD"}`,
                      display: "grid",
                      placeItems: "center",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {done ? <Icon d={ICON.check} color="#FFFFFF" size={12} width={2.4} /> : n}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: done || cur ? "#15171C" : "#6B6E76" }}>
                    {label}
                    {done && <span className="sr-only"> (done)</span>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="su-card">
        <section hidden={step !== 1} aria-labelledby="su-step-1">
          <h2 id="su-step-1" tabIndex={-1} style={stepTitle}>
            Connect PayPal
          </h2>
          <p style={stepDesc}>Doorman holds and charges payments through your PayPal business account. Customers always approve in PayPal.</p>
          <Connection merchant={merchant} onRetry={onRetryMerchant} />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 26 }}>
            <button type="button" className="btn btn-primary" style={{ padding: "0 20px" }} onClick={() => void goTo(2)}>
              Continue
            </button>
          </div>
        </section>

        <section hidden={step !== 2} aria-labelledby="su-step-2">
          <h2 id="su-step-2" tabIndex={-1} style={stepTitle}>
            Your products
          </h2>
          <p style={stepDesc}>Mark limited releases as a drop. Doorman applies stricter rules while a drop is live.</p>
          {store === "error" ? (
            <div style={{ marginTop: 20 }}>
              <Notice
                tone="error"
                title="Couldn't load your products"
                action={
                  <button type="button" className="btn btn-secondary btn-sm" onClick={onRetryStore}>
                    Try again
                  </button>
                }
              >
                Doorman's server didn't respond. Check it's running, then try again.
              </Notice>
            </div>
          ) : (
            <Products
              store={store}
              limit={limit}
              limitValid={limitValid}
              onLimit={(v) => {
                setLimit(v);
                setLimitError(null);
              }}
            />
          )}
          {limitError && (
            <div style={{ marginTop: 14 }}>
              <Notice tone="error">{limitError}</Notice>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 26 }}>
            <button type="button" className="btn btn-ghost" style={ghostButton} onClick={() => void goTo(1)}>
              Back
            </button>
            <button type="button" className="btn btn-primary" style={{ padding: "0 20px" }} onClick={() => void goTo(3)} aria-disabled={savingLimit}>
              {savingLimit && <Spinner light size={16} />}
              {savingLimit ? "Saving…" : "Continue"}
            </button>
          </div>
        </section>

        <section hidden={step !== 3} aria-labelledby="su-rules-heading">
          <RulesEditor saved={rules} onBack={() => void goTo(2)} onSaved={() => navigate("/dashboard")} />
        </section>
      </div>
    </main>
  );
}

function Connection({ merchant, onRetry }: { merchant: Loaded<MerchantInfo>; onRetry: () => void }) {
  if (merchant === null) return <Skeleton width="100%" height={66} radius={12} style={{ marginTop: 22 }} />;

  const circle = (bg: string, icon: string) => (
    <span style={{ width: 32, height: 32, flex: "none", borderRadius: "50%", background: bg, display: "grid", placeItems: "center" }}>
      <Icon d={icon} color="#FFFFFF" size={16} width={2.2} />
    </span>
  );

  if (merchant !== "error" && merchant.connected) {
    return (
      <div className="su-conn" role="status" style={{ background: "#E4F4EA", border: "1px solid #B2DCC2", color: "#0B4F2E" }}>
        {circle("#0F6B3E", ICON.check)}
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Connected to PayPal sandbox</div>
          <div style={{ fontSize: 14, marginTop: 2 }}>Static Supply business account</div>
          {merchant.email && <div style={{ fontSize: 13.5, marginTop: 2, overflowWrap: "anywhere", opacity: 0.85 }}>{merchant.email}</div>}
        </div>
        {merchant.merchantId && (
          <span className="mono" style={{ fontSize: 13 }}>
            Merchant ID {merchant.merchantId}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="su-conn" role="alert" style={{ background: "#FDEAE7", border: "1px solid #F2BBB4" }}>
      {circle("#B42318", ICON.cross)}
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#B42318" }}>Not connected to PayPal</div>
        <div style={{ fontSize: 14, marginTop: 2, color: "#4A4D55", lineHeight: 1.45 }}>
          {merchant === "error"
            ? "Doorman's server didn't respond. Check it's running, then try again."
            : "Doorman couldn't reach the PayPal sandbox business account. Check the server's PayPal credentials, then try again."}
        </div>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

function Products({ store, limit, limitValid, onLimit }: { store: StoreInfo; limit: string; limitValid: boolean; onLimit: (value: string) => void }) {
  return (
    <div style={{ marginTop: 20, border: "1px solid #E4E2DC", borderRadius: 12, overflow: "hidden" }}>
      {store.products.map((p, i) => (
        <div key={p.id} style={{ borderTop: i === 0 ? 0 : "1px solid #E4E2DC", background: p.limitedDrop ? "#FAF9F6" : "#FFFFFF" }}>
          <div className="su-prod-row">
            <ProductPhoto productId={p.id} style={{ gridArea: "img", width: 52, height: 52, borderRadius: 9, border: "1px solid #E4E2DC" }} />
            <div style={{ gridArea: "name", fontSize: 16, fontWeight: 600, minWidth: 0 }}>{p.name}</div>
            <div className="mono" style={{ gridArea: "price", fontSize: 15 }}>
              {money(p.priceCents)}
            </div>
            <div style={{ gridArea: "stock", fontSize: 14, color: "#4A4D55" }}>
              <span className="mono">{p.stock}</span> in stock
            </div>
            <div style={{ gridArea: "drop", display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end", fontSize: 14.5, fontWeight: 500 }}>
              {p.limitedDrop ? "Drop" : "Regular"}
              <StaticSwitch on={p.limitedDrop} />
            </div>
          </div>
          {p.limitedDrop && (
            <div className="su-drop-fields">
              <div>
                <label htmlFor="su-limit" style={fieldLabel}>
                  Limit per customer
                </label>
                <input
                  id="su-limit"
                  className="mono"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={10}
                  step={1}
                  value={limit}
                  onChange={(e) => onLimit(e.target.value)}
                  aria-invalid={!limitValid || undefined}
                  style={{ ...fieldBox, borderColor: limitValid ? "#D3D0C8" : "#B42318" }}
                />
              </div>
              <div>
                <div style={fieldLabel}>Drop stock</div>
                <div className="mono" style={readOnlyBox}>
                  {store.drop?.stockTotal ?? p.stock}
                </div>
              </div>
              <div>
                <div style={fieldLabel}>Starts</div>
                <div style={readOnlyBox}>{startLabel(store.drop)}</div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- Rules page ---------------- */

function RulesPage({ saved, onSaved }: { saved: Rules; onSaved: (rules: Rules) => void }) {
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  // Closing the editor hands focus back to the button that opened it.
  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  return (
    <main className="su-main" style={{ maxWidth: 1080 }}>
      <div className="su-rules-head">
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}>Rules</h1>
          <p style={{ fontSize: 15.5, color: "#4A4D55", margin: "6px 0 0", lineHeight: 1.5 }}>
            All {RULE_KEYS.length} rules active · checked on every request before Doorman decides
          </p>
        </div>
        {!editing && (
          <button ref={editButton} type="button" className="btn btn-secondary" style={{ height: 44, padding: "0 16px", fontSize: 14.5 }} onClick={() => setEditing(true)}>
            Edit in plain English
          </button>
        )}
      </div>
      {editing ? (
        <div className="su-card">
          <RulesEditor
            saved={saved}
            autoFocus
            onBack={() => setEditing(false)}
            onSaved={(next) => {
              onSaved(next);
              setEditing(false);
            }}
          />
        </div>
      ) : (
        <div className="su-grid2" style={{ gap: 14 }}>
          {RULE_KEYS.map((key) => (
            <SavedRule key={key} ruleKey={key} rules={saved} />
          ))}
        </div>
      )}
    </main>
  );
}

function SavedRule({ ruleKey, rules }: { ruleKey: RuleKey; rules: Rules }) {
  const { title } = cardFor(rules.cards, ruleKey, rules.policy);
  const d = ruleDetail(ruleKey, rules.policy);
  const decision = DECISION[d.then];
  const term = { fontSize: 12.5, color: "#6B6E76", marginBottom: 6 } as const;
  const box = { margin: 0, height: 40, borderRadius: 9, display: "flex", alignItems: "center", padding: "0 12px", fontSize: 14 } as const;

  return (
    <article style={{ border: "1px solid #E4E2DC", borderRadius: 14, padding: 18, background: "#FFFFFF", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span style={{ width: 38, height: 38, flex: "none", borderRadius: 10, background: "#F1F0EC", display: "grid", placeItems: "center" }}>
          <Icon d={ruleIcon(ruleKey)} color="#15171C" size={18} width={1.9} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 16.5, fontWeight: 600, margin: 0 }}>{title}</h2>
          <p style={{ fontSize: 14, color: "#4A4D55", margin: "3px 0 0", lineHeight: 1.45 }}>{d.desc}</p>
        </div>
      </div>
      <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, margin: "16px 0 0", paddingTop: 14, borderTop: "1px solid #EEEDE8" }}>
        <div style={{ minWidth: 0 }}>
          <dt style={term}>{d.field}</dt>
          <dd className="mono" style={{ ...box, border: "1px solid #E4E2DC", background: "#FAF9F6" }}>
            {d.value}
          </dd>
        </div>
        <div style={{ minWidth: 0 }}>
          <dt style={term}>Then</dt>
          <dd style={{ ...box, gap: 7, fontWeight: 600, background: decision.bg, color: decision.fg }}>
            <Icon d={decision.icon} color={decision.fg} size={14} />
            {decision.label}
          </dd>
        </div>
      </dl>
    </article>
  );
}

/* ---------------- Loading ---------------- */

function SetupSkeleton() {
  return (
    <main className="su-main" aria-busy="true" aria-label="Loading setup" style={{ maxWidth: 880, display: "flex", flexDirection: "column", gap: 14 }}>
      <Skeleton width={180} height={12} />
      <Skeleton width="min(460px, 80%)" height={34} radius={8} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, margin: "12px 0 8px" }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} width="100%" height={30} />
        ))}
      </div>
      <div className="su-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Skeleton width="min(220px, 70%)" height={22} />
        <Skeleton width="90%" height={13} />
        <Skeleton width="70%" height={13} />
        <Skeleton width="100%" height={66} radius={12} style={{ marginTop: 10 }} />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <Skeleton width={110} height={46} radius={11} />
        </div>
      </div>
    </main>
  );
}

function RulesSkeleton() {
  return (
    <main className="su-main" aria-busy="true" aria-label="Loading rules" style={{ maxWidth: 1080 }}>
      <div className="su-rules-head">
        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
          <Skeleton width={120} height={32} radius={8} />
          <Skeleton width="min(420px, 90%)" height={14} />
        </div>
        <Skeleton width={180} height={44} radius={11} />
      </div>
      <div className="su-grid2" style={{ gap: 14 }}>
        {RULE_KEYS.map((k) => (
          <Skeleton key={k} width="100%" height={170} radius={14} />
        ))}
      </div>
    </main>
  );
}
