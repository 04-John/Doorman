// Screen 7: the landing page judges arrive at. Orients them in ten seconds and
// sends them to the live dashboard or the customer side.
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { api } from "../lib/api";
import { money } from "../lib/format";
import { LogoMark, SandboxTag } from "../ui/chrome";
import { DecisionBadge, IdentityBadge } from "../ui/status";
import "./hub/hub.css";

const REPO_URL = "https://github.com/04-John/Doorman";

// The pitch quotes the real drop; these defaults match the seeded store until it loads.
function useDropFacts() {
  const [facts, setFacts] = useState({ count: 50, priceCents: 6800 });
  useEffect(() => {
    let cancelled = false;
    api.store().then(
      (s) => {
        const drop = s.products.find((p) => p.limitedDrop);
        if (!cancelled && drop) setFacts({ count: s.drop?.stockTotal ?? drop.stock, priceCents: drop.priceCents });
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return facts;
}

export default function DemoHub() {
  const { count, priceCents } = useDropFacts();
  const price = money(priceCents);

  return (
    <div className="hub-page">
      <header className="hub-header hub-gutter">
        <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <LogoMark size={26} color="#15171C" />
          <span style={{ fontWeight: 700, fontSize: 19, letterSpacing: "-0.01em" }}>Doorman</span>
        </span>
        <div className="hub-tag">
          <SandboxTag />
        </div>
        <a className="hub-github" href={REPO_URL} target="_blank" rel="noreferrer">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M5 12.5H3.5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H11M6 6l-2 2 2 2M10 6l2 2-2 2"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          GitHub repo<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </header>

      <main className="hub-main hub-gutter">
        <div style={{ maxWidth: 880 }}>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "#6B6E76" }}>A checkpoint for AI shopping agents</div>
          <h1 className="hub-title">Let real customers' AI agents in. Keep scalper bots out.</h1>
          <p className="hub-lede">
            Watch Static Supply drop {count} Night Shift Hoodies while a verified assistant, an unknown agent and a swarm of scalper bots arrive at once.
          </p>
          <div className="hub-ctas">
            <Link to="/dashboard" className="hub-cta hub-cta-primary">
              <span aria-hidden="true" style={{ width: 26, height: 26, flex: "none", borderRadius: "50%", background: "#FFFFFF", display: "grid", placeItems: "center" }}>
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <path d="M2.5 1.3l6 3.7-6 3.7z" fill="#15171C" />
                </svg>
              </span>
              Open the live demo
            </Link>
            <Link to="/link" className="hub-cta hub-cta-secondary">
              Try it as a customer
            </Link>
          </div>
        </div>

        <ol className="hub-steps" aria-label="How Doorman works">
          <Step n="01" title="Agent arrives" body="Assistants from ChatGPT, Gemini or a browser try to buy for someone. So do bots.">
            <IdentityBadge tier="verified" />
            <IdentityBadge tier="signed" />
            <IdentityBadge tier="unknown" />
          </Step>
          <Step
            n="02"
            title="Doorman checks who it works for"
            body="Signature, agent pass, spending cap, drop limit and request rate. Every decision gets a plain-English reason."
          >
            <DecisionBadge decision="allowed" />
            <DecisionBadge decision="step_up" />
            <DecisionBadge decision="throttled" />
            <DecisionBadge decision="blocked" />
          </Step>
          <Step n="03" title="Customer approves in PayPal" body="Money is held, then charged only if the person who paid is the person who linked the agent.">
            <span className="mono" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span style={{ padding: "4px 9px", borderRadius: 6, background: "#FDF1DC", color: "#8A5300", fontWeight: 600 }}>Held {price}</span>
              <span aria-hidden="true" style={{ color: "#8E919A" }}>
                →
              </span>
              <span className="sr-only">then</span>
              <span style={{ padding: "4px 9px", borderRadius: 6, background: "#E4F4EA", color: "#0F6B3E", fontWeight: 600 }}>Charged {price}</span>
            </span>
          </Step>
        </ol>
      </main>

      <footer className="hub-footer hub-gutter">
        <nav aria-label="Other screens">
          <span>Other screens:</span>
          <Link to="/store">Storefront</Link>
          <Link to="/setup">Merchant setup + Rules</Link>
          <Link to="/link">All customer screens</Link>
        </nav>
        <span className="hub-note">Doorman isn't affiliated with PayPal. PayPal buttons are rendered by PayPal.</span>
      </footer>
    </div>
  );
}

function Step({ n, title, body, children }: { n: string; title: string; body: string; children: ReactNode }) {
  return (
    <li style={{ background: "#FFFFFF", border: "1px solid #E4E2DC", borderRadius: 16, padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
      <span className="mono" aria-hidden="true" style={{ fontSize: 13, fontWeight: 600, color: "#6B6E76" }}>
        {n}
      </span>
      <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>{title}</h2>
      <p style={{ fontSize: 15.5, lineHeight: 1.5, color: "#4A4D55", margin: 0 }}>{body}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: "auto" }}>{children}</div>
    </li>
  );
}
