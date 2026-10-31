// Agent passes. An agent asks to be linked; the customer logs in with PayPal,
// sets a cap and expiry, and approves; the agent then collects its pass token once.
import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { AgentRow } from "../agents/registry.js";
import { db, schema } from "../db/client.js";
import { env } from "../env.js";
import { hashPassToken } from "./identity.js";
import type { CustomerRow } from "./sessions.js";

const LINK_REQUEST_MINUTES = 30;

export function newPassToken(): string {
  return `dp_${randomBytes(24).toString("base64url")}`;
}

export function linkUrl(requestId: string): string {
  return `${env.PUBLIC_URL}/link/${requestId}`;
}

export async function createLinkRequest(agent: AgentRow) {
  const [request] = await db
    .insert(schema.linkRequests)
    .values({ agentKeyId: agent.keyId, expiresAt: new Date(Date.now() + LINK_REQUEST_MINUTES * 60_000) })
    .returning();
  return { requestId: request!.id, linkUrl: linkUrl(request!.id), expiresAt: request!.expiresAt };
}

export async function linkRequestView(id: string) {
  const [row] = await db
    .select({ request: schema.linkRequests, agent: schema.agents })
    .from(schema.linkRequests)
    .innerJoin(schema.agents, eq(schema.agents.keyId, schema.linkRequests.agentKeyId))
    .where(eq(schema.linkRequests.id, id));
  if (!row) return null;
  return {
    id: row.request.id,
    status: row.request.expiresAt < new Date() && row.request.status === "pending" ? "expired" : row.request.status,
    agent: { name: row.agent.name, operator: row.agent.operator, keyId: row.agent.keyId },
  };
}

export async function issuePass(input: { agentKeyId: string; customer: CustomerRow; capCents: number; days: number }) {
  const token = newPassToken();
  const [pass] = await db
    .insert(schema.passes)
    .values({
      tokenHash: hashPassToken(token),
      agentKeyId: input.agentKeyId,
      customerPayerId: input.customer.payerId,
      capCents: input.capCents,
      expiresAt: new Date(Date.now() + input.days * 86_400_000),
    })
    .returning();
  return { pass: pass!, token };
}

export async function approveLinkRequest(id: string, customer: CustomerRow, capCents: number, days: number) {
  const view = await linkRequestView(id);
  if (!view || view.status !== "pending") return null;
  const { pass, token } = await issuePass({ agentKeyId: view.agent.keyId, customer, capCents, days });
  await db
    .update(schema.linkRequests)
    .set({ status: "approved", passId: pass.id, pendingToken: token })
    .where(eq(schema.linkRequests.id, id));
  return pass;
}

// The agent collects its token. It's handed over once and then forgotten.
export async function collectPassToken(id: string, agentKeyId: string) {
  const [request] = await db
    .select()
    .from(schema.linkRequests)
    .where(and(eq(schema.linkRequests.id, id), eq(schema.linkRequests.agentKeyId, agentKeyId)));
  if (!request) return { status: "not_found" as const };
  if (request.status === "pending") {
    return { status: request.expiresAt < new Date() ? ("expired" as const) : ("pending" as const) };
  }
  if (!request.pendingToken) return { status: "already_collected" as const };
  await db.update(schema.linkRequests).set({ pendingToken: null }).where(eq(schema.linkRequests.id, id));
  return { status: "approved" as const, passToken: request.pendingToken };
}

export async function passesFor(customer: CustomerRow) {
  return db
    .select({
      id: schema.passes.id,
      capCents: schema.passes.capCents,
      expiresAt: schema.passes.expiresAt,
      revokedAt: schema.passes.revokedAt,
      createdAt: schema.passes.createdAt,
      agentName: schema.agents.name,
      operator: schema.agents.operator,
    })
    .from(schema.passes)
    .innerJoin(schema.agents, eq(schema.agents.keyId, schema.passes.agentKeyId))
    .where(eq(schema.passes.customerPayerId, customer.payerId))
    .orderBy(desc(schema.passes.createdAt));
}

export async function revokePass(passId: string, customer: CustomerRow) {
  const [pass] = await db
    .update(schema.passes)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(schema.passes.id, passId), eq(schema.passes.customerPayerId, customer.payerId), isNull(schema.passes.revokedAt)),
    )
    .returning();
  return pass ?? null;
}

export async function activePass(agentKeyId: string, payerId: string) {
  const [pass] = await db
    .select()
    .from(schema.passes)
    .where(
      and(
        eq(schema.passes.agentKeyId, agentKeyId),
        eq(schema.passes.customerPayerId, payerId),
        isNull(schema.passes.revokedAt),
        gt(schema.passes.expiresAt, new Date()),
      ),
    );
  return pass ?? null;
}
