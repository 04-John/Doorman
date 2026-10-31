// "Run the drop": opens a fresh 50-hoodie drop and sends real agents at the
// store through the same MCP door and PayPal sandbox everyone else uses.
// The only thing it can't do is approve payments; that's the customer's job.
import { desc, eq } from "drizzle-orm";
import { setAgentBlocked } from "../agents/registry.js";
import { db, schema } from "../db/client.js";
import { activePass, issuePass } from "../doorman/passes.js";
import type { CustomerRow } from "../doorman/sessions.js";
import { DROP_PRODUCT_ID, startDrop, type DropRow } from "../doorman/store.js";
import { env } from "../env.js";
import { aiEnabled } from "../ai/model.js";
import { StoreAgent } from "./agent-client.js";
import { runAva, type TranscriptEntry } from "./ava-ai.js";
import { demoKeyId, demoStoreAgent, ensureDemoAgents, preparePass, rememberPassToken, type DemoAgentName } from "./demo-agents.js";

let running = false;
export const simulationRunning = () => running;

// Ava's conversation from the latest run, for the dashboard.
let transcript: TranscriptEntry[] = [];
export const avaTranscript = () => transcript;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (msg: string) => console.log(`[sim] ${msg}`);

async function demoAgent(name: DemoAgentName) {
  await setAgentBlocked(demoKeyId(name), false); // a fresh run forgets earlier manual blocks
  return demoStoreAgent(name);
}

// The customer Ava shops for: the configured demo buyer, else whoever logged in most recently.
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

// The agent uses the pass its customer gave it, if it has one. Otherwise the demo
// simulates the customer having linked it earlier.
async function givePass(agent: StoreAgent, agentName: DemoAgentName, buyer: CustomerRow, capCents: number, revoked = false) {
  const keyId = demoKeyId(agentName);
  if (!revoked) {
    const existing = await activePass(keyId, buyer.payerId);
    if (await preparePass(agent, existing?.id ?? null)) return;
  }
  const { pass, token } = await issuePass({ agentKeyId: keyId, customer: buyer, capCents, days: 7 });
  rememberPassToken(pass.id, token);
  if (revoked) await db.update(schema.passes).set({ revokedAt: new Date() }).where(eq(schema.passes.id, pass.id));
  agent.passToken = token;
}

// Bots get addresses from the documentation-only ranges (RFC 5737), never real ones.
async function swarm(size: number, ipFor: (i: number) => string, step: (bot: StoreAgent, i: number) => Promise<unknown>) {
  const bots = Array.from({ length: size }, (_, i) => new StoreAgent(`http://127.0.0.1:${env.PORT}`, `bot-${i}`, null, ipFor(i)));
  await Promise.allSettled(bots.map((bot, i) => step(bot, i)));
  await Promise.allSettled(bots.map((bot) => bot.close()));
}

async function script() {
  await ensureDemoAgents();
  const ava = await demoAgent("Ava");
  const kestrel = await demoAgent("Kestrel");
  const juniper = await demoAgent("Juniper");

  const buyer = await demoBuyer();
  if (buyer) {
    await givePass(ava, "Ava", buyer, 15_000);
    await givePass(juniper, "Juniper", buyer, 30_000, true);
  } else {
    log("No customer has logged in with PayPal yet, so Ava shops without a pass. Log in once on /lab.html to fix this.");
  }

  log("Scalper bots arrive and start browsing");
  await swarm(8, (i) => `198.51.100.${20 + i}`, (bot) => bot.call("search_products", { query: "hoodie" }));

  // The AI Ava thinks at her own pace, so she shops alongside the rest of the drop.
  transcript = [];
  log(aiEnabled ? "Ava (Gemini) starts shopping for her customer" : "Ava browses for her customer");
  const avaRun = aiEnabled ? runAva(ava, transcript) : ava.call("search_products", { query: "hoodie" }).then(() => "failed_early" as const);

  await sleep(1500);
  log("The swarm tries to grab hoodies");
  await swarm(30, (i) => `203.0.113.${10 + (i % 3)}`, async (bot, i) => {
    await bot.call("search_products", { query: "night shift" });
    await bot.call("add_to_cart", { productId: DROP_PRODUCT_ID, quantity: 1 + (i % 3) });
  });

  await sleep(1500);
  log("Kestrel (signed, no customer linked) tries to buy");
  await kestrel.call("search_products", { query: "hoodie" });
  const kCart = await kestrel.call("add_to_cart", { productId: DROP_PRODUCT_ID, quantity: 1 });
  if (kCart.ok) {
    const order = await kestrel.call("checkout", { cartId: kCart.data.cartId });
    if (order.ok) log(`Kestrel's approval link (needs a step up): ${order.data.approvalUrl}`);
  }

  await sleep(1500);
  log("Juniper tries to buy with a revoked pass");
  await juniper.call("add_to_cart", { productId: DROP_PRODUCT_ID, quantity: 1 });

  // 25 bots × 2 requests from one address: well past the per-minute limit whatever the timing.
  await sleep(1500);
  log("The swarm comes back for another go, hammering from one address");
  await swarm(25, () => "203.0.113.10", async (bot) => {
    await bot.call("search_products", { query: "hoodie" });
    await bot.call("add_to_cart", { productId: DROP_PRODUCT_ID, quantity: 2 });
  });

  // A scripted Ava stands in only if the AI never reached the store.
  if ((await avaRun) === "failed_early") {
    log("Ava checks out (scripted)");
    const cart = await ava.call("add_to_cart", { productId: DROP_PRODUCT_ID, quantity: 1 });
    if (cart.ok) {
      const order = await ava.call("checkout", { cartId: cart.data.cartId });
      if (order.ok) log(`Ava's approval link for her customer: ${order.data.approvalUrl}`);
    }
    log("Ava tries for a second hoodie");
    await ava.call("add_to_cart", { productId: DROP_PRODUCT_ID, quantity: 1 });
  }

  await Promise.all([ava.close(), kestrel.close(), juniper.close()]);
  log("Done. Approve Ava's or Kestrel's link to complete a purchase.");
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
