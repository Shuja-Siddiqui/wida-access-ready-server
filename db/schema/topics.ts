import { pgTable, uuid, text, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { themesTable } from "./themes";

export const topicsTable = pgTable("topics", {
  id:           uuid("id").primaryKey().defaultRandom(),
  themeId:      uuid("theme_id").notNull().references(() => themesTable.id, { onDelete: "cascade" }),
  name:         text("name").notNull(),
  slug:         text("slug").notNull(),
  description:  text("description"),
  displayOrder: integer("display_order").notNull().default(0),
  isActive:     boolean("is_active").notNull().default(true),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("topics_theme_id_slug_idx").on(t.themeId, t.slug),
]);

export type Topic       = typeof topicsTable.$inferSelect;
export type InsertTopic = typeof topicsTable.$inferInsert;
