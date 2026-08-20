import { pgTable, uuid, integer, text, jsonb, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sessionsTable } from "./sessions";

export const sessionAnswersTable = pgTable("session_answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessionsTable.id),
  questionIndex: integer("question_index").notNull(),
  question: text("question").notNull(),
  content: jsonb("content"), // full question content: options, correct answer, passage/prompt, explanation, etc.
  submittedAnswer: jsonb("submitted_answer"), // what the student actually submitted (selected option, typed text, etc.)
  correct: boolean("correct").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSessionAnswerSchema = createInsertSchema(sessionAnswersTable).omit({ id: true, createdAt: true });
export type InsertSessionAnswer = z.infer<typeof insertSessionAnswerSchema>;
export type SessionAnswer = typeof sessionAnswersTable.$inferSelect;
