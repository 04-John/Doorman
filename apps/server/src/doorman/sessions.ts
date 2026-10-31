// Customer sessions after Log in with PayPal. Kept in the database (as a hash of
// the cookie), so a restart or a sleeping free-tier host doesn't log people out.
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { db, schema } from "../db/client.js";
import { env } from "../env.js";

export type CustomerRow = typeof schema.customers.$inferSelect;

const COOKIE = "doorman_sid";
const DAYS = 7;
const secure = env.PUBLIC_URL.startsWith("https://");
const hash = (sid: string) => createHash("sha256").update(sid).digest("base64url");

export async function startSession(c: Context, payerId: string) {
  const sid = randomBytes(24).toString("base64url");
  await db.insert(schema.sessions).values({ idHash: hash(sid), payerId, expiresAt: new Date(Date.now() + DAYS * 86_400_000) });
  setCookie(c, COOKIE, sid, { httpOnly: true, sameSite: "Lax", path: "/", secure, maxAge: DAYS * 86_400 });
}

export async function endSession(c: Context) {
  const sid = getCookie(c, COOKIE);
  if (sid) await db.delete(schema.sessions).where(eq(schema.sessions.idHash, hash(sid)));
  deleteCookie(c, COOKIE, { path: "/" });
}

export async function currentCustomer(c: Context): Promise<CustomerRow | null> {
  const sid = getCookie(c, COOKIE);
  if (!sid) return null;
  const [row] = await db
    .select({ customer: schema.customers })
    .from(schema.sessions)
    .innerJoin(schema.customers, eq(schema.customers.payerId, schema.sessions.payerId))
    .where(and(eq(schema.sessions.idHash, hash(sid)), gt(schema.sessions.expiresAt, new Date())));
  return row?.customer ?? null;
}
