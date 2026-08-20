/**
 * student_object_mastery — tracks which image objects a student has correctly
 * identified and how long they should be suppressed from re-appearing as questions.
 *
 * Suppression uses progressive decay (spaced-repetition lite):
 *   correctCount = 1 → 7-day cooldown
 *   correctCount = 2 → 14-day cooldown
 *   correctCount ≥ 3 → 30-day cooldown
 *
 * Scope is per (student, image, label) so the same label in a different image
 * is treated independently. Cross-image mastery can be layered on top later
 * by querying on (studentId, label) without the imageId filter.
 */
import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { studentsTable } from "./students";
import { libraryTable } from "./library";

export const studentObjectMasteryTable = pgTable("student_object_mastery", {
  id: uuid("id").primaryKey().defaultRandom(),

  studentId: uuid("student_id")
    .notNull()
    .references(() => studentsTable.id, { onDelete: "cascade" }),

  imageId: uuid("image_id")
    .notNull()
    .references(() => libraryTable.id, { onDelete: "cascade" }),

  /** The exact label string as stored in library.tags / detection results. */
  label: text("label").notNull(),

  /** How many times the student answered a question for this label correctly. */
  correctCount: integer("correct_count").notNull().default(1),

  /** Timestamp of the most recent correct answer. */
  lastCorrectAt: timestamp("last_correct_at", { withTimezone: true })
    .notNull()
    .defaultNow(),

  /**
   * The question generator must filter out any row where suppressUntil > NOW().
   * Recomputed on every upsert using the progressive-decay schedule.
   */
  suppressUntil: timestamp("suppress_until", { withTimezone: true }).notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type StudentObjectMastery =
  typeof studentObjectMasteryTable.$inferSelect;
