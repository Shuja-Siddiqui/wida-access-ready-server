import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { schoolsTable } from "./schools";

// Profile row for any adult who manages one or more student rosters —
// covers users with role 'teacher', 'principal', 'super_admin', or 'parent'.
// A parent managing their own kids and a teacher managing a classroom roster
// are the same underlying entity, so role stays on `users.role` and this
// table holds the shared profile fields.
export const profilesTable = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => usersTable.id),
  // Structured FK to the schools table — optional, teachers don't need a school.
  schoolId: uuid("school_id").references(() => schoolsTable.id),
  // Legacy free-text school name kept for backward compat display when not
  // linked to a schools record (e.g. teacher typed a school name during onboarding).
  school: text("school"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProfileSchema = createInsertSchema(profilesTable).omit({ id: true, createdAt: true });
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profilesTable.$inferSelect;
