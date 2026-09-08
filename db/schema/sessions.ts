import { pgTable, text, uuid, timestamp, decimal, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";

export const sessionsTable = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: uuid("student_id").notNull().references(() => studentsTable.id),
  sessionType: text("session_type").notNull().default("single"), // 'single' | 'all_four'
  domain: text("domain").notNull(), // listening | speaking | reading | writing
  tier: text("tier").notNull().default("general"), // 'general' | 'academic'
  levelStart: decimal("level_start", { precision: 5, scale: 2 }).notNull(),
  levelEnd: decimal("level_end", { precision: 5, scale: 2 }),
  scorePct: integer("score_pct"), // 0-100
  weakTypes: jsonb("weak_types"), // e.g. ['inference','extended_response']
  durationSeconds: integer("duration_seconds"),
  completed: boolean("completed").notNull().default(false),
  mode: text("mode").notNull().default("standard"), // 'standard' | 'exit_proximity'
  topic: text("topic"),   // listening: topic selected at session start — persists even if session abandoned
  keyUse: text("key_use"), // WIDA key use this session — Narrate | Inform | Explain | Argue (legacy: Recount)

  // Image-library sessions (levels 0–2) — used for object-mastery tracking.
  // libraryImageId: the specific image shown; imageTags: deduplicated labels
  // passed to Claude as question targets. Null for non-image sessions.
  libraryImageId: uuid("library_image_id"),  // intentionally no FK — images can be deleted without breaking history
  imageTags: jsonb("image_tags"),            // string[] — labels that were active question targets this session

  // Academic-tier sessions — subject area targeted (math/science/social_studies/ela).
  // Null for general-tier sessions.
  subject: text("subject"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({ id: true, createdAt: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;
