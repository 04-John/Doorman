// The merchant side (dashboard, rules, settings) sits behind the merchant password.
// Customer pages never ask for it.
import { useEffect, useState, type FormEvent } from "react";
import { Link, Outlet } from "react-router";
import { api, ApiError, MERCHANT_SIGNED_OUT } from "../lib/api";
import { MerchantTopBar as MobileMerchantTopBar } from "../mobile/chrome";
import { useIsMobile } from "../mobile/useIsMobile";
import { Spinner } from "./bits";
import { LogoMark } from "./chrome";

type State = "checking" | "signed-in" | "signed-out" | "locked";

export function MerchantGate() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    api.merchantSession().then(
      (s) => setState(s.signedIn ? "signed-in" : s.passwordSet ? "signed-out" : "locked"),
      () => setState("signed-out"),
    );
    const signedOut = () => setState("signed-out");
    window.addEventListener(MERCHANT_SIGNED_OUT, signedOut);
    return () => window.removeEventListener(MERCHANT_SIGNED_OUT, signedOut);
  }, []);

  if (state === "signed-in") return <Outlet />;
  if (state === "checking") {
    return (
      <div style={{ height: "calc(100% - var(--demo-nav-h, 0px))", display: "grid", placeItems: "center" }} aria-busy="true">
        <Spinner size={28} />
      </div>
    );
  }
  return <SignIn locked={state === "locked"} onSignedIn={() => setState("signed-in")} />;
}

function SignIn({ locked, onSignedIn }: { locked: boolean; onSignedIn: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phone = useIsMobile();

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.merchantLogin(password);
      onSignedIn();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? "Too many tries. Wait a minute and try again."
          : err instanceof ApiError
            ? err.message
            : "Couldn't reach Doorman. Try again.",
      );
      setBusy(false);
    }
  }

  const form = (
    <form onSubmit={signIn} className="card fade-in" style={{ width: "100%", maxWidth: 400, padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
      <span style={{ width: 44, height: 44, borderRadius: 12, background: "#15171C", display: "grid", placeItems: "center" }}>
        <LogoMark size={24} />
      </span>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.2, letterSpacing: "-0.015em", margin: 0 }}>Merchant sign-in</h1>
        <p style={{ margin: "6px 0 0", fontSize: 15, lineHeight: 1.5, color: "#4A4D55" }}>Static Supply's dashboard, rules and settings are for the store's team.</p>
      </div>
      {locked ? (
        <div role="alert" style={{ padding: "12px 14px", borderRadius: 12, background: "#FDF1DC", border: "1px solid #EBC98C", color: "#6B4100", fontSize: 14.5, lineHeight: 1.45 }}>
          The merchant side is locked because no password is set. Add <span className="mono">MERCHANT_PASSWORD</span> to the server's environment (or <span className="mono">.env</span>) and restart it.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label htmlFor="merchant-password" style={{ fontSize: 14, fontWeight: 600 }}>
              Password
            </label>
            <input
              id="merchant-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error !== null}
              aria-describedby="merchant-password-note"
              style={{ height: 46, borderRadius: 10, border: `1.5px solid ${error ? "#B42318" : "#D3D0C8"}`, padding: "0 12px", fontSize: 16, minWidth: 0 }}
            />
            <div id="merchant-password-note" role={error ? "alert" : undefined} style={{ fontSize: 13.5, lineHeight: 1.4, color: error ? "#8E1B12" : "#6B6E76" }}>
              {error ?? "Judging Doorman? The password is in the testing instructions on Devpost."}
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </>
      )}
      <div style={{ borderTop: "1px solid #EEEDE8", paddingTop: 16, fontSize: 14.5, color: "#4A4D55" }}>
        Shopping instead?{" "}
        <Link to="/store" style={{ fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3, display: "inline-block", padding: "13px 0", margin: "-13px 0" }}>
          Go to the store
        </Link>
      </div>
    </form>
  );

  // Phones have no demo strip, so the merchant app's top bar leads back to the overview.
  return phone ? (
    <div className="m-app m-no-tabs">
      <MobileMerchantTopBar account={false} />
      <main style={{ flex: 1, display: "grid", placeItems: "center", padding: "8px 16px 32px" }}>{form}</main>
    </div>
  ) : (
    <main style={{ minHeight: "calc(100% - var(--demo-nav-h, 0px))", display: "grid", placeItems: "center", padding: "32px 16px" }}>{form}</main>
  );
}
