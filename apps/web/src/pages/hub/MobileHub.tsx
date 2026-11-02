// The demo overview on a phone: the pitch, two big ways in, and the three steps as cards you swipe.
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { LogoMark } from "../../ui/chrome";
import { SandboxPill } from "../../mobile/chrome";
import { DecisionBadge, ICON, Icon, IdentityBadge } from "../../ui/status";

const CARD_W = 300;

function Card({ n, title, body, children }: { n: string; title: string; body: string; children: ReactNode }) {
  return (
    <li className="m-card" style={{ position: "relative", width: CARD_W, minHeight: 230, padding: 20, display: "flex", flexDirection: "column", gap: 12, borderRadius: 22 }}>
      <span className="mono" aria-hidden="true" style={{ fontSize: 13, fontWeight: 600, color: "#6B6E76" }}>
        {n}
      </span>
      <h2 style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>{title}</h2>
      <p style={{ fontSize: 15.5, lineHeight: 1.5, color: "#4A4D55", margin: 0 }}>{body}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: "auto" }}>{children}</div>
    </li>
  );
}

export function MobileHub({ count, price, repoUrl }: { count: number; price: string; repoUrl: string }) {
  const [card, setCard] = useState(0);
  const links: [string, string][] = [
    ["/store", "Storefront"],
    ["/setup", "Merchant setup"],
    ["/rules", "Rules"],
    ["/link", "Link an agent"],
    ["/passes", "My passes"],
  ];

  return (
    <div className="m-app m-no-tabs" data-screen-label="M0 Demo hub" style={{ paddingBottom: "calc(24px + var(--m-safe-b))" }}>
      <header className="m-topbar" style={{ justifyContent: "space-between" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LogoMark size={26} color="#15171C" />
          <span style={{ fontWeight: 700, fontSize: 19, letterSpacing: "-0.01em" }}>Doorman</span>
        </span>
        <SandboxPill />
      </header>

      <main>
        <div className="m-pad m-fade" style={{ paddingTop: 28 }}>
          <div className="m-eyebrow">A checkpoint for AI shopping agents</div>
          <h1 style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1.04, margin: "14px 0 0", textWrap: "balance" }}>Let real customers' AI agents in. Keep scalper bots out.</h1>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: "#4A4D55", margin: "16px 0 0" }}>
            Watch Static Supply drop {count} Night Shift Hoodies while a verified assistant, an unknown agent and a swarm of scalper bots arrive at once.
          </p>
        </div>

        <div className="m-pad m-fade" style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 26, animationDelay: ".06s" }}>
          <Link to="/dashboard" className="m-btn m-tap" style={{ height: 58, borderRadius: 18, fontSize: 17, color: "#FFFFFF", boxShadow: "0 10px 24px rgba(21,23,28,.24)" }}>
            <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: "50%", background: "#FFFFFF", display: "grid", placeItems: "center" }}>
              <svg width="10" height="10" viewBox="0 0 10 10">
                <path d="M2.5 1.3l6 3.7-6 3.7z" fill="#15171C" />
              </svg>
            </span>
            Open the live demo
          </Link>
          <Link to="/store" className="m-btn m-btn-secondary m-tap" style={{ height: 56, borderRadius: 18, fontSize: 17, color: "#15171C" }}>
            Try it as a customer
          </Link>
        </div>

        <div className="m-pad" style={{ paddingTop: 38, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>How it works</h2>
          <span className="mono" style={{ fontSize: 13, color: "#6B6E76" }} aria-hidden="true">
            {card + 1} / 3
          </span>
        </div>
        <ol
          className="m-hscroll"
          aria-label="How Doorman works"
          onScroll={(e) => setCard(Math.max(0, Math.min(2, Math.round(e.currentTarget.scrollLeft / (CARD_W + 12)))))}
          style={{ listStyle: "none", margin: 0, gap: 12, padding: "14px 20px 6px" }}
        >
          <Card n="01" title="Agent arrives" body="Assistants from ChatGPT, Gemini or a browser try to buy for someone. So do bots.">
            <IdentityBadge tier="verified" />
            <IdentityBadge tier="signed" />
            <IdentityBadge tier="unknown" />
          </Card>
          <Card n="02" title="Doorman checks who it works for" body="Signature, agent pass, spending cap, drop limit and request rate. Every decision gets a plain-English reason.">
            <DecisionBadge decision="allowed" />
            <DecisionBadge decision="step_up" />
            <DecisionBadge decision="throttled" />
            <DecisionBadge decision="blocked" />
          </Card>
          <Card n="03" title="Customer approves in PayPal" body="Money is held, then charged only if the person who paid is the person who linked the agent.">
            <span className="mono" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span style={{ padding: "5px 10px", borderRadius: 7, background: "#FDF1DC", color: "#8A5300", fontWeight: 600 }}>Held {price}</span>
              <span aria-hidden="true" style={{ color: "#8E919A" }}>
                →
              </span>
              <span className="sr-only">then</span>
              <span style={{ padding: "5px 10px", borderRadius: 7, background: "#E4F4EA", color: "#0F6B3E", fontWeight: 600 }}>Charged {price}</span>
            </span>
          </Card>
        </ol>
        <div aria-hidden="true" style={{ display: "flex", justifyContent: "center", gap: 6, paddingTop: 10 }}>
          {[0, 1, 2].map((n) => (
            <span key={n} style={{ width: n === card ? 20 : 6, height: 6, borderRadius: 3, background: n === card ? "#15171C" : "#C9C6BD", transition: "width .3s ease, background .3s ease" }} />
          ))}
        </div>

        <nav aria-label="Other screens" className="m-pad" style={{ paddingTop: 34 }}>
          <div className="m-eyebrow" style={{ marginBottom: 6 }}>
            Other screens
          </div>
          <div className="m-card" style={{ overflow: "hidden" }}>
            {[...links, [repoUrl, "GitHub repo"] as [string, string]].map(([to, label], i) => {
              const style = { display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 52, padding: "0 16px", fontSize: 16, fontWeight: 500, borderTop: i ? "1px solid #EEEDE8" : "none" } as const;
              const chevron = <Icon d={ICON.chevronRight} color="#8E919A" width={1.8} />;
              return to.startsWith("/") ? (
                <Link key={to} to={to} style={style}>
                  {label}
                  {chevron}
                </Link>
              ) : (
                <a key={to} href={to} target="_blank" rel="noreferrer" style={style}>
                  {label}
                  <span className="sr-only"> (opens in a new tab)</span>
                  {chevron}
                </a>
              );
            })}
          </div>
        </nav>
        <p className="m-pad" style={{ fontSize: 13, lineHeight: 1.5, color: "#6B6E76", margin: "20px 0 0" }}>
          Doorman isn't affiliated with PayPal. PayPal buttons are rendered by PayPal.
        </p>
      </main>
    </div>
  );
}
