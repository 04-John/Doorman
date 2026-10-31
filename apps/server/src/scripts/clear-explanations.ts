// Run with: npx tsx src/scripts/clear-explanations.ts
// Forgets stored AI explanations so they're rewritten with the current prompt.
import { isNotNull } from "drizzle-orm";
import { closeDb, db, schema } from "../db/client.js";
const cleared = await db.update(schema.events).set({ explanation: null }).where(isNotNull(schema.events.explanation)).returning({ id: schema.events.id });
console.log(`Cleared ${cleared.length} stored explanations.`);
await closeDb();
