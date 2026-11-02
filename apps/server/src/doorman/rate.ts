// Requests per visitor over the last minute. Memory stays flat however many
// visitors arrive: one small counter each, and the 100,000 most recent at most.
import { WindowCounter } from "../lib/bounded.js";

const perVisitor = new WindowCounter(60_000, 100_000);

export function countRequest(visitorKey: string, now = Date.now()): number {
  return perVisitor.hit(visitorKey, now);
}
