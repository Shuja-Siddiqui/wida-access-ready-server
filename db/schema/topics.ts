import { pgTable, uuid, text, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { contentCategoriesTable } from "./content_categories";

export const topicsTable = pgTable("topics", {
  id:                uuid("id").primaryKey().defaultRandom(),
  contentCategoryId: uuid("content_category_id").notNull().references(() => contentCategoriesTable.id, { onDelete: "cascade" }),
  name:              text("name").notNull(),
  slug:              text("slug").notNull(),
  description:       text("description"),
  displayOrder:      integer("display_order").notNull().default(0),
  isActive:          boolean("is_active").notNull().default(true),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("topics_content_category_id_slug_idx").on(t.contentCategoryId, t.slug),
]);

export type Topic       = typeof topicsTable.$inferSelect;
export type InsertTopic = typeof topicsTable.$inferInsert;
