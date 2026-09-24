import { pgTable, text, uuid, timestamp, unique } from "drizzle-orm/pg-core";
import { studentsTable } from "./students";
import { sessionsTable } from "./sessions";

export const studentPracticeSuggestionsTable = pgTable(
  "student_practice_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => studentsTable.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    message: text("message").notNull(),
    sourceSessionId: uuid("source_session_id").references(() => sessionsTable.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.studentId, table.domain)],
);

export type StudentPracticeSuggestion = typeof studentPracticeSuggestionsTable.$inferSelect;
