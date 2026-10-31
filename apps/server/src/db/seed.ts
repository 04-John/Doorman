// Run with: npm run db:seed
// Puts the demo store's products and default rules in place. Safe to re-run.
import { sql } from "drizzle-orm";
import { defaultPolicy, defaultRulesText } from "../doorman/policy.js";
import { DROP_PRODUCT_ID, DROP_STOCK } from "../doorman/store.js";
import { closeDb, db, schema } from "./client.js";

const products = [
  { id: DROP_PRODUCT_ID, name: "Night Shift Hoodie", priceCents: 6800, stock: DROP_STOCK, limitedDrop: true },
  { id: "tee-static", name: "Static Tee", priceCents: 3200, stock: 200, limitedDrop: false },
  { id: "cap-signal", name: "Signal Cap", priceCents: 2800, stock: 120, limitedDrop: false },
];

await db
  .insert(schema.products)
  .values(products)
  .onConflictDoUpdate({
    target: schema.products.id,
    set: { name: sql`excluded.name`, priceCents: sql`excluded.price_cents`, limitedDrop: sql`excluded.limited_drop` },
  });

await db
  .insert(schema.settings)
  .values({ id: 1, rulesText: defaultRulesText, policy: defaultPolicy })
  .onConflictDoNothing();

console.log(`Seeded ${products.length} products and the default rules.`);
await closeDb();
