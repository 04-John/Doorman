import { createPublicKey, type KeyObject } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { LruMap } from "../lib/bounded.js";
import { jwkThumbprint, type Ed25519Jwk } from "./signatures.js";

export type AgentRow = typeof schema.agents.$inferSelect;

// Agents are looked up on every signed request, so the most active 5,000 are kept in memory too.
const cache = new LruMap<string, { agent: AgentRow; key: KeyObject }>(5_000);

function remember(agent: AgentRow) {
  const key = createPublicKey({ key: { ...agent.publicJwk }, format: "jwk" });
  cache.set(agent.keyId, { agent, key });
  return agent;
}

export async function registerAgent(input: { name: string; operator: string; publicKey: Ed25519Jwk }): Promise<AgentRow> {
  const publicJwk: Ed25519Jwk = { kty: "OKP", crv: "Ed25519", x: input.publicKey.x };
  const [agent] = await db
    .insert(schema.agents)
    .values({ keyId: jwkThumbprint(publicJwk), name: input.name, operator: input.operator, publicJwk })
    .onConflictDoUpdate({ target: schema.agents.keyId, set: { name: input.name, operator: input.operator } })
    .returning();
  return remember(agent!);
}

export async function findAgent(keyId: string): Promise<{ agent: AgentRow; key: KeyObject } | undefined> {
  const hit = cache.get(keyId);
  if (hit) return hit;
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.keyId, keyId));
  if (!agent) return undefined;
  remember(agent);
  return cache.get(keyId);
}

export async function setAgentBlocked(keyId: string, blocked: boolean): Promise<AgentRow | undefined> {
  const [agent] = await db.update(schema.agents).set({ blocked }).where(eq(schema.agents.keyId, keyId)).returning();
  return agent ? remember(agent) : undefined;
}
