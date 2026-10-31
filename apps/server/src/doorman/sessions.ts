// Customer sessions after Log in with PayPal. Kept in memory: fine for a
// single-instance demo, and a restart just means logging in again.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { db, schema } from "../db/client.js";
import { env } from "../env.js";

export type CustomerRow = typeof schema.customers.$inferSelect;

const COOKIE = "doorman_sid";
const sessions = new Map<string, string>();
const secure = env.PUBLIC_URL.startsWith("https://");

export function startSession(c: Context, payerId: string) {
  const sid = randomUUID();
  sessions.set(sid, payerId);
  setCookie(c, COOKIE, sid, { httpOnly: true, sameSite: "Lax", path: "/", secure });
}

export function endSession(c: Context) {
  const sid = getCookie(c, COOKIE);
  if (sid) sessions.delete(sid);
  deleteCookie(c, COOKIE, { path: "/" });
}

export async function currentCustomer(c: Context): Promise<CustomerRow | null> {
  const payerId = sessions.get(getCookie(c, COOKIE) ?? "");
  if (!payerId) return null;
  const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.payerId, payerId));
  return customer ?? null;
}
