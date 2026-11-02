import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { Ed25519Jwk } from "../agents/signatures.js";
import type { Action, Check, Decision, Tier } from "../doorman/engine.js";
import type { Policy } from "../doorman/policy.js";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  stock: integer("stock").notNull(),
  limitedDrop: boolean("limited_drop").notNull().default(false),
});

export const drops = pgTable("drops", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: text("product_id").notNull().references(() => products.id),
  status: text("status").$type<"live" | "ended">().notNull(),
  stockTotal: integer("stock_total").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  // Set by "Reset": the dashboard goes back to READY instead of showing this drop.
  cleared: boolean("cleared").notNull().default(false),
});

export const agents = pgTable("agents", {
  keyId: text("key_id").primaryKey(),
  name: text("name").notNull(),
  operator: text("operator").notNull(),
  publicJwk: jsonb("public_jwk").$type<Ed25519Jwk>().notNull(),
  blocked: boolean("blocked").notNull().default(false),
  registeredAt: createdAt(),
});

// People who logged in with PayPal. The payer ID is their PayPal account ID.
export const customers = pgTable("customers", {
  payerId: text("payer_id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name"),
  email: text("email"),
  verified: boolean("verified").notNull(),
  createdAt: createdAt(),
});

// Logged-in browser sessions. Only a hash of the cookie value is stored, and they
// live in the database so a server restart doesn't log everyone out.
export const sessions = pgTable("sessions", {
  idHash: text("id_hash").primaryKey(),
  payerId: text("payer_id").notNull().references(() => customers.payerId),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

// A customer's permission for one agent to shop here, with a cap and expiry.
// Only a hash of the token is stored; the agent holds the token itself.
export const passes = pgTable("passes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  agentKeyId: text("agent_key_id").notNull().references(() => agents.keyId),
  customerPayerId: text("customer_payer_id").notNull().references(() => customers.payerId),
  // A total for the life of the pass, not a limit per purchase.
  capCents: integer("cap_cents").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  // The drop simulation's own stand-in (Juniper's revoked pass): hidden from the
  // customer's passes and never replaces one they gave.
  simulated: boolean("simulated").notNull().default(false),
  createdAt: createdAt(),
});

// An agent asking a customer to link it. The customer approves in the browser,
// then the agent collects its pass token once.
export const linkRequests = pgTable("link_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentKeyId: text("agent_key_id").notNull().references(() => agents.keyId),
  status: text("status").$type<"pending" | "approved">().notNull().default("pending"),
  passId: uuid("pass_id").references(() => passes.id),
  pendingToken: text("pending_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

// The demo agents' wallet: pass tokens they've collected. This server runs them,
// so it keeps their tokens, and a restart or redeploy mustn't make them forget.
// (Outside agents hold their own tokens; Doorman only stores a hash.)
export const demoAgentTokens = pgTable("demo_agent_tokens", {
  passId: uuid("pass_id")
    .primaryKey()
    .references(() => passes.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  createdAt: createdAt(),
});

export type OrderStatus = "awaiting_approval" | "held" | "charged" | "released" | "declined";

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  approvalToken: text("approval_token").notNull().unique(),
  dropId: uuid("drop_id").references(() => drops.id),
  productId: text("product_id").notNull().references(() => products.id),
  size: text("size"),
  quantity: integer("quantity").notNull(),
  amountCents: integer("amount_cents").notNull(),
  // Empty for people buying in the browser.
  agentKeyId: text("agent_key_id").references(() => agents.keyId),
  passId: uuid("pass_id").references(() => passes.id),
  // Who should pay: the pass holder. Empty for step-up orders until the customer logs in.
  expectedPayerId: text("expected_payer_id"),
  stepUp: boolean("step_up").notNull().default(false),
  status: text("status").$type<OrderStatus>().notNull(),
  paypalOrderId: text("paypal_order_id").notNull(),
  authorizationId: text("authorization_id"),
  captureId: text("capture_id"),
  approvedPayerId: text("approved_payer_id"),
  approvedPayerEmail: text("approved_payer_email"),
  releaseReason: text("release_reason"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EventAction = Action | "link" | "approve" | "charge" | "release";

// One row per thing that happened at the door. This is what the dashboard shows.
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    dropId: uuid("drop_id").references(() => drops.id),
    // Who made the request: the agent's key ID, or "ip:<address>" for unsigned visitors.
    visitorKey: text("visitor_key").notNull(),
    tier: text("tier").$type<Tier>().notNull(),
    agentKeyId: text("agent_key_id"),
    agentName: text("agent_name"),
    operator: text("operator"),
    customerName: text("customer_name"),
    action: text("action").$type<EventAction>().notNull(),
    decision: text("decision").$type<Decision>().notNull(),
    reasonCode: text("reason_code").notNull(),
    reason: text("reason").notNull(),
    amountCents: integer("amount_cents"),
    productId: text("product_id"),
    orderId: uuid("order_id"),
    checks: jsonb("checks").$type<Check[]>().notNull().default([]),
    explanation: text("explanation"),
  },
  (t) => [index("events_at_idx").on(t.at), index("events_drop_idx").on(t.dropId)],
);

// PayPal webhook events whose signature checked out. PayPal's event ID makes a
// redelivery harmless.
export const paypalWebhookEvents = pgTable(
  "paypal_webhook_events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    resourceId: text("resource_id").notNull(),
    paypalOrderId: text("paypal_order_id"),
    // What Doorman did about it, e.g. "finished the order" or "nothing to do".
    outcome: text("outcome").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("paypal_webhook_events_order_idx").on(t.paypalOrderId)],
);

export const settings = pgTable("settings", {
  id: integer("id").primaryKey(),
  rulesText: text("rules_text").notNull(),
  policy: jsonb("policy").$type<Policy>().notNull(),
});
