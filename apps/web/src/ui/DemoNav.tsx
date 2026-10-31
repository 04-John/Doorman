// A slim strip across the top of every page linking all the demo's screens, so
// anyone trying the demo can jump straight to any of them.
// Add ?clean=1 to a URL to hide it for screen recordings (?clean=0 brings it back).
import { useEffect, useState } from "react";
import { NavLink, useSearchParams } from "react-router";
import { LogoMark } from "./chrome";
import "./demo-nav.css";

const GROUPS = [
  { label: "Merchant", links: [["/dashboard", "Dashboard"], ["/rules", "Rules"], ["/setup", "Settings"]] },
  { label: "Customer", links: [["/store", "Storefront"], ["/link", "Link an agent"], ["/passes", "My passes"]] },
] as const;

const HEIGHT = 36;

function useHidden() {
  const [params] = useSearchParams();
  const clean = params.get("clean");
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem("dm-clean") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (clean !== "1" && clean !== "0") return;
    setHidden(clean === "1");
    try {
      sessionStorage.setItem("dm-clean", clean);
    } catch {
      // Private windows can refuse storage; the URL still decides for this page.
    }
  }, [clean]);
  return hidden;
}

export function DemoNav() {
  const hidden = useHidden();

  // Full-height pages subtract the strip so they still fit the window.
  useEffect(() => {
    document.documentElement.style.setProperty("--demo-nav-h", hidden ? "0px" : `${HEIGHT}px`);
  }, [hidden]);

  if (hidden) return null;
  return (
    <nav className="dm-demo-nav" aria-label="Demo screens" style={{ height: HEIGHT }}>
      <NavLink to="/" end className="dm-demo-home">
        <LogoMark size={15} color="#15171C" />
        Demo overview
      </NavLink>
      {GROUPS.map((group) => (
        <span key={group.label} className="dm-demo-group">
          <span className="dm-demo-label">{group.label}</span>
          {group.links.map(([to, label]) => (
            <NavLink key={to} to={to} className="dm-demo-link">
              {label}
            </NavLink>
          ))}
        </span>
      ))}
    </nav>
  );
}
