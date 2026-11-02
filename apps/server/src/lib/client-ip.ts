// The address a request came from.
//
// Each proxy in front of the server adds an entry to the end of X-Forwarded-For,
// and anything before those can be typed in by the client. So the client is the
// entry added by the outermost proxy we trust. TRUSTED_PROXIES says how many
// there are: 3 on Render (Cloudflare, Render's load balancer, Render's proxy in
// front of the app), 0 when the server is reached directly (local development).
//
// The drop simulator runs inside this server and gives each bot a made-up address.
// That address is believed only alongside the simulator's own header, which is
// derived from a secret outsiders don't have.
import { createHash, timingSafeEqual } from "node:crypto";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { env } from "../env.js";

const SIMULATOR_HEADER = "doorman-simulator";
const simulatorToken = createHash("sha256").update(`doorman-simulator:${env.PAYPAL_CLIENT_SECRET}`).digest("base64url");

export const simulatorHeaders = (): Record<string, string> => ({ [SIMULATOR_HEADER]: simulatorToken });

export function fromSimulator(c: Context): boolean {
  const given = c.req.header(SIMULATOR_HEADER);
  return given !== undefined && given.length === simulatorToken.length && timingSafeEqual(Buffer.from(given), Buffer.from(simulatorToken));
}

export function clientIp(c: Context): string {
  const chain = (c.req.header("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (fromSimulator(c)) return chain.at(-1) ?? "simulator";
  if (env.TRUSTED_PROXIES > 0 && chain.length >= env.TRUSTED_PROXIES) return chain.at(-env.TRUSTED_PROXIES)!;
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}
