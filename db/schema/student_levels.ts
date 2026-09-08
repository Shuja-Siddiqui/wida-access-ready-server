import { pgTable, text, uuid, timestamp, decimal, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";

// Stores the current in-app adaptive level per (domain, tier) pair.
// This is the single source of truth for a student's standing in a given
// domain + tier — set initially by a guardian at registration (or via the
// score-entry form) and then moved up/down by consecutive pass/fail streaks
// during practice sessions.
//
// domain: the skill being practiced  — listening | speaking | reading | writing
// tier:   the curriculum track       — general | academic
//
// Example rows for a student:
//   (listening, general)  → everyday listening level
//   (listening, academic) → academic listening level
//   (speaking,  general)  → speaking level
export const studentLevelsTable = pgTable("student_levels", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: uuid("student_id").notNull().references(() => studentsTable.id),
  domain: text("domain").notNull(), // listening | speaking | reading | writing
  tier: text("tier").notNull().default("general"), // 'general' | 'academic'
  currentLevel: decimal("current_level", { precision: 5, scale: 2 }).notNull().default("1.00"),
  exitThreshold: decimal("exit_threshold", { precision: 5, scale: 2 }).notNull().default("4.70"),
  atExit: boolean("at_exit").notNull().default(false),
  // How currentLevel was last set: guardian_entered (teacher/parent/admin typed it in),
  // placement_test (future — no test exists yet), or practice (adaptive engine moved it).
  source: text("source").notNull().default("practice"),
  consecutivePassCount: decimal("consecutive_pass_count", { precision: 3, scale: 0 }).notNull().default("0"),
  consecutiveFailCount: decimal("consecutive_fail_count", { precision: 3, scale: 0 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStudentLevelSchema = createInsertSchema(studentLevelsTable).omit({ id: true, updatedAt: true });
export type InsertStudentLevel = z.infer<typeof insertStudentLevelSchema>;
export type StudentLevel = typeof studentLevelsTable.$inferSelect;
