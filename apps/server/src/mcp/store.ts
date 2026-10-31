// The store as AI agents see it: MCP tools, built per request so every tool
// call knows who Doorman verified the caller to be.
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/client.js";
import { approvalUrl, checkout } from "../doorman/checkout.js";
import { evaluate, record, type Evaluation } from "../doorman/door.js";
import { money } from "../doorman/engine.js";
import type { Visitor } from "../doorman/identity.js";
import { collectPassToken, createLinkRequest } from "../doorman/passes.js";
import { getProduct, searchProducts, type ProductRow } from "../doorman/store.js";

export function describeVisitor(visitor: Visitor): string {
  return visitor.agent ? `${visitor.agent.name} (${visitor.agent.operator})` : "unknown visitor";
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const reply = (payload: unknown, isError = false): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

// Turned away at the door: tell the agent why, in a form it can act on.
function refused({ result }: Evaluation): ToolResult {
  return reply(
    {
      doorman: result.decision,
      reason: result.reason,
      ...(result.decision === "throttled" ? { retryAfterSeconds: 30 } : {}),
    },
    true,
  );
}

const productView = (p: ProductRow) => ({
  id: p.id,
  name: p.name,
  price: money(p.priceCents),
  inStock: p.stock > 0,
  limitedDrop: p.limitedDrop,
});

// Carts live in memory for a few minutes; checkout turns one into an order.
const carts = new Map<string, { visitorKey: string; productId: string; quantity: number; createdAt: number }>();
const CART_TTL_MS = 15 * 60_000;

export function buildStoreServer(visitor: Visitor): McpServer {
  const server = new McpServer({ name: "doorman-store", version: "0.2.0" });

  server.registerTool(
    "search_products",
    {
      title: "Search products",
      description: "Search the store's catalog by name. Leave the query empty to list everything.",
      inputSchema: { query: z.string().max(100).optional().describe("Words to look for in product names") },
    },
    async ({ query }) => {
      const evaluation = await evaluate(visitor, "browse");
      await record(visitor, "browse", evaluation);
      if (evaluation.result.decision !== "allowed") return refused(evaluation);
      return reply({ products: (await searchProducts(query)).map(productView) });
    },
  );

  server.registerTool(
    "add_to_cart",
    {
      title: "Add to cart",
      description: "Put a product in a new cart. Returns a cart ID to pass to checkout.",
      inputSchema: {
        productId: z.string().describe("Product ID from search_products"),
        quantity: z.number().int().min(1).max(50).default(1),
      },
    },
    async ({ productId, quantity }) => {
      const product = await getProduct(productId);
      if (!product) return reply({ error: "No product with that ID" }, true);
      const evaluation = await evaluate(visitor, "cart", { product, quantity });
      await record(visitor, "cart", evaluation, { amountCents: product.priceCents * quantity, productId });
      if (evaluation.result.decision !== "allowed") return refused(evaluation);
      const cartId = randomUUID();
      carts.set(cartId, { visitorKey: visitor.visitorKey, productId, quantity, createdAt: Date.now() });
      return reply({ cartId, item: productView(product), quantity, total: money(product.priceCents * quantity) });
    },
  );

  server.registerTool(
    "checkout",
    {
      title: "Check out",
      description:
        "Check out a cart. Returns a link for your customer to approve the payment in PayPal. Nothing is charged until they approve.",
      inputSchema: { cartId: z.string().describe("Cart ID from add_to_cart") },
    },
    async ({ cartId }) => {
      const cart = carts.get(cartId);
      if (!cart || cart.visitorKey !== visitor.visitorKey || Date.now() - cart.createdAt > CART_TTL_MS) {
        return reply({ error: "Cart not found or expired" }, true);
      }
      const product = (await getProduct(cart.productId))!;
      const { evaluation, order } = await checkout(visitor, product, cart.quantity);
      if (!order) return refused(evaluation);
      carts.delete(cartId);
      return reply({
        doorman: evaluation.result.decision,
        orderId: order.id,
        total: money(order.amountCents),
        approvalUrl: approvalUrl(order),
        nextStep:
          evaluation.result.decision === "step_up"
            ? "Send approvalUrl to your customer. They'll confirm you with Log in with PayPal, then approve the payment."
            : "Send approvalUrl to your customer to approve the payment in PayPal.",
      });
    },
  );

  server.registerTool(
    "order_status",
    {
      title: "Order status",
      description: "Check whether your customer has approved an order and whether it was charged.",
      inputSchema: { orderId: z.string().uuid() },
    },
    async ({ orderId }) => {
      const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
      if (!order || order.agentKeyId !== visitor.agent?.keyId) return reply({ error: "Order not found" }, true);
      return reply({ orderId, status: order.status, reason: order.releaseReason });
    },
  );

  server.registerTool(
    "request_customer_link",
    {
      title: "Ask a customer to link you",
      description:
        "Get a link for your customer to give you an agent pass for this store (they log in with PayPal and set a spending cap). Signed agents only.",
      inputSchema: {},
    },
    async () => {
      if (!visitor.agent) return reply({ doorman: "blocked", reason: "Only signed agents can be linked" }, true);
      return reply(await createLinkRequest(visitor.agent));
    },
  );

  server.registerTool(
    "collect_agent_pass",
    {
      title: "Collect your agent pass",
      description:
        "After your customer approves a link request, collect the pass token. Send it in the Doorman-Pass header on later requests.",
      inputSchema: { requestId: z.string().uuid() },
    },
    async ({ requestId }) => {
      if (!visitor.agent) return reply({ error: "Only signed agents can collect a pass" }, true);
      return reply(await collectPassToken(requestId, visitor.agent.keyId));
    },
  );

  return server;
}
