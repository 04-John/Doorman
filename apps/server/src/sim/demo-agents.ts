// The demo agents. This server holds their keys, so it can act for them: in
// "Run the drop", and when a customer asks one to buy from the store. They go
// through the same MCP door, signatures and passes as any outside agent.
import { eq } from "drizzle-orm";
import { registerAgent } from "../agents/registry.js";
import { db, schema } from "../db/client.js";
import { env } from "../env.js";
import { demoKey, StoreAgent } from "./agent-client.js";

// "listed" agents appear in the picker when a customer links one from the store.
// Kestrel isn't: in the demo it's the agent no customer has linked yet.
export const DEMO_AGENTS = [
  { name: "Ava", operator: "Demo Assistant Co.", listed: true },
  { name: "Juniper", operator: "Brightline AI", listed: true },
  { name: "Milo", operator: "Orbit Assist", listed: true },
  { name: "Kestrel", operator: "Northwind Labs", listed: false },
] as const;

export type DemoAgentName = (typeof DEMO_AGENTS)[number]["name"];

const keys = new Map(DEMO_AGENTS.map((a) => [a.name, demoKey(a.name, env.PAYPAL_CLIENT_SECRET)]));

export const demoKeyId = (name: DemoAgentName) => keys.get(name)!.keyId;

export function demoAgentByKeyId(keyId: string) {
  return DEMO_AGENTS.find((a) => keys.get(a.name)!.keyId === keyId);
}

// So customers can pick them before anyone has run the drop.
export async function ensureDemoAgents() {
  for (const a of DEMO_AGENTS) await registerAgent({ name: a.name, operator: a.operator, publicKey: keys.get(a.name)!.publicJwk });
}

export function demoStoreAgent(name: DemoAgentName) {
  return new StoreAgent(`http://127.0.0.1:${env.PORT}`, name, keys.get(name)!);
}

// Pass tokens the demo agents have collected. A real agent keeps its own; these
// are kept in the database, so the agents still have them after a redeploy.
export async function rememberPassToken(passId: string, token: string) {
  await db.insert(schema.demoAgentTokens).values({ passId, token }).onConflictDoNothing();
}

// Picks up any passes customers gave this agent, then uses the given one if it has its token.
export async function preparePass(agent: StoreAgent, passId: string | null): Promise<boolean> {
  const collected = await agent.call("collect_agent_pass");
  const passes = collected.ok && Array.isArray(collected.data.passes) ? (collected.data.passes as { passId: string; passToken: string }[]) : [];
  for (const p of passes) await rememberPassToken(p.passId, p.passToken);
  const [held] = passId ? await db.select().from(schema.demoAgentTokens).where(eq(schema.demoAgentTokens.passId, passId)) : [];
  agent.passToken = held?.token ?? null;
  return agent.passToken !== null;
}

export type Errand =
  | { ok: true; approvalPath: string; decision: string }
  | { ok: false; decision: string | null; reason: string };

// A customer asks a demo agent to buy something. Doorman judges the agent like
// any other, and if it lets the checkout through the customer gets an approval link.
export async function agentBuys(input: { keyId: string; passId: string | null; productId: string; size?: string | null; quantity: number }): Promise<Errand> {
  const demo = demoAgentByKeyId(input.keyId);
  if (!demo) return { ok: false, decision: null, reason: "Only the demo agents can shop from here. Ask your own agent directly." };
  const agent = demoStoreAgent(demo.name);
  try {
    // Only passes collected before tokens were kept in the database can be missing.
    if (!(await preparePass(agent, input.passId)) && input.passId) {
      return { ok: false, decision: null, reason: `${demo.name} no longer has this pass. Link ${demo.name} again to give a new one.` };
    }
    const refusal = (data: Record<string, unknown>): Errand => ({
      ok: false,
      decision: typeof data.doorman === "string" ? data.doorman : null,
      reason: String(data.reason ?? data.error ?? "The store said no"),
    });
    const cart = await agent.call("add_to_cart", {
      productId: input.productId,
      quantity: input.quantity,
      ...(input.size ? { size: input.size } : {}),
    });
    if (!cart.ok) return refusal(cart.data);
    const order = await agent.call("checkout", { cartId: cart.data.cartId });
    if (!order.ok) return refusal(order.data);
    const token = String(order.data.approvalUrl).split("/approve/")[1]!;
    return { ok: true, approvalPath: `/approve/${token}`, decision: String(order.data.doorman) };
  } finally {
    await agent.close();
  }
}
