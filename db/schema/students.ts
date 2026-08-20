import { pgTable, text, uuid, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";
import { usersTable } from "./users";
import { schoolsTable } from "./schools";
import { districtsTable } from "./districts";

export const ACCOUNT_TYPES = [
  "solo",             // self-registered student, no guardian
  "parent_managed",   // added by a parent
  "teacher_managed",  // added to a teacher's roster
  "school_managed",   // added at school level (principal)
  "district_managed", // added at district level
] as const;
export type AccountType = typeof ACCOUNT_TYPES[number];

/**
 * A student's proficiency track — determines their exit threshold goal.
 *  "academic"  → full reclassification exit (WIDA 6.0)
 *  "general"   → everyday communication exit (WIDA 5.0)
 */
export const STUDENT_TRACKS = ["academic", "general"] as const;
export type StudentTrack = typeof STUDENT_TRACKS[number];

export const studentsTable = pgTable("students", {
  id: uuid("id").primaryKey().defaultRandom(),

  // FK to the guardian (teacher or parent) who manages this student.
  // Which kind of guardian it is is determined by accountType below /
  // guardians.userId -> users.role, not by a separate column.
  guardianId: uuid("guardian_id").references(() => profilesTable.id),

  // New unified auth FK — set when student has their own login via users table
  userId: uuid("user_id").unique().references(() => usersTable.id),

  name: text("name").notNull(),
  gradeBand: text("grade_band").notNull(), // 'K-2','3-5','6-8','9-12'
  stateAssessment: text("state_assessment").notNull(), // WIDA, OELPA, TELPAS, ELPAC, ELPA21, NYSESLAT
  homeLanguage: text("home_language"),
  track: text("track").notNull().default("academic"), // 'academic' | 'general'
  email: text("email").unique(), // set for self sign-up / Google accounts; null for teacher-added students
  googleId: text("google_id").unique(), // Google "sub" for accounts created via Continue with Google
  passwordHash: text("password_hash"), // bcrypt hash; null for Google-only or new-auth accounts
  avatarUrl: text("avatar_url"),

  // Account management hierarchy (exactly one or none will be non-null)
  accountType: text("account_type").notNull().default("solo"),
  schoolId: uuid("school_id").references(() => schoolsTable.id),
  districtId: uuid("district_id").references(() => districtsTable.id),

  // Gamification
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  streakShieldAvailable: boolean("streak_shield_available").notNull().default(true),
  totalXp: integer("total_xp").notNull().default(0),
  lastSessionDate: timestamp("last_session_date", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  emailVerified: boolean("email_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStudentSchema = createInsertSchema(studentsTable).omit({
  id: true,
  createdAt: true,
  currentStreak: true,
  longestStreak: true,
  streakShieldAvailable: true,
  totalXp: true,
});
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type Student = typeof studentsTable.$inferSelect;
