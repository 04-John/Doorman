import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Outlet, Link as RouterLink, Route, Routes } from "react-router";
import "./styles/tokens.css";
import { Spinner } from "./ui/bits";
import { DemoNav } from "./ui/DemoNav";
import { MerchantGate } from "./ui/MerchantGate";
import { ToastProvider } from "./ui/toast";

// Each screen loads on its own, so the customer pages never download the dashboard grid.
const DemoHub = lazy(() => import("./pages/DemoHub"));
const Dashboard = lazy(() => import("./pages/dashboard/Dashboard"));
const Setup = lazy(() => import("./pages/Setup"));
const Storefront = lazy(() => import("./pages/Storefront"));
const Approve = lazy(() => import("./pages/Approve"));
const LinkAgent = lazy(() => import("./pages/Link"));
const Passes = lazy(() => import("./pages/Link").then((m) => ({ default: m.Passes })));

function Loading() {
  return (
    <div style={{ height: "100%", display: "grid", placeItems: "center" }} aria-busy="true">
      <Spinner size={28} />
    </div>
  );
}

// Every screen sits under the demo strip, so each one links to all the others.
function WithDemoNav() {
  return (
    <>
      <DemoNav />
      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>
    </>
  );
}

function NotFound() {
  return (
    <div style={{ height: "100%", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
      <div>
        <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>Page not found</h1>
        <RouterLink to="/" className="btn btn-secondary btn-sm">
          Back to the demo
        </RouterLink>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<WithDemoNav />}>
            <Route path="/" element={<DemoHub />} />
            <Route element={<MerchantGate />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="/rules" element={<Setup mode="rules" />} />
            </Route>
            <Route path="/store" element={<Storefront />} />
            <Route path="/approve/:token" element={<Approve />} />
            <Route path="/link" element={<LinkAgent />} />
            <Route path="/link/:id" element={<LinkAgent />} />
            <Route path="/passes" element={<Passes />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  </StrictMode>,
);
