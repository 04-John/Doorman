// Per-address limits for the routes that cost something: PayPal orders, Gemini
// calls, database writes. Doorman's rules for agents are the product and are
// separate; these only stop any one address from swamping the server.
import type { MiddlewareHandler } from "hono";
import { WindowCounter } from "./bounded.js";
import { clientIp, fromSimulator } from "./client-ip.js";

export function perMinute(max: number): MiddlewareHandler {
  const counter = new WindowCounter(60_000, 50_000);
  return async (c, next) => {
    if (!fromSimulator(c) && counter.hit(clientIp(c)) > max) {
      return c.json({ error: "too_many_requests", message: "Too many requests from your address. Wait a minute and try again." }, 429, {
        "Retry-After": "60",
      });
    }
    await next();
  };
}
