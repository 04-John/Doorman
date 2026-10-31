// Run with: npm run demo:agent  (while `npm run dev` is running)
// Visits the store three ways and prints how Doorman answered each one.
import { generateKeyPairSync } from "node:crypto";
import type { Ed25519Jwk } from "../agents/signatures.js";
import { StoreAgent } from "../sim/agent-client.js";
import { jwkThumbprint } from "../agents/signatures.js";

const BASE = process.env.DOORMAN_URL ?? "http://127.0.0.1:8787";

async function visit(label: string, agent: StoreAgent) {
  console.log(label);
  try {
    const { ok, data } = await agent.call("search_products", { query: "hoodie" });
    const products = (data.products as { name: string }[] | undefined)?.map((p) => p.name).join(", ");
    console.log(ok ? `  Let in; found ${products}` : `  Turned away: ${data.reason}`);
  } catch (err) {
    console.log(`  Blocked: ${err instanceof Error ? err.message : err}`);
  } finally {
    await agent.close();
  }
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicJwk = publicKey.export({ format: "jwk" }) as Ed25519Jwk;
const res = await fetch(`${BASE}/agents/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Demo Agent", operator: "agent-demo script", publicKey: publicJwk }),
});
if (!res.ok) throw new Error(`Agent registration failed: ${res.status} ${await res.text()}`);
const key = { privateKey, keyId: jwkThumbprint(publicJwk) };

await visit("1. Unsigned visitor", new StoreAgent(BASE, "unsigned"));
await visit("2. Signed, registered agent", new StoreAgent(BASE, "signed", key));
// Signed with a different private key than the registered one: the signature won't verify.
await visit("3. Agent forging someone else's key ID", new StoreAgent(BASE, "forger", { privateKey: generateKeyPairSync("ed25519").privateKey, keyId: key.keyId }));
