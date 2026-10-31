// Typed client for the Doorman server API.

export type Decision = "allowed" | "step_up" | "throttled" | "blocked";
export type Tier = "verified" | "signed" | "unknown";
export type EventAction = "browse" | "cart" | "checkout" | "link" | "approve" | "charge" | "release";
export type OrderStatus = "awaiting_approval" | "held" | "charged" | "released" | "declined";

export interface Check {
  id: "signature" | "pass" | "cap" | "drop_limit" | "rate" | "payer_match";
  status: "pass" | "fail" | "na";
  detail: string;
}

export interface DoorEvent {
  id: string;
  at: string;
  dropId: string | null;
  visitorKey: string;
  tier: Tier;
  agentKeyId: string | null;
  agentName: string | null;
  operator: string | null;
  customerName: string | null;
  action: EventAction;
  decision: Decision;
  reasonCode: string;
  reason: string;
  amountCents: number | null;
  productId: string | null;
  orderId: string | null;
  checks: Check[];
  explanation: string | null;
  orderStatus?: OrderStatus | null;
}

export interface Dashboard {
  drop: null | {
    id: string;
    status: "live" | "ended";
    productName: string;
    priceCents: number;
    stockLeft: number;
    stockTotal: number;
    sold: number;
    startedAt: string;
    endedAt: string | null;
  };
  kpis: null | {
    agentsSeen: number;
    allowed: number;
    stepUp: number;
    throttled: number;
    blocked: number;
    awaitingApprovalCents: number;
    heldCents: number;
    chargedCents: number;
    botsBlocked: number;
  };
  simulationRunning: boolean;
}

export interface EventDetail {
  event: DoorEvent;
  source: string | null;
  firstSeen: string;
  agent: null | { keyId: string; name: string; operator: string; blocked: boolean; registeredAt: string };
  customer: null | { name: string | null; verified: boolean };
  pass: null | { capCents: number; expiresAt: string; revokedAt: string | null };
  order: null | {
    id: string;
    status: OrderStatus;
    amountCents: number;
    approvalUrl: string;
    releaseReason: string | null;
    paypal: { orderId: string; authorizationId: string | null; captureId: string | null };
  };
  timeline: DoorEvent[];
  explanation: Explanation | null;
}

export interface Explanation {
  text: string;
  source: "ai" | "rules";
}

export interface TranscriptEntry {
  at: string;
  from: "customer" | "ava" | "store";
  text: string;
  tool?: string;
  ok?: boolean;
  orderId?: string;
}

export interface Transcript {
  transcript: TranscriptEntry[];
  orders: { id: string; status: OrderStatus; amountCents: number }[];
  running: boolean;
}

export interface Policy {
  dropLimitPerCustomer: number;
  unknownAgents: "browse_only" | "block";
  signedWithoutPass: "step_up" | "block" | "allow";
  rateLimitPerMinute: number;
}

export interface RuleCard {
  title: string;
  setting: string;
}

export interface Rules {
  policy: Policy;
  rulesText: string;
  cards: RuleCard[];
}

export interface CompiledRules {
  policy: Policy;
  cards: RuleCard[];
  unsupported: string[];
}

export interface Customer {
  name: string | null;
  email: string | null;
  payerId: string;
  verified: boolean;
}

export interface Approval {
  status: OrderStatus;
  stepUp: boolean;
  paypalOrderId: string;
  product: { id: string; name: string; priceCents: number };
  size: string | null;
  quantity: number;
  amountCents: number;
  agent: { name: string; operator: string } | null;
  canRetry: boolean;
  pass: { capCents: number; expiresAt: string; customerName: string | null; usedCents: number } | null;
  paidBy: string | null;
  releaseReason: string | null;
}

export interface LinkRequest {
  id: string;
  status: "pending" | "approved" | "expired";
  agent: { name: string; operator: string; keyId: string };
}

export interface AgentInfo {
  keyId: string;
  name: string;
  operator: string;
}

// What an agent's errand came back with: an approval page, or Doorman's refusal.
export type Errand = { ok: true; approvalPath: string; decision: Decision } | { ok: false; decision: Decision | null; message: string };

export interface CartLine {
  productId: string;
  size: string | null;
  quantity: number;
}

export interface WebOrder {
  status: OrderStatus;
  paypalOrderId: string;
  amountCents: number;
  items: { name: string; size: string | null; quantity: number; amountCents: number }[];
  paidBy: string | null;
  releaseReason: string | null;
}

export interface Pass {
  id: string;
  capCents: number;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  agentName: string;
  operator: string;
  agentKeyId: string;
  usedCents: number;
}

export interface StoreInfo {
  products: { id: string; name: string; priceCents: number; stock: number; limitedDrop: boolean }[];
  drop: null | { status: "live" | "ended"; startedAt: string; stockTotal: number };
  perCustomerLimit: number;
}

export interface MerchantInfo {
  connected: boolean;
  email: string | null;
  merchantId: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: { method?: "GET" | "POST" | "PUT"; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiError(res.status, body.error, body.message ?? body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  config: () => request<{ paypalClientId: string }>("/api/config"),
  me: () => request<{ customer: Customer | null }>("/api/me").then((r) => r.customer),
  logout: () => request("/auth/logout", { method: "POST" }),
  store: () => request<StoreInfo>("/api/store"),
  merchant: () => request<MerchantInfo>("/api/merchant"),

  dashboard: () => request<Dashboard>("/api/dashboard"),
  events: (limit = 400) => request<{ events: DoorEvent[] }>(`/api/events?limit=${limit}`).then((r) => r.events),
  event: (id: string) => request<EventDetail>(`/api/events/${id}`),
  explanation: (id: string) => request<Explanation>(`/api/events/${id}/explanation`),
  runDrop: () => request<{ dropId: string }>("/api/drop/run", { method: "POST" }),
  resetDrop: () => request("/api/drop/reset", { method: "POST" }),
  transcript: () => request<Transcript>("/api/drop/transcript"),
  blockAgent: (keyId: string) => request(`/api/agents/${encodeURIComponent(keyId)}/block`, { method: "POST" }),
  releaseOrder: (orderId: string) => request<{ status: OrderStatus }>(`/api/orders/${orderId}/release`, { method: "POST" }),

  rules: () => request<Rules>("/api/rules"),
  compileRules: (rulesText: string) => request<CompiledRules>("/api/rules/compile", { method: "POST", body: { rulesText } }),
  saveRules: (policy: Policy, rulesText: string) => request<Rules>("/api/rules", { method: "PUT", body: { policy, rulesText } }),

  approval: (token: string) => request<Approval>(`/api/approvals/${token}`),
  authorizeApproval: (token: string) => request<Approval>(`/api/approvals/${token}/authorize`, { method: "POST" }),
  declineApproval: (token: string) => request<Approval>(`/api/approvals/${token}/decline`, { method: "POST" }),
  retryApproval: (token: string) => request<Errand>(`/api/approvals/${token}/retry`, { method: "POST" }),

  webCheckout: (items: CartLine[]) => request<{ paypalOrderId: string }>("/api/store/checkout", { method: "POST", body: { items } }),
  completeWebCheckout: (paypalOrderId: string) => request<WebOrder>(`/api/store/checkout/${paypalOrderId}/complete`, { method: "POST" }),
  agentCheckout: (productId: string, size: string | null) => request<Errand>("/api/store/agent-checkout", { method: "POST", body: { productId, size } }),

  linkRequest: (id: string) => request<LinkRequest>(`/api/link-requests/${id}`),
  approveLink: (id: string, capCents: number, days: 1 | 7 | 30) =>
    request<{ pass: Pass }>(`/api/link-requests/${id}/approve`, { method: "POST", body: { capCents, days } }),
  agents: () => request<{ agents: AgentInfo[] }>("/api/agents").then((r) => r.agents),
  agent: (keyId: string) => request<AgentInfo>(`/api/agents/${encodeURIComponent(keyId)}`),
  createPass: (agentKeyId: string, capCents: number, days: 1 | 7 | 30) =>
    request<{ pass: Pass }>("/api/passes", { method: "POST", body: { agentKeyId, capCents, days } }).then((r) => r.pass),
  passes: () => request<{ passes: Pass[] }>("/api/passes").then((r) => r.passes),
  revokePass: (id: string) => request(`/api/passes/${id}/revoke`, { method: "POST" }),
};

// Where "Log in with PayPal" should bring the customer back to.
export function loginHref(next = location.pathname + location.search): string {
  return `/auth/paypal/start?next=${encodeURIComponent(next)}`;
}
