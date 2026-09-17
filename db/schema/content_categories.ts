import { pgTable, uuid, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

/** Top-level buckets in the image library catalog (e.g. "School and Learning"). */
export const contentCategoriesTable = pgTable("content_categories", {
  id:           uuid("id").primaryKey().defaultRandom(),
  name:         text("name").notNull(),
  slug:         text("slug").notNull().unique(),
  description:  text("description"),
  displayOrder: integer("display_order").notNull().default(0),
  isActive:     boolean("is_active").notNull().default(true),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ContentCategory       = typeof contentCategoriesTable.$inferSelect;
export type InsertContentCategory = typeof contentCategoriesTable.$inferInsert;
