import { Hono } from "hono";
import { z } from "zod";
import { registerAgent } from "../agents/registry.js";
import { perMinute } from "../lib/limits.js";

const registration = z.object({
  name: z.string().min(1).max(80),
  operator: z.string().min(1).max(80),
  publicKey: z.object({ kty: z.literal("OKP"), crv: z.literal("Ed25519"), x: z.string().min(1) }),
});

export const agentRoutes = new Hono().post("/agents/register", perMinute(10), async (c) => {
  const parsed = registration.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_registration", issues: parsed.error.issues }, 400);
  const agent = await registerAgent(parsed.data);
  return c.json({ keyId: agent.keyId }, 201);
});
