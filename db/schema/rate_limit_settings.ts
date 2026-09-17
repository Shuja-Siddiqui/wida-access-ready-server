import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

/** Singleton row (id = 1). Super-admin sets per-student AI caps. */
export const rateLimitSettingsTable = pgTable("rate_limit_settings", {
  id: text("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  windowMs: integer("window_ms").notNull(),
  aiMaxPerStudent: integer("ai_max_per_student").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});
