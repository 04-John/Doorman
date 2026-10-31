// Sliding one-minute window of requests per visitor.
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

export function countRequest(visitorKey: string, now = Date.now()): number {
  const recent = (hits.get(visitorKey) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(visitorKey, recent);
  return recent.length;
}
