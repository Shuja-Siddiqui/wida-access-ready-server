import { pgTable, uuid, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const themesTable = pgTable("themes", {
  id:           uuid("id").primaryKey().defaultRandom(),
  name:         text("name").notNull(),
  slug:         text("slug").notNull().unique(),
  description:  text("description"),
  displayOrder: integer("display_order").notNull().default(0),
  isActive:     boolean("is_active").notNull().default(true),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Theme       = typeof themesTable.$inferSelect;
export type InsertTheme = typeof themesTable.$inferInsert;
