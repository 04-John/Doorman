import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env.js";
import * as schema from "./schema.js";

// Neon's pooler handles many connections; 10 keeps a 60-bot drop from queueing.
// Idle connections close after a minute, so when nobody's using the demo Neon's
// free compute can scale to zero (it allows 100 compute-hours a month).
const client = postgres(env.DATABASE_URL, { max: 10, idle_timeout: 60 });

export const db = drizzle(client, { schema });
export { schema };

export async function closeDb() {
  await client.end();
}
