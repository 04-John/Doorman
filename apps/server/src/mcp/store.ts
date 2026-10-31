// The store as AI agents see it: MCP tools, built per request so every tool
// call knows who Doorman verified the caller to be.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchProducts } from "../store/catalog.js";

export type Visitor =
  | { tier: "unsigned" }
  | { tier: "signed"; keyId: string; name: string; operator: string };

export function describeVisitor(visitor: Visitor): string {
  return visitor.tier === "signed" ? `signed agent "${visitor.name}" (${visitor.operator})` : "unsigned visitor";
}

export function buildStoreServer(visitor: Visitor): McpServer {
  const server = new McpServer({ name: "doorman-store", version: "0.1.0" });

  server.registerTool(
    "search_products",
    {
      title: "Search products",
      description: "Search the store's catalog by name. Returns price, stock and whether an item is a limited drop.",
      inputSchema: { query: z.string().max(100).optional().describe("Words to look for in product names") },
    },
    async ({ query }) => {
      const result = { seenAs: describeVisitor(visitor), products: searchProducts(query) };
      console.log(`[doorman] search_products "${query ?? ""}" from ${result.seenAs}`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  return server;
}
