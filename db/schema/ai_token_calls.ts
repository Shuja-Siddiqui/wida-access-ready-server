import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { imageGenerationJobsTable } from "./image_generation";
import { sessionsTable } from "./sessions";
import { studentsTable } from "./students";
import { usersTable } from "./users";

/** One row per Claude (or tracked AI) API call — student practice or admin (image factory). */
export const aiTokenCallsTable = pgTable(
  "ai_token_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .references(() => studentsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .references(() => usersTable.id, { onDelete: "set null" }),
    imageJobId: uuid("image_job_id")
      .references(() => imageGenerationJobsTable.id, { onDelete: "set null" }),
    sessionId: uuid("session_id").references(() => sessionsTable.id, { onDelete: "set null" }),
    /** content_generate | item_feedback | attempt_feedback | image_factory | … */
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
    index("ai_token_calls_user_created_idx").on(t.userId, t.createdAt),
    index("ai_token_calls_session_idx").on(t.sessionId),
    index("ai_token_calls_image_job_idx").on(t.imageJobId),
  ],
);

export type AiTokenCall = typeof aiTokenCallsTable.$inferSelect;
