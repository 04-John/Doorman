export const money = (cents: number, { decimals = false } = {}) => {
  const value = cents / 100;
  return decimals
    ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
};

const pad = (n: number) => String(n).padStart(2, "0");

// 14:00:09
export function clock(at: string | Date): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// 2:14
export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

// "2m 14s"
export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

// "in 6 days", "in 13 hours", "expired"
export function expiresIn(at: string | Date): string {
  const ms = new Date(at).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const hours = ms / 3_600_000;
  if (hours < 1) return `in ${Math.max(1, Math.round(ms / 60_000))} minutes`;
  if (hours < 36) return `in ${Math.round(hours)} hours`;
  return `in ${Math.round(hours / 24)} days`;
}

// "8f3kQ…v2Qa"
export const shortId = (id: string, head = 5, tail = 4) => (id.length > head + tail + 1 ? `${id.slice(0, head)}…${id.slice(-tail)}` : id);

// "John D."
export function shortName(name: string | null | undefined): string | null {
  if (!name) return null;
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]}.` : (first ?? null);
}

// Short, stable request number for the detail header, e.g. "#4F2A".
export const requestNumber = (id: string) => `#${id.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
