import { defineConfig } from "drizzle-kit";

// Locally the connection string lives in the repo-root .env; on the host it's a real env var.
try {
  process.loadEnvFile("../../.env");
} catch {}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
