import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";

export const invitationsTable = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Who sent the invite
  inviterId: uuid("inviter_id").notNull(),
  inviterType: text("inviter_type").notNull(), // 'teacher' | 'parent' | 'district_admin'
  inviterName: text("inviter_name").notNull(),
  // Who is being invited
  inviteeEmail: text("invitee_email").notNull(),
  inviteeName: text("invitee_name").notNull(),
  // What they are being invited as (always 'student' for now)
  inviteeRole: text("invitee_role").notNull().default("student"),
  // Student profile details pre-filled by the inviter
  gradeBand: text("grade_band"),          // 'K-2' | '3-5' | '6-8' | '9-12'
  stateAssessment: text("state_assessment"), // WIDA | OELPA | TELPAS | ELPAC | ELPA21 | NYSESLAT
  homeLanguage: text("home_language"),
  // Optional personal note from the inviter
  message: text("message"),
  // Arbitrary JSON payload for non-student invite types (e.g. principal: school details)
  metadata: text("metadata"),
  // Token
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Invitation = typeof invitationsTable.$inferSelect;
