// Works out who is at the door for one request: an unsigned visitor, or a
// signed agent (and, if it presents one, the customer pass it carries).
import { createHash } from "node:crypto";
import { getConnInfo } from "@hono/node-server/conninfo";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { findAgent, type AgentRow } from "../agents/registry.js";
import { createNonceStore, hasSignature, verifyRequest } from "../agents/signatures.js";
import { db, schema } from "../db/client.js";
import { PASS_HEADER } from "./constants.js";
import type { CustomerRow } from "./sessions.js";

export type PassRow = typeof schema.passes.$inferSelect;

export interface Visitor {
  tier: "unknown" | "signed";
  visitorKey: string;
  agent: AgentRow | null;
  // The pass the agent presented, valid or not; the engine decides what it means.
  pass: PassRow | null;
  customer: CustomerRow | null;
  passError: "unknown_pass" | "wrong_agent" | null;
}

const nonces = createNonceStore();

export function hashPassToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function clientIp(c: Context): string {
  // The last entry is the one our host's proxy added; earlier entries can be faked by the client.
  const forwarded = c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim();
  if (forwarded) return forwarded;
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function identifyVisitor(c: Context, body: string): Promise<Visitor | { rejected: string }> {
  const header = (name: string) => c.req.header(name);
  if (!hasSignature(header)) {
    return { tier: "unknown", visitorKey: `ip:${clientIp(c)}`, agent: null, pass: null, customer: null, passError: null };
  }

  const keyId = /keyid="([^"]+)"/.exec(header("signature-input") ?? "")?.[1];
  const known = keyId ? await findAgent(keyId) : undefined;
  const result = verifyRequest({
    method: c.req.method,
    url: c.req.url,
    body,
    header,
    lookupKey: (id) => (known && id === known.agent.keyId ? known.key : undefined),
    nonces,
  });
  if (!result.ok) return { rejected: result.reason };
  const agent = known!.agent;

  const token = header(PASS_HEADER);
  if (!token) {
    return { tier: "signed", visitorKey: agent.keyId, agent, pass: null, customer: null, passError: null };
  }

  const [pass] = await db.select().from(schema.passes).where(eq(schema.passes.tokenHash, hashPassToken(token)));
  if (!pass) return { tier: "signed", visitorKey: agent.keyId, agent, pass: null, customer: null, passError: "unknown_pass" };
  // A pass only works for the agent it was issued to, so a leaked token is useless to anyone else.
  if (pass.agentKeyId !== agent.keyId) {
    return { tier: "signed", visitorKey: agent.keyId, agent, pass: null, customer: null, passError: "wrong_agent" };
  }
  const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.payerId, pass.customerPayerId));
  return { tier: "signed", visitorKey: agent.keyId, agent, pass, customer: customer ?? null, passError: null };
}
