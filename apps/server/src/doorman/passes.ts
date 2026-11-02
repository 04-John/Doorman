// Agent passes. Either an agent asks to be linked, or the customer picks the agent
// themselves; either way they log in with PayPal, set a cap and expiry, and the
// agent then collects its pass token once.
import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import type { AgentRow } from "../agents/registry.js";
import { db, schema } from "../db/client.js";
import { env } from "../env.js";
import { hashPassToken } from "./identity.js";
import type { CustomerRow } from "./sessions.js";
import { APPROVAL_MINUTES } from "./store.js";

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

// A customer has one live pass per agent: a new one replaces the old. The drop
// simulation's own passes leave the customer's alone.
export async function issuePass(input: { agentKeyId: string; customer: CustomerRow; capCents: number; days: number; simulated?: boolean }) {
  if (!input.simulated) {
    await db
      .update(schema.passes)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.passes.agentKeyId, input.agentKeyId),
          eq(schema.passes.customerPayerId, input.customer.payerId),
          isNull(schema.passes.revokedAt),
        ),
      );
  }
  const token = newPassToken();
  const [pass] = await db
    .insert(schema.passes)
    .values({
      tokenHash: hashPassToken(token),
      agentKeyId: input.agentKeyId,
      customerPayerId: input.customer.payerId,
      capCents: input.capCents,
      expiresAt: new Date(Date.now() + input.days * 86_400_000),
      simulated: input.simulated ?? false,
    })
    .returning();
  return { pass: pass!, token };
}

// What an agent has spent with a pass, which counts against its cap: paid or held,
// and (when checking a new purchase) purchases still waiting for the customer's
// approval, since those would be charged the moment the customer approves.
export async function passSpent(passId: string, opts: { includeAwaiting: boolean; excludeOrderId?: string }): Promise<number> {
  const counted = opts.includeAwaiting
    ? or(
        inArray(schema.orders.status, ["held", "charged"]),
        and(eq(schema.orders.status, "awaiting_approval"), gt(schema.orders.createdAt, new Date(Date.now() - APPROVAL_MINUTES * 60_000))),
      )
    : inArray(schema.orders.status, ["held", "charged"]);
  const [row] = await db
    .select({ cents: sql<number>`coalesce(sum(${schema.orders.amountCents}), 0)::int` })
    .from(schema.orders)
    .where(and(eq(schema.orders.passId, passId), counted, opts.excludeOrderId ? ne(schema.orders.id, opts.excludeOrderId) : undefined));
  return row?.cents ?? 0;
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

// The customer chose the agent themselves (from the store, not from a link the
// agent sent). The token waits until the agent next collects its passes.
export async function grantPass(agentKeyId: string, customer: CustomerRow, capCents: number, days: number) {
  const { pass, token } = await issuePass({ agentKeyId, customer, capCents, days });
  await db
    .insert(schema.linkRequests)
    .values({ agentKeyId, status: "approved", passId: pass.id, pendingToken: token, expiresAt: pass.expiresAt });
  return pass;
}

// Every pass token waiting for this agent, handed over once.
export async function collectWaitingPasses(agentKeyId: string) {
  const waiting = await db
    .select({ id: schema.linkRequests.id, passId: schema.linkRequests.passId, token: schema.linkRequests.pendingToken, holder: schema.customers.name })
    .from(schema.linkRequests)
    .innerJoin(schema.passes, eq(schema.passes.id, schema.linkRequests.passId))
    .innerJoin(schema.customers, eq(schema.customers.payerId, schema.passes.customerPayerId))
    .where(and(eq(schema.linkRequests.agentKeyId, agentKeyId), isNotNull(schema.linkRequests.pendingToken)));
  if (waiting.length === 0) return { status: "none" as const, passes: [] };
  await db
    .update(schema.linkRequests)
    .set({ pendingToken: null })
    .where(inArray(schema.linkRequests.id, waiting.map((w) => w.id)));
  return { status: "approved" as const, passes: waiting.map((w) => ({ passId: w.passId!, passToken: w.token!, holder: w.holder })) };
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
      agentKeyId: schema.agents.keyId,
      // What the agent has actually spent with this pass.
      usedCents: sql<number>`coalesce((select sum(${schema.orders.amountCents}) from ${schema.orders} where ${schema.orders.passId} = ${schema.passes.id} and ${schema.orders.status} in ('held', 'charged')), 0)::int`,
    })
    .from(schema.passes)
    .innerJoin(schema.agents, eq(schema.agents.keyId, schema.passes.agentKeyId))
    .where(and(eq(schema.passes.customerPayerId, customer.payerId), eq(schema.passes.simulated, false)))
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
