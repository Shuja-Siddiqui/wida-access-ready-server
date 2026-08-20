import { pgTable, uuid, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { libraryTable } from "./library";
import { topicsTable } from "./topics";

export const libraryTopicsTable = pgTable("library_topics", {
  libraryId: uuid("library_id").notNull().references(() => libraryTable.id, { onDelete: "cascade" }),
  topicId:   uuid("topic_id").notNull().references(() => topicsTable.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  addedAt:   timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.libraryId, t.topicId] }),
]);

export type LibraryTopic       = typeof libraryTopicsTable.$inferSelect;
export type InsertLibraryTopic = typeof libraryTopicsTable.$inferInsert;
