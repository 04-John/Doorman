// The front door: every agent action goes through evaluate() and then record().
import { decide, type Action, type DecisionResult } from "./engine.js";
import { recordEvent, type EventRow } from "./events.js";
import type { Visitor } from "./identity.js";
import { passSpent } from "./passes.js";
import { countRequest } from "./rate.js";
import { currentDrop, getRules, unitsInDrop, type DropRow, type ProductRow } from "./store.js";

export interface Evaluation {
  result: DecisionResult;
  drop: DropRow | undefined;
}

export async function evaluate(visitor: Visitor, action: Action, item?: { product: ProductRow; quantity: number }): Promise<Evaluation> {
  const [{ policy }, drop] = await Promise.all([getRules(), currentDrop()]);
  const requestsLastMinute = countRequest(visitor.visitorKey);

  if (visitor.passError) {
    const reason = visitor.passError === "wrong_agent" ? "This pass belongs to a different agent" : "Unknown agent pass";
    return {
      drop,
      result: {
        decision: "blocked",
        tier: "signed",
        reasonCode: "PASS_INVALID",
        reason,
        checks: [{ id: "pass", status: "fail", detail: reason }],
      },
    };
  }

  const dropLive = drop?.status === "live";
  const [customerAlreadyBought, spentCents] = await Promise.all([
    visitor.pass && drop && dropLive && item?.product.limitedDrop
      ? unitsInDrop({
          dropId: drop.id,
          productId: item.product.id,
          payer: { expected: visitor.pass.customerPayerId },
          statuses: ["awaiting_approval", "held", "charged"],
        })
      : 0,
    visitor.pass && action !== "browse" ? passSpent(visitor.pass.id, { includeAwaiting: true }) : 0,
  ]);

  const result = decide({
    action,
    identity:
      visitor.tier === "unknown"
        ? { tier: "unknown" }
        : {
            tier: "signed",
            agentBlocked: visitor.agent!.blocked,
            pass: visitor.pass && {
              capCents: visitor.pass.capCents,
              spentCents,
              expiresAt: visitor.pass.expiresAt,
              revokedAt: visitor.pass.revokedAt,
            },
          },
    requestsLastMinute,
    item: item && {
      priceCents: item.product.priceCents,
      quantity: item.quantity,
      limitedDrop: item.product.limitedDrop,
      stock: item.product.stock,
    },
    dropLive,
    customerAlreadyBought,
    policy,
    now: new Date(),
  });
  return { result, drop };
}

export function record(
  visitor: Visitor,
  action: Action,
  { result, drop }: Evaluation,
  extra: { amountCents?: number; productId?: string; orderId?: string } = {},
): Promise<EventRow> {
  return recordEvent({
    dropId: drop?.status === "live" ? drop.id : null,
    visitorKey: visitor.visitorKey,
    tier: result.tier,
    agentKeyId: visitor.agent?.keyId ?? null,
    agentName: visitor.agent?.name ?? null,
    operator: visitor.agent?.operator ?? null,
    customerName: result.tier === "verified" ? (visitor.customer?.name ?? null) : null,
    action,
    decision: result.decision,
    reasonCode: result.reasonCode,
    reason: result.reason,
    checks: result.checks,
    amountCents: extra.amountCents ?? null,
    productId: extra.productId ?? null,
    orderId: extra.orderId ?? null,
  });
}
