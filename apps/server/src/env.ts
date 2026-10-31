import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { z } from "zod";

// The project's .env wins over variables already set on the machine. (Node's
// --env-file never overrides, so a GEMINI_API_KEY saved in Windows for another
// project would silently replace ours.) On the host there's no file, so the
// platform's variables are used as-is.
const envFile = new URL("../../../.env", import.meta.url);
if (existsSync(envFile)) Object.assign(process.env, parseEnv(readFileSync(envFile, "utf8")));

const schema = z.object({
  PAYPAL_CLIENT_ID: z
    .string()
    .min(1, "is empty. Copy the Client ID from the Doorman app (developer.paypal.com > Apps & Credentials > Sandbox)."),
  PAYPAL_CLIENT_SECRET: z
    .string()
    .min(1, "is empty. Copy the Secret from the same Doorman app page."),
  PAYPAL_ENV: z.enum(["sandbox"]).default("sandbox"),
  PAYPAL_LOGIN_RETURN_URL: z.url(),
  DATABASE_URL: z.string().min(1, "is empty. Paste the Neon connection string (starts with postgresql://)."),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.5-flash"),
  GEMINI_FAST_MODEL: z.string().default("gemini-3.5-flash-lite"),
  // Where customers open approval and link pages. Locally that's the Vite app.
  PUBLIC_URL: z.url().default("http://127.0.0.1:5173"),
  // Sandbox buyer the demo agent "Ava" shops for (its payer ID from Log in with PayPal).
  DEMO_BUYER_PAYER_ID: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(8787),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("\nThe .env file needs attention:\n");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")} ${issue.message}`);
  }
  console.error("\nEdit C:\\Users\\USER\\doorman\\.env, save it, and run the command again.\n");
  process.exit(1);
}

export const env = parsed.data;
