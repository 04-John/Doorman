import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono, type Context } from "hono";
import { findAgent } from "../agents/registry.js";
import { createNonceStore, hasSignature, verifyRequest } from "../agents/signatures.js";
import { buildStoreServer, type Visitor } from "../mcp/store.js";

const nonces = createNonceStore();

type Identified = Visitor | { tier: "rejected"; reason: string };

function identify(c: Context, body: string): Identified {
  const header = (name: string) => c.req.header(name);
  if (!hasSignature(header)) return { tier: "unsigned" };

  const result = verifyRequest({
    method: c.req.method,
    url: c.req.url,
    body,
    header,
    lookupKey: (keyId) => findAgent(keyId)?.publicKey,
    nonces,
  });
  if (!result.ok) return { tier: "rejected", reason: result.reason };

  const agent = findAgent(result.keyId)!;
  return { tier: "signed", keyId: agent.keyId, name: agent.name, operator: agent.operator };
}

export const mcpRoutes = new Hono().all("/mcp", async (c) => {
  const raw = c.req.method === "POST" ? await c.req.text() : "";
  const visitor = identify(c, raw);
  if (visitor.tier === "rejected") {
    console.log(`[doorman] rejected request: ${visitor.reason}`);
    return c.json({ error: "signature_rejected", reason: visitor.reason }, 401);
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
