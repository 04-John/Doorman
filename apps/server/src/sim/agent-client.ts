// A minimal store agent: connects to the store over MCP and, if it has a key,
// signs every request (and sends its agent pass when it has one).
import { createHash, createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { jwkThumbprint, signRequest, type Ed25519Jwk } from "../agents/signatures.js";
import { PASS_HEADER } from "../doorman/constants.js";

// DER header for an Ed25519 private key; the last 32 bytes are the seed.
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

// Demo agents get the same key on every run, so they keep their identity.
export function demoKey(name: string, secret: string) {
  const seed = createHash("sha256").update(`doorman-demo-agent:${name}:${secret}`).digest();
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: "der", type: "pkcs8" });
  const publicJwk = createPublicKey(privateKey).export({ format: "jwk" }) as Ed25519Jwk;
  return { privateKey, publicJwk, keyId: jwkThumbprint(publicJwk) };
}

export interface AgentKey {
  privateKey: KeyObject;
  keyId: string;
}

export interface ToolOutcome {
  ok: boolean;
  data: Record<string, unknown>;
}

export class StoreAgent {
  private client: Client | null = null;
  passToken: string | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly label: string,
    private readonly key: AgentKey | null = null,
    // Simulated network address (sent as X-Forwarded-For), so a simulated swarm
    // looks like many machines instead of one.
    private readonly ip: string | null = null,
  ) {}

  private fetch: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    if (this.ip) headers.set("x-forwarded-for", this.ip);
    if (this.key) {
      const url = input instanceof Request ? input.url : String(input);
      const body = typeof init?.body === "string" ? init.body : "";
      const signed = signRequest({ method: init?.method ?? "GET", url, body, privateKey: this.key.privateKey, keyId: this.key.keyId });
      for (const [name, value] of Object.entries(signed)) headers.set(name, value);
      if (this.passToken) headers.set(PASS_HEADER, this.passToken);
    }
    return fetch(input, { ...init, headers });
  };

  async call(tool: string, args: Record<string, unknown> = {}): Promise<ToolOutcome> {
    if (!this.client) {
      const client = new Client({ name: this.label, version: "0.2.0" });
      await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", this.baseUrl), { fetch: this.fetch }));
      this.client = client;
    }
    const result = await this.client.callTool({ name: tool, arguments: args });
    const text = (result.content as { type: string; text?: string }[])[0]?.text ?? "{}";
    return { ok: !result.isError, data: JSON.parse(text) as Record<string, unknown> };
  }

  async close() {
    await this.client?.close().catch(() => {});
    this.client = null;
  }
}
