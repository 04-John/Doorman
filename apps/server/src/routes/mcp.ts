import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";
import { identifyVisitor } from "../doorman/identity.js";
import { perMinute } from "../lib/limits.js";
import { buildStoreServer } from "../mcp/store.js";

// Doorman judges and records every agent request; past 600 a minute from one
// address (its own rules allow at most 600) the server stops even recording them.
export const mcpRoutes = new Hono().all("/mcp", perMinute(600), async (c) => {
  const raw = c.req.method === "POST" ? await c.req.text() : "";
  const visitor = await identifyVisitor(c, raw);
  if ("rejected" in visitor) {
    console.log(`[doorman] rejected request: ${visitor.rejected}`);
    return c.json({ error: "signature_rejected", reason: visitor.rejected }, 401);
  }

  let parsedBody: unknown;
  try {
    parsedBody = raw ? JSON.parse(raw) : undefined;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  // Stateless: a fresh server and transport per request, so tools see this caller only.
  const server = buildStoreServer(visitor);
  const transport = new StreamableHTTPTransport();
  await server.connect(transport);
  return transport.handleRequest(c, parsedBody);
});
