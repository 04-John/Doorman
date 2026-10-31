// Run with: npm run demo:agent  (while `npm run dev` is running)
// Visits the store three ways and prints how Doorman saw each visit.
import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { signRequest, type Ed25519Jwk } from "../agents/signatures.js";

const BASE = process.env.DOORMAN_URL ?? "http://localhost:8787";
type Fetch = typeof fetch;

function requestUrl(input: Parameters<Fetch>[0]): string {
  return input instanceof Request ? input.url : String(input);
}

// Signs every request the MCP client sends. `tamper` changes the body after
// signing, which is what a man-in-the-middle or a copied signature looks like.
function signingFetch(privateKey: KeyObject, keyId: string, tamper = false): Fetch {
  return async (input, init) => {
    const body = typeof init?.body === "string" ? init.body : "";
    const headers = new Headers(init?.headers);
    const signed = signRequest({ method: init?.method ?? "GET", url: requestUrl(input), body, privateKey, keyId });
    for (const [name, value] of Object.entries(signed)) headers.set(name, value);
    const sentBody = tamper && body ? body.replace("hoodie", "everything") : init?.body;
    return fetch(input, { ...init, headers, body: sentBody });
  };
}

async function search(label: string, fetchImpl?: Fetch) {
  const client = new Client({ name: label, version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL("/mcp", BASE), fetchImpl ? { fetch: fetchImpl } : undefined);
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: "search_products", arguments: { query: "hoodie" } });
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0]!.text) as { seenAs: string; products: { name: string }[] };
    console.log(`  Doorman saw: ${parsed.seenAs}; found ${parsed.products.map((p) => p.name).join(", ")}`);
  } catch (err) {
    console.log(`  Blocked: ${err instanceof Error ? err.message : err}`);
  } finally {
    await client.close().catch(() => {});
  }
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const res = await fetch(`${BASE}/agents/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Ava", operator: "Demo Assistant Co.", publicKey: publicKey.export({ format: "jwk" }) as Ed25519Jwk }),
});
if (!res.ok) throw new Error(`Agent registration failed: ${res.status} ${await res.text()}`);
const { keyId } = (await res.json()) as { keyId: string };

console.log("1. Unsigned visit");
await search("unsigned-bot");

console.log("2. Signed visit from registered agent Ava");
await search("ava", signingFetch(privateKey, keyId));

console.log("3. Signed visit with a tampered body");
await search("tampered", signingFetch(privateKey, keyId, true));
