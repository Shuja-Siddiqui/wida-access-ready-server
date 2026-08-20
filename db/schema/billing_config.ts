import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Super-admin configurable billing prices. One row per planId.
// Used as the authoritative source when Stripe is not connected,
// and as the fallback display price when Stripe plans are present
// but not yet seeded with metadata.
export const billingConfigTable = pgTable("billing_config", {
  planId:    text("plan_id").primaryKey(),          // "solo" | "organization"
  name:      text("name").notNull(),
  priceCents: integer("price_cents").notNull(),     // e.g. 2000 = $20
  currency:  text("currency").notNull().default("usd"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),                    // super_admin user id
});

export const insertBillingConfigSchema = createInsertSchema(billingConfigTable);
export type BillingConfig = typeof billingConfigTable.$inferSelect;
