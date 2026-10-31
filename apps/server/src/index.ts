import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { env } from "./env.js";
import { PayPalError } from "./paypal/client.js";
import { agentRoutes } from "./routes/agents.js";
import { labRoutes } from "./routes/lab.js";
import { mcpRoutes } from "./routes/mcp.js";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, paypal: env.PAYPAL_ENV }));
app.route("/", agentRoutes);
app.route("/", mcpRoutes);
app.route("/", labRoutes);

app.onError((err, c) => {
  if (err instanceof PayPalError) {
    console.error(`[doorman] ${err.message}`, JSON.stringify(err.body));
    return c.json({ error: "paypal_error", status: err.status, debugId: err.debugId, details: err.body }, 502);
  }
  console.error("[doorman] unexpected error:", err);
  return c.json({ error: "internal_error" }, 500);
});

serve({ fetch: app.fetch, port: env.PORT }, ({ port }) => {
  console.log(`Doorman server running at http://localhost:${port}`);
});
