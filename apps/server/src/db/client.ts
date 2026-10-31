import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env.js";
import * as schema from "./schema.js";

// Neon's pooler handles many connections; 10 keeps a 60-bot drop from queueing.
const client = postgres(env.DATABASE_URL, { max: 10 });

export const db = drizzle(client, { schema });
export { schema };

export async function closeDb() {
  await client.end();
}
