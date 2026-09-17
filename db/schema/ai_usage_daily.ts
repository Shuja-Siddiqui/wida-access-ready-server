import { date, integer, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { studentsTable } from "./students";

/**
 * One row per student per calendar day (UTC). Use this for parent/teacher graphs.
 * Do not create a table per student — query WHERE student_id = ?.
 */
export const aiUsageDailyTable = pgTable(
  "ai_usage_daily",
  {
    studentId: uuid("student_id")
      .notNull()
      .references(() => studentsTable.id, { onDelete: "cascade" }),
    usageDate: date("usage_date").notNull(),
    totalCalls: integer("total_calls").notNull().default(0),
    generateCalls: integer("generate_calls").notNull().default(0),
    coachingCalls: integer("coaching_calls").notNull().default(0),
    speechCalls: integer("speech_calls").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.usageDate] })],
);
