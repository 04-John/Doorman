// Turns server events into dashboard table rows.
import type { Decision, DoorEvent, OrderStatus, Tier } from "../../lib/api";
import { shortName } from "../../lib/format";

export type Money = "Awaiting" | "Held" | "Charged" | "Released" | "Declined";

export interface Row {
  id: string;
  at: string;
  name: string | null;
  operator: string | null;
  source: string | null;
  agentKeyId: string | null;
  tier: Tier;
  customer: string | null;
  action: string;
  decision: Decision;
  reason: string;
  amountCents: number | null;
  money: Money | null;
  orderId: string | null;
  // When the row arrived live, for the warm flash on new rows.
  freshAt: number | null;
}

const ACTION_LABEL = { browse: "Browsed", cart: "Added to cart", checkout: "Checkout", charge: "Paid" } as const;

export const MONEY_BY_STATUS: Record<OrderStatus, Money> = {
  awaiting_approval: "Awaiting",
  held: "Held",
  charged: "Charged",
  released: "Released",
  declined: "Declined",
};

export const MONEY_COLOUR: Record<Money, string> = {
  Awaiting: "#6B6E76",
  Held: "#8A5300",
  Charged: "#0F6B3E",
  Released: "#6B6E76",
  Declined: "#6B6E76",
};

// What an order looks like after this event (approve → held, charge → charged…).
export function moneyAfter(event: DoorEvent): Money | null {
  if (event.action === "approve") return "Held";
  if (event.action === "charge") return "Charged";
  if (event.action === "release") return event.reasonCode === "DECLINED" ? "Declined" : "Released";
  return null;
}

export function toRow(event: DoorEvent, live = false): Row | null {
  // Approvals show up in the order's timeline rather than as their own row.
  if (event.action === "approve" || event.action === "link") return null;

  let action: string;
  if (event.action === "release") {
    action = event.reasonCode === "DECLINED" ? "Declined" : event.reasonCode.startsWith("MERCHANT") ? "Released" : "Paid";
  } else {
    action = ACTION_LABEL[event.action];
  }

  const money: Money | null =
    event.action === "checkout"
      ? event.orderId
        ? event.orderStatus
          ? MONEY_BY_STATUS[event.orderStatus]
          : "Awaiting"
        : null
      : moneyAfter(event);

  return {
    id: event.id,
    at: event.at,
    name: event.agentName,
    operator: event.operator,
    source: event.visitorKey.startsWith("ip:") ? event.visitorKey.slice(3) : null,
    agentKeyId: event.agentKeyId,
    tier: event.tier,
    customer: shortName(event.customerName),
    action,
    decision: event.decision,
    reason: event.reason,
    amountCents: ["checkout", "charge", "release"].includes(event.action) ? event.amountCents : null,
    money,
    orderId: event.orderId,
    freshAt: live ? Date.now() : null,
  };
}
