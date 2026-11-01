import { existsSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { env } from "./env.js";
import { PayPalError } from "./paypal/client.js";
import { agentRoutes } from "./routes/agents.js";
import { authRoutes } from "./routes/auth.js";
import { customerRoutes } from "./routes/customer.js";
import { labRoutes } from "./routes/lab.js";
import { mcpRoutes } from "./routes/mcp.js";
import { merchantRoutes } from "./routes/merchant.js";
import { shopRoutes } from "./routes/shop.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { ensureWebhook } from "./paypal/webhooks.js";
import { ensureDemoAgents } from "./sim/demo-agents.js";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, paypal: env.PAYPAL_ENV }));
app.route("/", authRoutes);
app.route("/", agentRoutes);
app.route("/", mcpRoutes);
app.route("/", customerRoutes);
app.route("/", shopRoutes);
app.route("/", merchantRoutes);
app.route("/", labRoutes);
app.route("/", webhookRoutes);

// In production the server also serves the built web app: one service, one URL.
const webDist = fileURLToPath(new URL("../../web/dist", import.meta.url));
if (existsSync(webDist)) {
  const root = relative(process.cwd(), webDist) || ".";
  app.use("/*", serveStatic({ root }));
  // Client-side routes (/dashboard, /approve/…) all load the app shell; API paths keep their 404s.
  const shell = serveStatic({ root, path: "index.html" });
  app.get("*", (c, next) => (c.req.path.startsWith("/api/") ? next() : shell(c, next)));
}

app.onError((err, c) => {
  if (err instanceof PayPalError) {
    console.error(`[doorman] ${err.message}`, JSON.stringify(err.body));
    return c.json({ error: "paypal_error", status: err.status, debugId: err.debugId, details: err.body }, 502);
  }
  console.error("[doorman] unexpected error:", err);
  return c.json({ error: "internal_error" }, 500);
});

// A stray rejected promise (say, writing to a browser that just left) shouldn't end a live demo.
process.on("unhandledRejection", (reason) => console.error("[doorman] unhandled rejection:", reason));

// So customers can link the demo agents before anyone runs a drop.
ensureDemoAgents().catch((err) => console.error("[doorman] couldn't register the demo agents:", err));

// On the host, so PayPal can tell Doorman about its orders (skipped locally: PayPal needs a public HTTPS address).
ensureWebhook().catch((err) => console.error("[doorman] couldn't register the PayPal webhook:", err));

// Render's free plan sleeps after 15 minutes without visitors, and judges must be
// able to open the demo any time until judging ends (Dec 15), so on Render the
// server visits itself every 10 minutes. /health doesn't touch the database.
const KEEP_AWAKE_UNTIL = Date.parse("2026-12-16T00:00:00Z");
if (env.RENDER_EXTERNAL_URL) {
  const selfCheck = `${env.RENDER_EXTERNAL_URL}/health`;
  setInterval(() => {
    if (Date.now() < KEEP_AWAKE_UNTIL) fetch(selfCheck).catch(() => {});
  }, 10 * 60_000);
}

const server = serve({ fetch: app.fetch, port: env.PORT }, ({ port }) => {
  console.log(`Doorman server running at http://localhost:${port}`);
});
// If the port is taken, exit so the watcher (or the host) can start a clean process.
server.on("error", (err) => {
  console.error("[doorman] server failed to start:", err.message);
  process.exit(1);
});
