// "Run the drop": opens a fresh 50-hoodie drop and sends real agents at the
// store through the same MCP door and PayPal sandbox everyone else uses.
// The only thing it can't do is approve payments; that's the customer's job.
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { setAgentBlocked } from "../agents/registry.js";
import { db, schema } from "../db/client.js";
import { issuePass } from "../doorman/passes.js";
import type { CustomerRow } from "../doorman/sessions.js";
import { DROP_PRODUCT_ID, startDrop, type DropRow } from "../doorman/store.js";
import { env } from "../env.js";
import { aiEnabled } from "../ai/model.js";
import { simulatorHeaders } from "../lib/client-ip.js";
import { StoreAgent } from "./agent-client.js";
import { runAssistant, type TranscriptEntry } from "./ava-ai.js";
import { DEMO_AGENTS, demoAgentByKeyId, demoKeyId, demoStoreAgent, ensureDemoAgents, preparePass, rememberPassToken, type DemoAgentName } from "./demo-agents.js";

let running = false;
export const simulationRunning = () => running;

// The customer's assistant's conversation from the latest run, for the dashboard,
// with who was talking.
let transcript: TranscriptEntry[] = [];
let people: { agent: DemoAgentName; customer: string | null } = { agent: "Ava", customer: null };
export const latestTranscript = () => ({ transcript, ...people });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (msg: string) => console.log(`[sim] ${msg}`);

type PassRow = typeof schema.passes.$inferSelect;
const LISTED = DEMO_AGENTS.filter((a) => a.listed).map((a) => a.name);

async function demoAgent(name: DemoAgentName) {
  await setAgentBlocked(demoKeyId(name), false); // a fresh run forgets earlier manual blocks
  return demoStoreAgent(name);
}

// The customer the drop's assistant shops for: the configured demo buyer, else whoever logged in most recently.
async function demoBuyer(): Promise<CustomerRow | null> {
  if (env.DEMO_BUYER_PAYER_ID) {
    const [buyer] = await db.select().from(schema.customers).where(eq(schema.customers.payerId, env.DEMO_BUYER_PAYER_ID));
    if (buyer) return buyer;
  }
  const [latest] = await db
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.verified, true))
    .orderBy(desc(schema.customers.createdAt))
    .limit(1);
  return latest ?? null;
}

// The customer's assistant is the agent they linked most recently, shopping with
// that pass as it stands: if they revoked it or it ran out, Doorman refuses it.
// An account that never linked one gets Ava, as if they had linked her earlier.
async function customersAssistant(buyer: CustomerRow): Promise<{ name: DemoAgentName; pass: PassRow | null }> {
  const [latest] = await db
    .select()
    .from(schema.passes)
    .where(and(eq(schema.passes.customerPayerId, buyer.payerId), eq(schema.passes.simulated, false), inArray(schema.passes.agentKeyId, LISTED.map(demoKeyId))))
    .orderBy(desc(schema.passes.createdAt))
    .limit(1);
  return latest ? { name: demoAgentByKeyId(latest.agentKeyId)!.name, pass: latest } : { name: "Ava", pass: null };
}

async function giveAssistantPass(agent: StoreAgent, name: DemoAgentName, buyer: CustomerRow, pass: PassRow | null) {
  if (pass) {
    if (!(await preparePass(agent, pass.id))) log(`${name} never collected its pass (it was revoked first), so it shops without one`);
    return;
  }
  const { pass: issued, token } = await issuePass({ agentKeyId: demoKeyId(name), customer: buyer, capCents: 15_000, days: 7 });
  await rememberPassToken(issued.id, token);
  agent.passToken = token;
}

// Another demo agent shows Doorman refusing a revoked pass. That pass is the
// simulation's own, made once and reused: it never shows in the customer's
// passes and never replaces one they gave.
async function giveRevokedPass(agent: StoreAgent, name: DemoAgentName, buyer: CustomerRow) {
  const keyId = demoKeyId(name);
  const [kept] = await db
    .select({ id: schema.passes.id })
    .from(schema.passes)
    .innerJoin(schema.demoAgentTokens, eq(schema.demoAgentTokens.passId, schema.passes.id))
    .where(and(eq(schema.passes.agentKeyId, keyId), eq(schema.passes.customerPayerId, buyer.payerId), eq(schema.passes.simulated, true), isNotNull(schema.passes.revokedAt)))
    .orderBy(desc(schema.passes.createdAt))
    .limit(1);
  if (kept && (await preparePass(agent, kept.id))) return;
  const { pass, token } = await issuePass({ agentKeyId: keyId, customer: buyer, capCents: 30_000, days: 7, simulated: true });
  await rememberPassToken(pass.id, token);
  await db.update(schema.passes).set({ revokedAt: new Date() }).where(eq(schema.passes.id, pass.id));
  agent.passToken = token;
}

// Bots get addresses from the documentation-only ranges (RFC 5737), never real ones.
async function swarm(size: number, ipFor: (i: number) => string, step: (bot: StoreAgent, i: number) => Promise<unknown>) {
  const bots = Array.from({ length: size }, (_, i) => new StoreAgent(`http://127.0.0.1:${env.PORT}`, `bot-${i}`, null, ipFor(i), simulatorHeaders()));
  await Promise.allSettled(bots.map((bot, i) => step(bot, i)));
  await Promise.allSettled(bots.map((bot) => bot.close()));
}

async function script() {
  await ensureDemoAgents();
  const buyer = await demoBuyer();
  const mine = buyer ? await customersAssistant(buyer) : { name: "Ava" as const, pass: null };
  const revokedName: DemoAgentName = mine.name === "Juniper" ? "Milo" : "Juniper";
  const assistant = await demoAgent(mine.name);
  const kestrel = await demoAgent("Kestrel");
  const revoked = await demoAgent(revokedName);

  if (buyer) {
    await giveAssistantPass(assistant, mine.name, buyer, mine.pass);
    await giveRevokedPass(revoked, revokedName, buyer);
  } else {
    log("No customer has logged in with PayPal yet, so Ava shops without a pass. Link an agent from the store (/link) to fix this.");
  }

  log("Scalper bots arrive and start browsing");
  await swarm(8, (i) => `198.51.100.${20 + i}`, (bot) => bot.call("search_products", { query: "hoodie" }));

  // The AI assistant thinks at its own pace, so it shops alongside the rest of the drop.
  transcript = [];
  people = { agent: mine.name, customer: buyer?.name ?? null };
  const operator = DEMO_AGENTS.find((a) => a.name === mine.name)!.operator;
  log(aiEnabled ? `${mine.name} (Gemini) starts shopping for the customer` : `${mine.name} browses for the customer`);
  const assistantRun = aiEnabled
    ? runAssistant(assistant, { name: mine.name, operator, customer: buyer?.name ?? null }, transcript)
    : assistant.call("search_products", { query: "hoodie" }).then(() => "failed_early" as const);

  await sleep(1500);
  log("The swarm tries to grab hoodies");
  await swarm(30, (i) => `203.0.113.${10 + (i % 3)}`, async (bot, i) => {
    await bot.call("search_products", { query: "night shift" });
    await bot.call("add_to_cart", { productId: DROP_PRODUCT_ID, quantity: 1 + (i % 3) });
  });

  await sleep(1500);
  log("Kestrel (signed, no customer linked) tries to buy");
  await kestrel.call("search_products", { query: "hoodie" });
  const kCart = await kestrel.call("add_to_cart", { productId: DROP_PRODUCT_ID, quantity: 1, size: "L" });
  if (kCart.ok) {
    const order = await kestrel.call("checkout", { cartId: kCart.data.cartId });
    if (order.ok) log(`Kestrel's approval link (needs a step up): ${order.data.approvalUrl}`);
  }

  await sleep(1500);
  log(`${revokedName} tries to buy with a revoked pass`);
  await revoked.call("add_to_cart", { productId: DROP_PRODUCT_ID, quantity: 1 });

  // 25 bots × 2 requests from one address: well past the per-minute limit whatever the timing.
  await sleep(1500);
  log("The swarm comes back for another go, hammering from one address");
  await swarm(25, () => "203.0.113.10", async (bot) => {
    await bot.call("search_products", { query: "hoodie" });
    await bot.call("add_to_cart", { productId: DROP_PRODUCT_ID, quantity: 2 });
  });

  // A scripted run stands in only if the AI never reached the store.
  if ((await assistantRun) === "failed_early") {
    log(`${mine.name} checks out (scripted)`);
    const cart = await assistant.call("add_to_cart", { productId: DROP_PRODUCT_ID, quantity: 1, size: "M" });
    if (cart.ok) {
      const order = await assistant.call("checkout", { cartId: cart.data.cartId });
      if (order.ok) log(`${mine.name}'s approval link for the customer: ${order.data.approvalUrl}`);
    }
    log(`${mine.name} tries for a second hoodie`);
    await assistant.call("add_to_cart", { productId: DROP_PRODUCT_ID, quantity: 1 });
  }

  await Promise.all([assistant.close(), kestrel.close(), revoked.close()]);
  log(`Done. Approve ${mine.name}'s or Kestrel's link to complete a purchase.`);
}

export async function runDrop(): Promise<DropRow> {
  running = true;
  const drop = await startDrop();
  log(`Drop ${drop.id} is live`);
  void script()
    .catch((err) => console.error("[sim] failed:", err))
    .finally(() => {
      running = false;
    });
  return drop;
}
