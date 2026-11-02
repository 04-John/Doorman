// In-memory structures with a ceiling, so no amount of traffic can grow the
// server's memory without limit.

// A map that forgets its least recently used entries beyond `max`.
export class LruMap<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly max: number) {}

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): this {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
    return this;
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  get size(): number {
    return this.map.size;
  }
}

// Hits per key over the last window, estimated from two fixed windows the way
// large rate limiters do it: constant memory per key, at most `maxKeys` keys, and
// keys that go quiet are dropped.
export class WindowCounter {
  private readonly counts = new Map<string, { start: number; current: number; previous: number }>();
  private lastSweep = 0;

  constructor(
    private readonly windowMs: number,
    private readonly maxKeys: number,
  ) {}

  hit(key: string, now = Date.now()): number {
    this.sweep(now);
    const start = now - (now % this.windowMs);
    const was = this.counts.get(key);
    const entry =
      was && was.start === start
        ? was
        : { start, current: 0, previous: was && start - was.start === this.windowMs ? was.current : 0 };
    entry.current += 1;
    // Most recently active keys stay at the end, so the oldest are evicted and swept first.
    this.counts.delete(key);
    this.counts.set(key, entry);
    if (this.counts.size > this.maxKeys) this.counts.delete(this.counts.keys().next().value!);
    const previousWeight = 1 - (now - start) / this.windowMs;
    return entry.current + Math.floor(entry.previous * previousWeight);
  }

  private sweep(now: number) {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    for (const [key, entry] of this.counts) {
      if (now - entry.start < 2 * this.windowMs) break;
      this.counts.delete(key);
    }
  }
}

// Runs `load` at most once per `ttlMs` and shares the answer (and any call still
// in flight) with everyone who asks, so a hundred open dashboards cost one query.
export function shared<T>(ttlMs: number, load: () => Promise<T>): () => Promise<T> {
  let cached: { value: Promise<T>; at: number } | null = null;
  return () => {
    const now = Date.now();
    if (!cached || now - cached.at >= ttlMs) {
      const value = load();
      cached = { value, at: now };
      value.catch(() => {
        if (cached?.value === value) cached = null;
      });
    }
    return cached.value;
  };
}

// At most `max` tasks at once; extra callers are turned away rather than queued.
export class Gate {
  private running = 0;

  constructor(private readonly max: number) {}

  async run<T>(task: () => Promise<T>, busy: () => T | Promise<T>): Promise<T> {
    if (this.running >= this.max) return busy();
    this.running += 1;
    try {
      return await task();
    } finally {
      this.running -= 1;
    }
  }
}
