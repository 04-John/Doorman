// Merchant sign-in for the dashboard, rules and settings. There's one merchant and
// one password (MERCHANT_PASSWORD). After it's checked the browser holds a signed
// cookie, so nothing is stored, and changing the password signs everyone out.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { env } from "../env.js";

const COOKIE = "doorman_merchant";
const DAYS = 7;
const secure = env.PUBLIC_URL.startsWith("https://");
const password = env.MERCHANT_PASSWORD || null;
const digest = (value: string) => createHash("sha256").update(value).digest();
const key = password && digest(`doorman-merchant:${password}:${env.PAYPAL_CLIENT_SECRET}`);
const sign = (expires: string) => createHmac("sha256", key!).update(expires).digest("base64url");

export const merchantPasswordSet = password !== null;

export function passwordMatches(given: string): boolean {
  return password !== null && timingSafeEqual(digest(given), digest(password));
}

export function startMerchantSession(c: Context) {
  const expires = String(Date.now() + DAYS * 86_400_000);
  // Strict: the cookie never rides along on a request another site starts.
  setCookie(c, COOKIE, `${expires}.${sign(expires)}`, { httpOnly: true, sameSite: "Strict", path: "/", secure, maxAge: DAYS * 86_400 });
}

export function endMerchantSession(c: Context) {
  deleteCookie(c, COOKIE, { path: "/" });
}

export function merchantSignedIn(c: Context): boolean {
  if (!key) return false;
  const [expires, mac] = (getCookie(c, COOKIE) ?? "").split(".");
  if (!expires || !mac || !(Number(expires) > Date.now())) return false;
  const expected = sign(expires);
  return mac.length === expected.length && timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
}

// In front of every merchant route.
export const merchantOnly: MiddlewareHandler = async (c, next) => {
  if (merchantSignedIn(c)) return next();
  return merchantPasswordSet
    ? c.json({ error: "merchant_login_required", message: "Sign in as the merchant to see this." }, 401)
    : c.json({ error: "merchant_password_not_set", message: "The merchant side is locked until MERCHANT_PASSWORD is set on the server." }, 503);
};
