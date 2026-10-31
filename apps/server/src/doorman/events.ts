import { EventEmitter } from "node:events";
import { db, schema } from "../db/client.js";

export type EventRow = typeof schema.events.$inferSelect;
export type NewEvent = typeof schema.events.$inferInsert;

// The dashboard's live feed subscribes here.
export const eventBus = new EventEmitter();
eventBus.setMaxListeners(100);

export async function recordEvent(values: NewEvent): Promise<EventRow> {
  const [row] = await db.insert(schema.events).values(values).returning();
  eventBus.emit("event", row);
  return row!;
}
