import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sessionsTable } from "./sessions";
import { studentsTable } from "./students";

/** One row per Claude (or tracked AI) API call — links to student and optional practice session. */
export const aiTokenCallsTable = pgTable(
  "ai_token_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => studentsTable.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => sessionsTable.id, { onDelete: "set null" }),
    /** content_generate | feedback | item_feedback | attempt_feedback | speech | other */
    callKind: text("call_kind").notNull(),
    domain: text("domain"),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ai_token_calls_student_created_idx").on(t.studentId, t.createdAt),
    index("ai_token_calls_session_idx").on(t.sessionId),
  ],
);

export type AiTokenCall = typeof aiTokenCallsTable.$inferSelect;
