var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// scripts/listening-passage-question-audit.ts
import fs2 from "node:fs";
import path4 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/lib/claude/client.ts
import Anthropic from "@anthropic-ai/sdk";

// src/lib/ai-token-context.ts
import { AsyncLocalStorage } from "node:async_hooks";
var storage = new AsyncLocalStorage();
function getAiTokenContext() {
  return storage.getStore();
}

// src/lib/ai-token-usage.ts
import { and, desc, eq, isNull, sql } from "drizzle-orm";

// db/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

// db/schema/index.ts
var schema_exports = {};
__export(schema_exports, {
  ACCOUNT_TYPES: () => ACCOUNT_TYPES,
  BILLING_PLANS: () => BILLING_PLANS,
  IMAGE_FACTORY_SUBJECTS: () => IMAGE_FACTORY_SUBJECTS,
  IMAGE_GENERATION_JOB_STATUSES: () => IMAGE_GENERATION_JOB_STATUSES,
  LIBRARY_GENERATION_BACKENDS: () => LIBRARY_GENERATION_BACKENDS,
  LIBRARY_INGEST_SOURCES: () => LIBRARY_INGEST_SOURCES,
  OWNER_TYPES: () => OWNER_TYPES,
  RENEWAL_QUEUE_STATUSES: () => RENEWAL_QUEUE_STATUSES,
  STUDENT_TRACKS: () => STUDENT_TRACKS,
  USER_ROLES: () => USER_ROLES,
  aiTokenCallsTable: () => aiTokenCallsTable,
  aiUsageDailyTable: () => aiUsageDailyTable,
  billingConfigTable: () => billingConfigTable,
  contentCategoriesTable: () => contentCategoriesTable,
  districtAdminsTable: () => districtAdminsTable,
  districtSeatAllocationsTable: () => districtSeatAllocationsTable,
  districtsTable: () => districtsTable,
  emailVerificationTokensTable: () => emailVerificationTokensTable,
  imageGenerationJobsTable: () => imageGenerationJobsTable,
  imageGenerationPoolsTable: () => imageGenerationPoolsTable,
  insertBillingConfigSchema: () => insertBillingConfigSchema,
  insertDistrictAdminSchema: () => insertDistrictAdminSchema,
  insertDistrictSchema: () => insertDistrictSchema,
  insertMediaAssetSchema: () => insertMediaAssetSchema,
  insertOwnerStripeCustomerSchema: () => insertOwnerStripeCustomerSchema,
  insertProfileSchema: () => insertProfileSchema,
  insertSchoolSchema: () => insertSchoolSchema,
  insertSessionAnswerSchema: () => insertSessionAnswerSchema,
  insertSessionSchema: () => insertSessionSchema,
  insertStudentLevelSchema: () => insertStudentLevelSchema,
  insertStudentSchema: () => insertStudentSchema,
  insertUserSchema: () => insertUserSchema,
  invitationsTable: () => invitationsTable,
  libraryTable: () => libraryTable,
  libraryTopicsTable: () => libraryTopicsTable,
  mediaAssetsTable: () => mediaAssetsTable,
  ownerStripeCustomersTable: () => ownerStripeCustomersTable,
  passwordResetTokensTable: () => passwordResetTokensTable,
  profilesTable: () => profilesTable,
  rateLimitBucketsTable: () => rateLimitBucketsTable,
  rateLimitSettingsTable: () => rateLimitSettingsTable,
  refreshTokensTable: () => refreshTokensTable,
  schoolsTable: () => schoolsTable,
  sessionAnswersTable: () => sessionAnswersTable,
  sessionsTable: () => sessionsTable,
  studentLevelsTable: () => studentLevelsTable,
  studentObjectMasteryTable: () => studentObjectMasteryTable,
  studentPracticeSuggestionsTable: () => studentPracticeSuggestionsTable,
  studentsTable: () => studentsTable,
  subscriptionRenewalQueueTable: () => subscriptionRenewalQueueTable,
  topicsTable: () => topicsTable,
  userSessionsTable: () => userSessionsTable,
  usersTable: () => usersTable
});

// db/schema/users.ts
import { pgTable, text, uuid, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var USER_ROLES = ["student", "parent", "teacher", "principal", "district_admin", "super_admin"];
var usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  // null for Google-only accounts
  googleId: text("google_id").unique(),
  // Google OAuth "sub"
  role: text("role").notNull(),
  // UserRole
  emailVerified: boolean("email_verified").notNull().default(false),
  school: text("school"),
  // optional school name for educators
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
var insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });

// db/schema/districts.ts
import { pgTable as pgTable2, text as text2, uuid as uuid2, timestamp as timestamp2 } from "drizzle-orm/pg-core";
import { createInsertSchema as createInsertSchema2 } from "drizzle-zod";
var districtsTable = pgTable2("districts", {
  id: uuid2("id").primaryKey().defaultRandom(),
  name: text2("name").notNull(),
  state: text2("state"),
  // Short code teachers/schools use to join this district (e.g. "CHIC-001")
  districtCode: text2("district_code").unique(),
  // The district_admin user who owns/created this district
  adminId: uuid2("admin_id").references(() => usersTable.id),
  createdAt: timestamp2("created_at", { withTimezone: true }).notNull().defaultNow()
});
var insertDistrictSchema = createInsertSchema2(districtsTable).omit({ id: true, createdAt: true });

// db/schema/schools.ts
import { pgTable as pgTable3, text as text3, uuid as uuid3, timestamp as timestamp3 } from "drizzle-orm/pg-core";
import { createInsertSchema as createInsertSchema3 } from "drizzle-zod";
var schoolsTable = pgTable3("schools", {
  id: uuid3("id").primaryKey().defaultRandom(),
  // Null = independent school not affiliated with a district
  districtId: uuid3("district_id").references(() => districtsTable.id),
  name: text3("name").notNull(),
  state: text3("state"),
  // Short code teachers/students use to join this school (e.g. "WASH-042")
  schoolCode: text3("school_code").unique(),
  createdAt: timestamp3("created_at", { withTimezone: true }).notNull().defaultNow()
});
var insertSchoolSchema = createInsertSchema3(schoolsTable).omit({ id: true, createdAt: true });

// db/schema/profiles.ts
import { pgTable as pgTable4, text as text4, uuid as uuid4, timestamp as timestamp4 } from "drizzle-orm/pg-core";
import { createInsertSchema as createInsertSchema4 } from "drizzle-zod";
var profilesTable = pgTable4("profiles", {
  id: uuid4("id").primaryKey().defaultRandom(),
  userId: uuid4("user_id").notNull().unique().references(() => usersTable.id),
  // Structured FK to the schools table — optional, teachers don't need a school.
  schoolId: uuid4("school_id").references(() => schoolsTable.id),
  // Legacy free-text school name kept for backward compat display when not
  // linked to a schools record (e.g. teacher typed a school name during onboarding).
  school: text4("school"),
  avatarUrl: text4("avatar_url"),
  createdAt: timestamp4("created_at", { withTimezone: true }).notNull().defaultNow()
});
var insertProfileSchema = createInsertSchema4(profilesTable).omit({ id: true, createdAt: true });

// db/schema/district_admins.ts
import { pgTable as pgTable5, uuid as uuid5, timestamp as timestamp5 } from "drizzle-orm/pg-core";
import { createInsertSchema as createInsertSchema5 } from "drizzle-zod";
var districtAdminsTable = pgTable5("district_admins", {
  id: uuid5("id").primaryKey().defaultRandom(),
  userId: uuid5("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  districtId: uuid5("district_id").references(() => districtsTable.id, { onDelete: "set null" }),
  createdAt: timestamp5("created_at", { withTimezone: true }).notNull().defaultNow()
});
var insertDistrictAdminSchema = createInsertSchema5(districtAdminsTable).omit({
  id: true,
  createdAt: true
});

// db/schema/students.ts
import { pgTable as pgTable6, text as text5, uuid as uuid6, timestamp as timestamp6, boolean as boolean2, integer } from "drizzle-orm/pg-core";
import { createInsertSchema as createInsertSchema6 } from "drizzle-zod";
var ACCOUNT_TYPES = [
  "solo",
  // self-registered student, no guardian
  "parent_managed",
  // added by a parent
  "teacher_managed",
  // added to a teacher's roster
  "school_managed",
  // added at school level (principal)
  "district_managed"
  // added at district level
];
var STUDENT_TRACKS = ["academic", "general"];
var studentsTable = pgTable6("students", {
  id: uuid6("id").primaryKey().defaultRandom(),
  // FK to the guardian (teacher or parent) who manages this student.
  // Which kind of guardian it is is determined by accountType below /
  // guardians.userId -> users.role, not by a separate column.
  guardianId: uuid6("guardian_id").references(() => profilesTable.id),
  // New unified auth FK — set when student has their own login via users table
  userId: uuid6("user_id").unique().references(() => usersTable.id),
  name: text5("name").notNull(),
  gradeBand: text5("grade_band").notNull(),
  // 'K-2','3-5','6-8','9-12'
  stateAssessment: text5("state_assessment").notNull(),
  // WIDA, OELPA, TELPAS, ELPAC, ELPA21, NYSESLAT
  homeLanguage: text5("home_language"),
  track: text5("track").notNull().default("academic"),
  // 'academic' | 'general'
  email: text5("email").unique(),
  // set for self sign-up / Google accounts; null for teacher-added students
  googleId: text5("google_id").unique(),
  // Google "sub" for accounts created via Continue with Google
  passwordHash: text5("password_hash"),
  // bcrypt hash; null for Google-only or new-auth accounts
  avatarUrl: text5("avatar_url"),
  // Account management hierarchy (exactly one or none will be non-null)
  accountType: text5("account_type").notNull().default("solo"),
  schoolId: uuid6("school_id").references(() => schoolsTable.id),
  districtId: uuid6("district_id").references(() => districtsTable.id),
  // Gamification
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  streakShieldAvailable: boolean2("streak_shield_available").notNull().default(true),
  totalXp: integer("total_xp").notNull().default(0),
  lastSessionDate: timestamp6("last_session_date", { withTimezone: true }),
  lastLoginAt: timestamp6("last_login_at", { withTimezone: true }),
  emailVerified: boolean2("email_verified").notNull().default(false),
  createdAt: timestamp6("created_at", { withTimezone: true }).notNull().defaultNow()
});
var insertStudentSchema = createInsertSchema6(studentsTable).omit({
  id: true,
  createdAt: true,
  currentStreak: true,
  longestStreak: true,
  streakShieldAvailable: true,
  totalXp: true
});

// db/schema/student_levels.ts
import { pgTable as pgTable7, text as text6, uuid as uuid7, timestamp as timestamp7, decimal, boolean as boolean3, unique } from "drizzle-orm/pg-core";
import { createInsertSchema as createInsertSchema7 } from "drizzle-zod";
var studentLevelsTable = pgTable7(
  "student_levels",
  {
    id: uuid7("id").primaryKey().defaultRandom(),
    studentId: uuid7("student_id").notNull().references(() => studentsTable.id),
    domain: text6("domain").notNull(),
    // listening | speaking | reading | writing
    tier: text6("tier").notNull().default("academic"),
    // 'academic' (legacy rows may still say 'general')
    currentLevel: decimal("current_level", { precision: 5, scale: 2 }).notNull().default("1.00"),
    exitThreshold: decimal("exit_threshold", { precision: 5, scale: 2 }).notNull().default("4.70"),
    atExit: boolean3("at_exit").notNull().default(false),
    // How currentLevel was last set: guardian_entered (teacher/parent/admin typed it in),
    // placement_test (future — no test exists yet), or practice (adaptive engine moved it).
    source: text6("source").notNull().default("practice"),
    consecutivePassCount: decimal("consecutive_pass_count", { precision: 3, scale: 0 }).notNull().default("0"),
    consecutiveFailCount: decimal("consecutive_fail_count", { precision: 3, scale: 0 }).notNull().default("0"),
    updatedAt: timestamp7("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique().on(table.studentId, table.domain, table.tier)]
);
var insertStudentLevelSchema = createInsertSchema7(studentLevelsTable).omit({ id: true, updatedAt: true });

// db/schema/sessions.ts
import { pgTable as pgTable8, text as text7, uuid as uuid8, timestamp as timestamp8, decimal as decimal2, integer as integer2, boolean as boolean4, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema as createInsertSchema8 } from "drizzle-zod";
var sessionsTable = pgTable8("sessions", {
  id: uuid8("id").primaryKey().defaultRandom(),
  studentId: uuid8("student_id").notNull().references(() => studentsTable.id),
  sessionType: text7("session_type").notNull().default("single"),
  // 'single' | 'all_four'
  domain: text7("domain").notNull(),
  // listening | speaking | reading | writing
  tier: text7("tier").notNull().default("academic"),
  // 'academic' (legacy rows may still say 'general')
  levelStart: decimal2("level_start", { precision: 5, scale: 2 }).notNull(),
  levelEnd: decimal2("level_end", { precision: 5, scale: 2 }),
  scorePct: integer2("score_pct"),
  // 0-100
  weakTypes: jsonb("weak_types"),
  // e.g. ['inference','extended_response']
  durationSeconds: integer2("duration_seconds"),
  completed: boolean4("completed").notNull().default(false),
  mode: text7("mode").notNull().default("standard"),
  // 'standard' | 'exit_proximity'
  topic: text7("topic"),
  // listening: topic selected at session start — persists even if session abandoned
  keyUse: text7("key_use"),
  // WIDA key use this session — Narrate | Inform | Explain | Argue (legacy: Recount)
  // Image-library sessions (levels 0–2) — used for object-mastery tracking.
  // libraryImageId: the specific image shown; imageTags: deduplicated labels
  // passed to Claude as question targets. Null for non-image sessions.
  libraryImageId: uuid8("library_image_id"),
  // intentionally no FK — images can be deleted without breaking history
  imageTags: jsonb("image_tags"),
  // string[] — labels that were active question targets this session
  // Academic-tier sessions — subject area targeted (math/science/social_studies/ela).
  // Null for general-tier sessions.
  subject: text7("subject"),
  // AI practice report from session complete (strengths, weaknesses, coach note for next generate).
  practiceReport: jsonb("practice_report"),
  /** Rolling sum of AI token usage for this practice session (all calls linked to session_id). */
  aiInputTokens: integer2("ai_input_tokens").notNull().default(0),
  aiOutputTokens: integer2("ai_output_tokens").notNull().default(0),
  aiTotalTokens: integer2("ai_total_tokens").notNull().default(0),
  aiCallCount: integer2("ai_call_count").notNull().default(0),
  createdAt: timestamp8("created_at", { withTimezone: true }).notNull().defaultNow()
});
var insertSessionSchema = createInsertSchema8(sessionsTable).omit({ id: true, createdAt: true });

// db/schema/session_answers.ts
import { pgTable as pgTable9, uuid as uuid9, integer as integer3, text as text8, jsonb as jsonb2, boolean as boolean5, timestamp as timestamp9 } from "drizzle-orm/pg-core";
import { createInsertSchema as createInsertSchema9 } from "drizzle-zod";
var sessionAnswersTable = pgTable9("session_answers", {
  id: uuid9("id").primaryKey().defaultRandom(),
  sessionId: uuid9("session_id").notNull().references(() => sessionsTable.id),
  questionIndex: integer3("question_index").notNull(),
  question: text8("question").notNull(),
  content: jsonb2("content"),
  // full question content: options, correct answer, passage/prompt, explanation, etc.
  submittedAnswer: jsonb2("submitted_answer"),
  // what the student actually submitted (selected option, typed text, etc.)
  correct: boolean5("correct").notNull(),
  createdAt: timestamp9("created_at", { withTimezone: true }).notNull().defaultNow()
});
var insertSessionAnswerSchema = createInsertSchema9(sessionAnswersTable).omit({ id: true, createdAt: true });

// db/schema/student_practice_suggestions.ts
import { pgTable as pgTable10, text as text9, uuid as uuid10, timestamp as timestamp10, unique as unique2 } from "drizzle-orm/pg-core";
var studentPracticeSuggestionsTable = pgTable10(
  "student_practice_suggestions",
  {
    id: uuid10("id").primaryKey().defaultRandom(),
    studentId: uuid10("student_id").notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
    domain: text9("domain").notNull(),
    message: text9("message").notNull(),
    sourceSessionId: uuid10("source_session_id").references(() => sessionsTable.id, {
      onDelete: "set null"
    }),
    updatedAt: timestamp10("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique2().on(table.studentId, table.domain)]
);

// db/schema/student_object_mastery.ts
import { pgTable as pgTable12, uuid as uuid12, text as text11, integer as integer5, timestamp as timestamp12 } from "drizzle-orm/pg-core";

// db/schema/library.ts
import { pgTable as pgTable11, uuid as uuid11, text as text10, integer as integer4, jsonb as jsonb3, timestamp as timestamp11 } from "drizzle-orm/pg-core";
var LIBRARY_INGEST_SOURCES = ["admin_upload", "image_factory"];
var LIBRARY_GENERATION_BACKENDS = ["hf-inference", "flux-sidecar"];
var libraryTable = pgTable11("library", {
  id: uuid11("id").primaryKey().defaultRandom(),
  s3Key: text10("s3_key").notNull(),
  /** S3 key for 200 px-wide JPEG thumbnail generated on upload */
  thumbnailKey: text10("thumbnail_key"),
  /** S3 key for 600 px-wide JPEG medium image generated on upload */
  mediumKey: text10("medium_key"),
  contentType: text10("content_type").notNull().default("image/jpeg"),
  sizeBytes: integer4("size_bytes"),
  /** Confirmed labels that OWL-ViT / Grounding DINO found in the image */
  tags: jsonb3("tags").$type().notNull().default([]),
  /** Raw candidate nouns Claude described from the image */
  description: text10("description"),
  /** Full detection payload from the last /detect call on this image */
  detectionResults: jsonb3("detection_results").$type(),
  /**
   * Intended usage contexts for this image. Controls which session types can use it.
   * Values: "academic:math" | "academic:science" | "academic:social_studies" | "academic:ela"
   * An image can belong to multiple SF contexts (e.g. ["academic:science","academic:ela"]).
   * Empty array = uncategorised; excluded from SF session image queries until tagged.
   */
  contexts: text10("contexts").array().notNull().default([]),
  /** The user who uploaded this image (super_admin, district_admin, principal). Null = anonymous. */
  uploaderId: uuid11("uploader_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp11("created_at", { withTimezone: true }).notNull().defaultNow(),
  /**
   * Specific academic concept depicted in the image, e.g. "Chromosomes",
   * "Cell Membrane", "Westward Expansion", "Ancient Rome".
   * Passed directly to the AI so the passage + questions are concept-accurate.
   * Null = not yet labelled.
   */
  imageConcept: text10("image_concept"),
  /**
   * Per-subject academic vision analysis produced by Claude Vision at upload/processing time.
   * Key = AcademicSubject ("math" | "science" | "social_studies" | "ela").
   * Value = { concept, description, tags } — used by academic image-tap content generator
   * instead of the sparse Grounding DINO object labels.
   */
  academicVision: jsonb3("academic_vision").$type().notNull().default({}),
  /** Times this image was selected for a writing session (least-used picked on recycle). */
  useCount: integer4("use_count").notNull().default(0),
  /** admin_upload = manual library upload; image_factory = HF/FLUX factory ingest. */
  ingestSource: text10("ingest_source").notNull().default("admin_upload").$type(),
  /** Set for image_factory rows: hf-inference | flux-sidecar. */
  generationBackend: text10("generation_backend").$type()
});

// db/schema/student_object_mastery.ts
var studentObjectMasteryTable = pgTable12("student_object_mastery", {
  id: uuid12("id").primaryKey().defaultRandom(),
  studentId: uuid12("student_id").notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
  imageId: uuid12("image_id").notNull().references(() => libraryTable.id, { onDelete: "cascade" }),
  /** The exact label string as stored in library.tags / detection results. */
  label: text11("label").notNull(),
  /** How many times the student answered a question for this label correctly. */
  correctCount: integer5("correct_count").notNull().default(1),
  /** Timestamp of the most recent correct answer. */
  lastCorrectAt: timestamp12("last_correct_at", { withTimezone: true }).notNull().defaultNow(),
  /**
   * The question generator must filter out any row where suppressUntil > NOW().
   * Recomputed on every upsert using the progressive-decay schedule.
   */
  suppressUntil: timestamp12("suppress_until", { withTimezone: true }).notNull(),
  createdAt: timestamp12("created_at", { withTimezone: true }).notNull().defaultNow()
});

// db/schema/user_sessions.ts
import { index, pgTable as pgTable13, text as text12, uuid as uuid13, timestamp as timestamp13 } from "drizzle-orm/pg-core";
var userSessionsTable = pgTable13(
  "user_sessions",
  {
    id: uuid13("id").primaryKey().defaultRandom(),
    userId: uuid13("user_id").notNull(),
    userType: text12("user_type").notNull(),
    // 'student' | 'teacher' | 'parent' | ...
    tokenHash: text12("token_hash").notNull().unique(),
    /** Client user-agent captured at login for session context. */
    userAgent: text12("user_agent"),
    /** Client IP (or first x-forwarded-for hop) captured at login. */
    ipAddress: text12("ip_address"),
    createdAt: timestamp13("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp13("last_active_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp13("expires_at", { withTimezone: true }).notNull()
  },
  (table) => [
    index("user_sessions_user_id_user_type_idx").on(table.userId, table.userType)
  ]
);

// db/schema/password_reset_tokens.ts
import { pgTable as pgTable14, text as text13, uuid as uuid14, timestamp as timestamp14 } from "drizzle-orm/pg-core";
var passwordResetTokensTable = pgTable14("password_reset_tokens", {
  id: uuid14("id").primaryKey().defaultRandom(),
  email: text13("email").notNull(),
  userType: text13("user_type").notNull(),
  // 'student' | 'teacher'
  tokenHash: text13("token_hash").notNull().unique(),
  expiresAt: timestamp14("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp14("used_at", { withTimezone: true }),
  createdAt: timestamp14("created_at", { withTimezone: true }).notNull().defaultNow()
});

// db/schema/email_verification_tokens.ts
import { pgTable as pgTable15, text as text14, uuid as uuid15, timestamp as timestamp15 } from "drizzle-orm/pg-core";
var emailVerificationTokensTable = pgTable15("email_verification_tokens", {
  id: uuid15("id").primaryKey().defaultRandom(),
  email: text14("email").notNull(),
  userType: text14("user_type").notNull(),
  // 'student' | 'teacher' | 'parent'
  tokenHash: text14("token_hash").notNull().unique(),
  expiresAt: timestamp15("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp15("used_at", { withTimezone: true }),
  createdAt: timestamp15("created_at", { withTimezone: true }).notNull().defaultNow()
});

// db/schema/invitations.ts
import { pgTable as pgTable16, text as text15, uuid as uuid16, timestamp as timestamp16 } from "drizzle-orm/pg-core";
var invitationsTable = pgTable16("invitations", {
  id: uuid16("id").primaryKey().defaultRandom(),
  // Who sent the invite
  inviterId: uuid16("inviter_id").notNull(),
  inviterType: text15("inviter_type").notNull(),
  // 'teacher' | 'parent' | 'district_admin'
  inviterName: text15("inviter_name").notNull(),
  // Who is being invited
  inviteeEmail: text15("invitee_email").notNull(),
  inviteeName: text15("invitee_name").notNull(),
  // What they are being invited as (always 'student' for now)
  inviteeRole: text15("invitee_role").notNull().default("student"),
  // Student profile details pre-filled by the inviter
  gradeBand: text15("grade_band"),
  // 'K-2' | '3-5' | '6-8' | '9-12'
  stateAssessment: text15("state_assessment"),
  // WIDA | OELPA | TELPAS | ELPAC | ELPA21 | NYSESLAT
  homeLanguage: text15("home_language"),
  // Optional personal note from the inviter
  message: text15("message"),
  // Arbitrary JSON payload for non-student invite types (e.g. principal: school details)
  metadata: text15("metadata"),
  // Token
  tokenHash: text15("token_hash").notNull().unique(),
  expiresAt: timestamp16("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp16("accepted_at", { withTimezone: true }),
  createdAt: timestamp16("created_at", { withTimezone: true }).notNull().defaultNow()
});

// db/schema/billing.ts
import { pgTable as pgTable17, text as text16, uuid as uuid17, timestamp as timestamp17, unique as unique3 } from "drizzle-orm/pg-core";
import { createInsertSchema as createInsertSchema10 } from "drizzle-zod";
var BILLING_PLANS = ["solo", "organization"];
var OWNER_TYPES = ["solo", "organization"];
var ownerStripeCustomersTable = pgTable17(
  "owner_stripe_customers",
  {
    id: uuid17("id").primaryKey().defaultRandom(),
    ownerId: uuid17("owner_id").notNull(),
    ownerType: text16("owner_type").notNull(),
    // OwnerType
    stripeCustomerId: text16("stripe_customer_id").notNull(),
    createdAt: timestamp17("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique3().on(table.ownerId, table.ownerType)]
);
var insertOwnerStripeCustomerSchema = createInsertSchema10(ownerStripeCustomersTable).omit({
  id: true,
  createdAt: true
});
var RENEWAL_QUEUE_STATUSES = ["pending", "attempted", "succeeded", "failed", "skipped"];
var subscriptionRenewalQueueTable = pgTable17(
  "subscription_renewal_queue",
  {
    id: uuid17("id").primaryKey().defaultRandom(),
    subscriptionId: text16("subscription_id").notNull(),
    ownerId: uuid17("owner_id").notNull(),
    ownerType: text16("owner_type").notNull(),
    // OwnerType
    renewalDue: timestamp17("renewal_due", { withTimezone: true }).notNull(),
    status: text16("status").notNull().default("pending"),
    // RenewalQueueStatus
    attemptedAt: timestamp17("attempted_at", { withTimezone: true }),
    failureReason: text16("failure_reason"),
    createdAt: timestamp17("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp17("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique3().on(table.subscriptionId, table.renewalDue)]
);

// db/schema/billing_config.ts
import { pgTable as pgTable18, text as text17, integer as integer6, timestamp as timestamp18 } from "drizzle-orm/pg-core";
import { createInsertSchema as createInsertSchema11 } from "drizzle-zod";
var billingConfigTable = pgTable18("billing_config", {
  planId: text17("plan_id").primaryKey(),
  // "solo" | "organization"
  name: text17("name").notNull(),
  priceCents: integer6("price_cents").notNull(),
  // e.g. 2000 = $20
  currency: text17("currency").notNull().default("usd"),
  updatedAt: timestamp18("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text17("updated_by")
  // super_admin user id
});
var insertBillingConfigSchema = createInsertSchema11(billingConfigTable);

// db/schema/rate_limit_settings.ts
import { pgTable as pgTable19, text as text18, integer as integer7, boolean as boolean6, timestamp as timestamp19 } from "drizzle-orm/pg-core";
var rateLimitSettingsTable = pgTable19("rate_limit_settings", {
  id: text18("id").primaryKey(),
  enabled: boolean6("enabled").notNull().default(true),
  windowMs: integer7("window_ms").notNull(),
  aiMaxPerStudent: integer7("ai_max_per_student").notNull(),
  updatedAt: timestamp19("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text18("updated_by")
});

// db/schema/rate_limit_buckets.ts
import { pgTable as pgTable20, text as text19, bigint, integer as integer8 } from "drizzle-orm/pg-core";
var rateLimitBucketsTable = pgTable20("rate_limit_buckets", {
  bucketKey: text19("bucket_key").primaryKey(),
  windowStart: bigint("window_start", { mode: "number" }).notNull(),
  hitCount: integer8("hit_count").notNull()
});

// db/schema/ai_usage_daily.ts
import { date, integer as integer9, pgTable as pgTable21, primaryKey, uuid as uuid18 } from "drizzle-orm/pg-core";
var aiUsageDailyTable = pgTable21(
  "ai_usage_daily",
  {
    studentId: uuid18("student_id").notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
    usageDate: date("usage_date").notNull(),
    totalCalls: integer9("total_calls").notNull().default(0),
    generateCalls: integer9("generate_calls").notNull().default(0),
    coachingCalls: integer9("coaching_calls").notNull().default(0),
    speechCalls: integer9("speech_calls").notNull().default(0),
    inputTokens: integer9("input_tokens").notNull().default(0),
    outputTokens: integer9("output_tokens").notNull().default(0),
    totalTokens: integer9("total_tokens").notNull().default(0)
  },
  (t) => [primaryKey({ columns: [t.studentId, t.usageDate] })]
);

// db/schema/ai_token_calls.ts
import { index as index2, integer as integer13, pgTable as pgTable25, text as text23, timestamp as timestamp23, uuid as uuid22 } from "drizzle-orm/pg-core";

// db/schema/image_generation.ts
import { pgTable as pgTable24, uuid as uuid21, text as text22, integer as integer12, jsonb as jsonb4, timestamp as timestamp22, uniqueIndex as uniqueIndex2 } from "drizzle-orm/pg-core";

// db/schema/topics.ts
import { pgTable as pgTable23, uuid as uuid20, text as text21, integer as integer11, boolean as boolean8, timestamp as timestamp21, uniqueIndex } from "drizzle-orm/pg-core";

// db/schema/content_categories.ts
import { pgTable as pgTable22, uuid as uuid19, text as text20, integer as integer10, boolean as boolean7, timestamp as timestamp20 } from "drizzle-orm/pg-core";
var contentCategoriesTable = pgTable22("content_categories", {
  id: uuid19("id").primaryKey().defaultRandom(),
  name: text20("name").notNull(),
  slug: text20("slug").notNull().unique(),
  description: text20("description"),
  displayOrder: integer10("display_order").notNull().default(0),
  isActive: boolean7("is_active").notNull().default(true),
  createdAt: timestamp20("created_at", { withTimezone: true }).notNull().defaultNow()
});

// db/schema/topics.ts
var topicsTable = pgTable23("topics", {
  id: uuid20("id").primaryKey().defaultRandom(),
  contentCategoryId: uuid20("content_category_id").notNull().references(() => contentCategoriesTable.id, { onDelete: "cascade" }),
  name: text21("name").notNull(),
  slug: text21("slug").notNull(),
  description: text21("description"),
  displayOrder: integer11("display_order").notNull().default(0),
  isActive: boolean8("is_active").notNull().default(true),
  createdAt: timestamp21("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [
  uniqueIndex("topics_content_category_id_slug_idx").on(t.contentCategoryId, t.slug)
]);

// db/schema/image_generation.ts
var IMAGE_FACTORY_SUBJECTS = [
  "ela",
  "math",
  "science",
  "social_studies"
];
var IMAGE_GENERATION_JOB_STATUSES = [
  "prompt_ready",
  "generated",
  "ingested",
  "failed"
];
var imageGenerationPoolsTable = pgTable24(
  "image_generation_pools",
  {
    id: uuid21("id").primaryKey().defaultRandom(),
    subject: text22("subject").notNull(),
    level: integer12("level").notNull(),
    lastComplexityStep: integer12("last_complexity_step").notNull().default(0),
    lastGeneratedAt: timestamp22("last_generated_at", { withTimezone: true }),
    updatedAt: timestamp22("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    uniqueIndex2("image_generation_pools_subject_level_idx").on(t.subject, t.level)
  ]
);
var imageGenerationJobsTable = pgTable24("image_generation_jobs", {
  id: uuid21("id").primaryKey().defaultRandom(),
  createdBy: uuid21("created_by").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  subject: text22("subject").notNull(),
  level: integer12("level").notNull(),
  complexityStep: integer12("complexity_step").notNull(),
  topicId: uuid21("topic_id").references(() => topicsTable.id, { onDelete: "set null" }),
  keyUse: text22("key_use"),
  focus: text22("focus"),
  claudeRationale: text22("claude_rationale"),
  contextSnapshot: jsonb4("context_snapshot").$type(),
  hfPrompt: text22("hf_prompt").notNull(),
  suggestedObjects: jsonb4("suggested_objects").$type().notNull().default([]),
  imageConcept: text22("image_concept"),
  status: text22("status").notNull().default("prompt_ready"),
  libraryImageId: uuid21("library_image_id").references(() => libraryTable.id, { onDelete: "set null" }),
  error: text22("error"),
  createdAt: timestamp22("created_at", { withTimezone: true }).notNull().defaultNow()
});

// db/schema/ai_token_calls.ts
var aiTokenCallsTable = pgTable25(
  "ai_token_calls",
  {
    id: uuid22("id").primaryKey().defaultRandom(),
    studentId: uuid22("student_id").references(() => studentsTable.id, { onDelete: "cascade" }),
    userId: uuid22("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    imageJobId: uuid22("image_job_id").references(() => imageGenerationJobsTable.id, { onDelete: "set null" }),
    sessionId: uuid22("session_id").references(() => sessionsTable.id, { onDelete: "set null" }),
    /** content_generate | item_feedback | attempt_feedback | image_factory | … */
    callKind: text23("call_kind").notNull(),
    domain: text23("domain"),
    model: text23("model"),
    inputTokens: integer13("input_tokens").notNull().default(0),
    outputTokens: integer13("output_tokens").notNull().default(0),
    totalTokens: integer13("total_tokens").notNull().default(0),
    createdAt: timestamp23("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index2("ai_token_calls_student_created_idx").on(t.studentId, t.createdAt),
    index2("ai_token_calls_user_created_idx").on(t.userId, t.createdAt),
    index2("ai_token_calls_session_idx").on(t.sessionId),
    index2("ai_token_calls_image_job_idx").on(t.imageJobId)
  ]
);

// db/schema/district_seat_allocations.ts
import { pgTable as pgTable26, uuid as uuid23, integer as integer14, timestamp as timestamp24, unique as unique4 } from "drizzle-orm/pg-core";
var districtSeatAllocationsTable = pgTable26(
  "district_seat_allocations",
  {
    id: uuid23("id").primaryKey().defaultRandom(),
    districtAdminId: uuid23("district_admin_id").notNull().references(() => districtAdminsTable.id, { onDelete: "cascade" }),
    schoolId: uuid23("school_id").notNull().references(() => schoolsTable.id, { onDelete: "cascade" }),
    seatsAllocated: integer14("seats_allocated").notNull().default(0),
    createdAt: timestamp24("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp24("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique4().on(table.districtAdminId, table.schoolId)]
);

// db/schema/refresh_tokens.ts
import { index as index3, pgTable as pgTable27, text as text24, uuid as uuid24, timestamp as timestamp25 } from "drizzle-orm/pg-core";
var refreshTokensTable = pgTable27(
  "refresh_tokens",
  {
    id: uuid24("id").primaryKey().defaultRandom(),
    userId: uuid24("user_id").notNull(),
    userType: text24("user_type").notNull(),
    // 'student' | 'teacher' | 'parent' | ...
    tokenHash: text24("token_hash").notNull().unique(),
    expiresAt: timestamp25("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp25("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index3("refresh_tokens_user_id_user_type_idx").on(table.userId, table.userType)
  ]
);

// db/schema/media_assets.ts
import { pgTable as pgTable28, text as text25, uuid as uuid25, timestamp as timestamp26, integer as integer15, jsonb as jsonb5 } from "drizzle-orm/pg-core";
import { createInsertSchema as createInsertSchema12 } from "drizzle-zod";
var mediaAssetsTable = pgTable28("media_assets", {
  id: uuid25("id").primaryKey().defaultRandom(),
  name: text25("name").notNull(),
  description: text25("description"),
  s3Key: text25("s3_key").notNull().unique(),
  contentType: text25("content_type").notNull(),
  size: integer15("size"),
  // bytes
  metadata: jsonb5("metadata").$type(),
  uploadedBy: uuid25("uploaded_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp26("created_at", { withTimezone: true }).notNull().defaultNow()
});
var insertMediaAssetSchema = createInsertSchema12(mediaAssetsTable).omit({
  id: true,
  createdAt: true
});

// db/schema/library_topics.ts
import { pgTable as pgTable29, uuid as uuid26, integer as integer16, timestamp as timestamp27, primaryKey as primaryKey2 } from "drizzle-orm/pg-core";
var libraryTopicsTable = pgTable29("library_topics", {
  libraryId: uuid26("library_id").notNull().references(() => libraryTable.id, { onDelete: "cascade" }),
  topicId: uuid26("topic_id").notNull().references(() => topicsTable.id, { onDelete: "cascade" }),
  sortOrder: integer16("sort_order").notNull().default(0),
  addedAt: timestamp27("added_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [
  primaryKey2({ columns: [t.libraryId, t.topicId] })
]);

// db/index.ts
var { Pool } = pg;
var pool;
var localUrl = process.env.LOCAL_DATABASE_URL ?? process.env.DATABASE_URL;
if (localUrl) {
  pool = new Pool({ connectionString: localUrl });
} else if (process.env.POSTGRES_PASSWORD && process.env.POSTGRES_HOST) {
  pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? "postgres",
    database: process.env.POSTGRES_DATABASE ?? "postgres",
    password: process.env.POSTGRES_PASSWORD,
    ssl: { rejectUnauthorized: false }
  });
} else {
  throw new Error(
    "No database connection configured. Set LOCAL_DATABASE_URL or DATABASE_URL (local), or POSTGRES_HOST + POSTGRES_PASSWORD (RDS)."
  );
}
var db = drizzle(pool, { schema: schema_exports });

// src/config/logger.ts
import path2 from "node:path";
import pino from "pino";

// src/config/index.ts
import dotenv from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
(function loadEnvFile() {
  const candidates = [
    path.join(process.cwd(), ".env"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env")
  ];
  for (const envPath of candidates) {
    if (existsSync(envPath)) {
      dotenv.config({ path: envPath, override: true });
      return;
    }
  }
  dotenv.config();
})();
function envStr(...keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}
var config = {
  // ── Runtime ───────────────────────────────────────────────────────────────
  port: Number(process.env.PORT ?? 8080),
  nodeEnv: process.env.NODE_ENV ?? "development",
  logLevel: process.env.LOG_LEVEL ?? "info",
  // ── File logging + retention ────────────────────────────────────────────
  // Logs are rotated daily to disk and auto-deleted after `retentionDays`
  // by a node-cron job (see src/lib/jobs/logCleanup.ts).
  logging: {
    dir: process.env.LOG_DIR ?? "logs",
    retentionDays: Number(process.env.LOG_RETENTION_DAYS ?? 20)
  },
  // ── App ───────────────────────────────────────────────────────────────────
  // Canonical public URL (e.g. https://accessready.app). Used to build reset
  // links when a request host header is not available or not trusted.
  appUrl: process.env.APP_URL ?? "",
  // ── Database ─────────────────────────────────────────────────────────────
  database: {
    url: process.env.DATABASE_URL ?? ""
  },
  // ── Sessions ─────────────────────────────────────────────────────────────
  session: {
    // Used for signing any server-side session cookies if added in future.
    secret: process.env.SESSION_SECRET ?? "change-me-in-production"
  },
  // ── Google OAuth ─────────────────────────────────────────────────────────
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    // Optional hard-coded redirect URI override; otherwise derived from request.
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? ""
  },
  // ── Anthropic / AI ────────────────────────────────────────────────────────
  anthropic: {
    // Prefer the direct ANTHROPIC_API_KEY (hits api.anthropic.com) when it is
    // present — it is a real secret that always works. Fall back to the Replit
    // AI Integrations proxy only when no direct key is available, because the
    // proxy returns 404 unless the Anthropic integration is explicitly connected
    // in the Replit workspace settings.
    baseUrl: process.env.ANTHROPIC_API_KEY ? "" : process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL ?? "",
    apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ?? "placeholder",
    model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5",
    // Separate model for the cheap vision-description step (Step 1 of object-detect).
    // Defaults to Haiku — it only lists 8 nouns so Sonnet quality is not needed.
    visionModel: process.env.ANTHROPIC_VISION_MODEL ?? "claude-haiku-4-5",
    /**
     * In-process FIFO. Caps concurrent Anthropic calls; extra work waits.
     * Saturated / wait-timeout throw ClaudeCapacityError (503) — never silent drop.
     */
    queue: {
      maxConcurrent: Math.max(1, Number(process.env.CLAUDE_MAX_CONCURRENT ?? 24)),
      maxQueued: Math.max(1, Number(process.env.CLAUDE_MAX_QUEUED ?? 512)),
      /** Must stay under nginx proxy_read_timeout (180s). */
      waitTimeoutMs: Math.max(5e3, Number(process.env.CLAUDE_QUEUE_WAIT_MS ?? 15e4)),
      retryMax: Math.max(1, Number(process.env.CLAUDE_RETRY_MAX ?? 3)),
      retryBaseMs: Math.max(100, Number(process.env.CLAUDE_RETRY_BASE_MS ?? 400))
    }
  },
  // ── Pixabay (free image search for listening image_grid questions) ──────
  pixabay: {
    apiKey: process.env.PIXABAY_API_KEY ?? ""
  },
  // ── Azure Speech (STT/TTS) ───────────────────────────────────────────────
  azureSpeech: {
    key: process.env.AZURE_SPEECH_KEY ?? "",
    region: process.env.AZURE_SPEECH_REGION ?? "",
    // Optional custom endpoint (e.g. https://my-resource.cognitiveservices.azure.com).
    // When set, it overrides the default region-derived TTS and STT base URLs.
    endpoint: process.env.AZURE_SPEECH_ENDPOINT ?? ""
  },
  // ── Email / SMTP ─────────────────────────────────────────────────────────
  email: {
    from: process.env.EMAIL_FROM ?? "ACCESS Ready <noreply@accessready.app>",
    support: process.env.SUPPORT_EMAIL ?? "",
    smtpHost: process.env.SMTP_HOST ?? "",
    smtpPort: Number(process.env.SMTP_PORT ?? 587),
    smtpSecure: process.env.SMTP_SECURE === "true",
    // Set SMTP_TLS_REJECT_UNAUTHORIZED=false for self-signed / corporate certs.
    smtpTlsRejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false",
    smtpUser: process.env.SMTP_USER ?? "",
    smtpPass: process.env.SMTP_PASS ?? ""
    // optional — omit for unauthenticated relay
  },
  // ── Grounding DINO sidecar ──────────────────────────────────────────────
  dino: {
    sidecarUrl: (process.env.DINO_SIDECAR_URL ?? "http://localhost:8000").replace(/\/$/, ""),
    sidecarToken: process.env.DINO_SIDECAR_TOKEN ?? ""
  },
  // ── FLUX.1 Schnell sidecar (local image generation) ─────────────────────
  flux: {
    sidecarUrl: (process.env.FLUX_SIDECAR_URL ?? "http://localhost:8001").replace(/\/$/, ""),
    sidecarToken: process.env.FLUX_SIDECAR_TOKEN ?? ""
  },
  // ── Hugging Face Inference (cloud text-to-image; free tier with HF_TOKEN) ─
  huggingface: {
    inferenceToken: envStr("HF_TOKEN", "HUGGINGFACE_API_TOKEN", "HUGGINGFACE_HUB_TOKEN"),
    /** FLUX Schnell works well on the free Inference Providers quota. */
    imageModel: process.env.HF_IMAGE_MODEL ?? "black-forest-labs/FLUX.1-schnell",
    /** "auto" picks fal-ai for FLUX Schnell; hf-inference is deprecated for many models */
    imageProvider: process.env.HF_IMAGE_PROVIDER ?? "auto",
    defaultWidth: Number(process.env.HF_IMAGE_WIDTH ?? 768),
    defaultHeight: Number(process.env.HF_IMAGE_HEIGHT ?? 512),
    maxSide: Number(process.env.HF_IMAGE_MAX_SIDE ?? 1024),
    inferenceSteps: Number(process.env.HF_IMAGE_STEPS ?? 4),
    /** FLUX Schnell uses 0; SD models typically use 7–8. */
    guidanceScale: Number(process.env.HF_IMAGE_GUIDANCE_SCALE ?? 0)
  },
  // ── Per-student AI rate limit (sessions, scoring, speech, agent) ────────
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED !== "false",
    /** Rolling window length. */
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 6e4),
    /** Max AI/speech calls per student per window. */
    aiMaxPerWindow: Number(process.env.RATE_LIMIT_AI_MAX ?? 30),
    /** memory = one process; postgres = shared (default); redis = set REDIS_URL. */
    store: process.env.RATE_LIMIT_STORE ?? "postgres",
    redisUrl: process.env.REDIS_URL ?? "",
    /** When true, reject requests if the rate-limit store is unavailable. */
    failClosed: process.env.RATE_LIMIT_FAIL_CLOSED === "true" || process.env.NODE_ENV === "production" && process.env.RATE_LIMIT_FAIL_CLOSED !== "false",
    /** Auth endpoints (login, register, password reset) per IP. */
    authMax: Number(process.env.RATE_LIMIT_AUTH_MAX ?? 20),
    authWindowMs: Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS ?? 9e5),
    /** Contact form submissions per IP. */
    contactMax: Number(process.env.RATE_LIMIT_CONTACT_MAX ?? 5),
    contactWindowMs: Number(process.env.RATE_LIMIT_CONTACT_WINDOW_MS ?? 36e5),
    /** DINO / vision scan endpoints per IP (logged-in users + cron bypass via internal key). */
    imageOpsMax: Number(process.env.RATE_LIMIT_IMAGE_OPS_MAX ?? 30),
    imageOpsWindowMs: Number(process.env.RATE_LIMIT_IMAGE_OPS_WINDOW_MS ?? 6e4)
  },
  // ── Internal cron / background jobs ─────────────────────────────────────
  internalJob: {
    /** Shared secret for X-Internal-Job-Key header. Leave empty to disable. */
    apiKey: envStr("INTERNAL_JOB_API_KEY")
  },
  /** In-process Image Factory cron (prompt → HF → DINO → library). */
  imageFactoryCron: {
    enabled: process.env.IMAGE_FACTORY_CRON_ENABLED === "true",
    /** Cron expression — default every 30 minutes. */
    schedule: process.env.IMAGE_FACTORY_CRON_SCHEDULE ?? "*/30 * * * *",
    /** Full pipeline runs per tick. Default 4 = one general image per SF (ela, math, science, social_studies). */
    batchSize: Math.max(1, Number(process.env.IMAGE_FACTORY_CRON_BATCH_SIZE ?? 4)),
    /** Pause between runs in a batch (ms). */
    delayBetweenMs: Math.max(0, Number(process.env.IMAGE_FACTORY_CRON_DELAY_MS ?? 1e4)),
    /** Optional pin: ela | math | science | social_studies */
    subject: envStr("IMAGE_FACTORY_CRON_SUBJECT"),
    /** Optional pin: 1–6 (unset = auto-pick with subject). */
    level: (() => {
      const n = Number(process.env.IMAGE_FACTORY_CRON_LEVEL ?? 0);
      return n >= 1 && n <= 6 ? n : void 0;
    })(),
    /** Run one batch immediately when the server starts. */
    runOnStartup: process.env.IMAGE_FACTORY_CRON_RUN_ON_STARTUP !== "false"
  },
  // ── HTTP security ─────────────────────────────────────────────────────────
  security: {
    /** Comma-separated allowed CORS origins (e.g. https://app.example.com). */
    corsAllowedOrigins: envStr("CORS_ALLOWED_ORIGINS").split(",").map((s) => s.trim()).filter(Boolean)
  }
};

// src/config/logger.ts
var isProduction = config.nodeEnv === "production";
var fileTarget = {
  target: "pino-roll",
  options: {
    file: path2.join(config.logging.dir, "app"),
    frequency: "daily",
    dateFormat: "yyyy-MM-dd",
    extension: ".log",
    mkdir: true
  },
  level: config.logLevel
};
var logger = pino({
  level: config.logLevel,
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']"
  ],
  transport: {
    targets: isProduction ? [fileTarget] : [
      { target: "pino-pretty", options: { colorize: true }, level: config.logLevel },
      fileTarget
    ]
  }
});

// src/lib/rate-limit/usage.ts
var tableReady = null;
function ensureUsageTable() {
  if (!tableReady) {
    tableReady = pool.query(`
        CREATE TABLE IF NOT EXISTS ai_usage_daily (
          student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
          usage_date DATE NOT NULL,
          total_calls INTEGER NOT NULL DEFAULT 0,
          generate_calls INTEGER NOT NULL DEFAULT 0,
          coaching_calls INTEGER NOT NULL DEFAULT 0,
          speech_calls INTEGER NOT NULL DEFAULT 0,
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          total_tokens INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (student_id, usage_date)
        )
      `).then(() => void 0);
  }
  return tableReady;
}
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function incrementDailyTokenUsage(studentId, inputTokens, outputTokens, totalTokens) {
  if (!UUID_RE.test(studentId)) return;
  if (totalTokens <= 0) return;
  void (async () => {
    try {
      await ensureUsageTable();
      await pool.query(
        `INSERT INTO ai_usage_daily
           (student_id, usage_date, total_calls, generate_calls, coaching_calls, speech_calls,
            input_tokens, output_tokens, total_tokens)
         VALUES ($1, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, 0, 0, 0, 0, $2, $3, $4)
         ON CONFLICT (student_id, usage_date) DO UPDATE SET
           input_tokens = ai_usage_daily.input_tokens + $2,
           output_tokens = ai_usage_daily.output_tokens + $3,
           total_tokens = ai_usage_daily.total_tokens + $4`,
        [studentId, inputTokens, outputTokens, totalTokens]
      );
    } catch (err) {
      logger.warn({ err, studentId }, "ai_usage_daily token increment failed");
    }
  })();
}

// src/lib/ai-token-usage.ts
var UUID_RE2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function normalizeTokens(n) {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
function recordAiTokenCall(params) {
  const studentIdRaw = params.studentId?.trim();
  const userIdRaw = params.userId?.trim();
  const studentId = studentIdRaw && UUID_RE2.test(studentIdRaw) ? studentIdRaw : null;
  const userId = userIdRaw && UUID_RE2.test(userIdRaw) ? userIdRaw : null;
  if (!studentId && !userId) return;
  const inputTokens = normalizeTokens(params.inputTokens);
  const outputTokens = normalizeTokens(params.outputTokens);
  const totalTokens = inputTokens + outputTokens;
  if (totalTokens === 0) return;
  const sessionId = params.sessionId?.trim() && UUID_RE2.test(params.sessionId.trim()) ? params.sessionId.trim() : null;
  const imageJobId = params.imageJobId?.trim() && UUID_RE2.test(params.imageJobId.trim()) ? params.imageJobId.trim() : null;
  void (async () => {
    try {
      await db.insert(aiTokenCallsTable).values({
        studentId,
        userId,
        imageJobId,
        sessionId,
        callKind: params.callKind,
        domain: params.domain ?? null,
        model: params.model ?? null,
        inputTokens,
        outputTokens,
        totalTokens
      });
      if (sessionId && studentId) {
        await db.update(sessionsTable).set({
          aiInputTokens: sql`${sessionsTable.aiInputTokens} + ${inputTokens}`,
          aiOutputTokens: sql`${sessionsTable.aiOutputTokens} + ${outputTokens}`,
          aiTotalTokens: sql`${sessionsTable.aiTotalTokens} + ${totalTokens}`,
          aiCallCount: sql`${sessionsTable.aiCallCount} + 1`
        }).where(eq(sessionsTable.id, sessionId));
      }
      if (studentId) {
        incrementDailyTokenUsage(studentId, inputTokens, outputTokens, totalTokens);
      }
    } catch (err) {
      logger.warn(
        { err, studentId, userId, sessionId, callKind: params.callKind },
        "ai_token_calls insert failed"
      );
    }
  })();
}

// src/lib/claude/queue.ts
var ClaudeCapacityError = class extends Error {
  code;
  retryAfterSeconds;
  jobId;
  kind;
  constructor(opts) {
    super(opts.message);
    this.name = "ClaudeCapacityError";
    this.code = opts.code;
    this.retryAfterSeconds = opts.retryAfterSeconds;
    this.jobId = opts.jobId ?? null;
    this.kind = opts.kind;
  }
};
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function anthropicHttpStatus(err) {
  if (!err || typeof err !== "object") return void 0;
  const o = err;
  if (typeof o.status === "number") return o.status;
  if (typeof o.statusCode === "number") return o.statusCode;
  return void 0;
}
function retryAfterMs(err, fallbackMs) {
  if (!err || typeof err !== "object") return fallbackMs;
  const headers = err.headers;
  let raw;
  if (headers && typeof headers === "object") {
    const h = headers;
    raw = h.get?.("retry-after") ?? h["retry-after"] ?? h["Retry-After"];
  }
  if (!raw) return fallbackMs;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(3e4, seconds * 1e3);
  return fallbackMs;
}
function isRetryableClaudeError(err) {
  const status = anthropicHttpStatus(err);
  if (status === 429 || status === 529 || status === 503 || status === 502) return true;
  if (err && typeof err === "object") {
    const name = err.name;
    const code = err.code;
    if (name === "APIConnectionError" || code === "ECONNRESET" || code === "ETIMEDOUT") return true;
  }
  return false;
}
var ClaudeRequestQueue = class {
  waiting = [];
  inFlight = 0;
  seq = 0;
  snapshot() {
    const q = config.anthropic.queue;
    return {
      inFlight: this.inFlight,
      waiting: this.waiting.length,
      maxConcurrent: q.maxConcurrent,
      maxQueued: q.maxQueued,
      waitTimeoutMs: q.waitTimeoutMs
    };
  }
  enqueue(kind, run) {
    const q = config.anthropic.queue;
    const snap = this.snapshot();
    if (this.waiting.length >= q.maxQueued) {
      logger.error(
        {
          stage: "claude-queue",
          code: "QUEUE_SATURATED",
          kind,
          ...snap
        },
        "Claude queue saturated \u2014 request rejected (not dropped silently)"
      );
      return Promise.reject(
        new ClaudeCapacityError({
          code: "QUEUE_SATURATED",
          kind,
          retryAfterSeconds: Math.max(2, Math.ceil(q.waitTimeoutMs / 4e3)),
          message: "Practice AI is at capacity. Try again in a few seconds."
        })
      );
    }
    return new Promise((resolve, reject) => {
      this.seq += 1;
      const id = `cq-${this.seq}`;
      const job = {
        id,
        kind,
        enqueuedAt: Date.now(),
        run,
        resolve,
        reject,
        waitTimer: setTimeout(() => {
          const idx = this.waiting.indexOf(job);
          if (idx < 0) return;
          this.waiting.splice(idx, 1);
          logger.error(
            {
              stage: "claude-queue",
              code: "QUEUE_WAIT_TIMEOUT",
              jobId: id,
              kind,
              waitedMs: Date.now() - job.enqueuedAt,
              ...this.snapshot()
            },
            "Claude queue wait timed out \u2014 request rejected (not dropped silently)"
          );
          reject(
            new ClaudeCapacityError({
              code: "QUEUE_WAIT_TIMEOUT",
              kind,
              jobId: id,
              retryAfterSeconds: 5,
              message: "Practice AI is busy. Wait a moment and try again."
            })
          );
        }, q.waitTimeoutMs)
      };
      this.waiting.push(job);
      logger.info(
        {
          stage: "claude-queue",
          event: "enqueue",
          jobId: id,
          kind,
          waitMsBudget: q.waitTimeoutMs,
          ...this.snapshot()
        },
        "Claude queue enqueue"
      );
      this.pump();
    });
  }
  pump() {
    const max = config.anthropic.queue.maxConcurrent;
    while (this.inFlight < max && this.waiting.length > 0) {
      const job = this.waiting.shift();
      if (!job) return;
      clearTimeout(job.waitTimer);
      this.inFlight += 1;
      logger.info(
        {
          stage: "claude-queue",
          event: "start",
          jobId: job.id,
          kind: job.kind,
          queuedMs: Date.now() - job.enqueuedAt,
          ...this.snapshot()
        },
        "Claude queue start"
      );
      void this.execute(job);
    }
  }
  async execute(job) {
    const started = Date.now();
    try {
      const { result, attempts } = await this.runWithRetry(job);
      logger.info(
        {
          stage: "claude-queue",
          event: "complete",
          jobId: job.id,
          kind: job.kind,
          attempts,
          queuedMs: started - job.enqueuedAt,
          callMs: Date.now() - started,
          ...this.snapshot()
        },
        "Claude queue complete"
      );
      job.resolve(result);
    } catch (err) {
      logger.error(
        {
          err,
          stage: "claude-queue",
          event: "failed",
          jobId: job.id,
          kind: job.kind,
          queuedMs: started - job.enqueuedAt,
          callMs: Date.now() - started,
          httpStatus: anthropicHttpStatus(err) ?? null,
          ...this.snapshot()
        },
        "Claude queue job failed"
      );
      job.reject(err);
    } finally {
      this.inFlight = Math.max(0, this.inFlight - 1);
      this.pump();
    }
  }
  async runWithRetry(job) {
    const retryMax = config.anthropic.queue.retryMax;
    const baseMs = config.anthropic.queue.retryBaseMs;
    let lastErr;
    for (let attempt = 1; attempt <= retryMax; attempt++) {
      try {
        const result = await job.run();
        return { result, attempts: attempt };
      } catch (err) {
        lastErr = err;
        const status = anthropicHttpStatus(err);
        const retryable = isRetryableClaudeError(err) && attempt < retryMax;
        if (!retryable) {
          if (isRetryableClaudeError(err)) {
            throw new ClaudeCapacityError({
              code: "CLAUDE_RETRY_EXHAUSTED",
              kind: job.kind,
              jobId: job.id,
              retryAfterSeconds: Math.max(2, Math.ceil(retryAfterMs(err, baseMs * 4) / 1e3)),
              message: "Practice AI is busy. Wait a moment and try again."
            });
          }
          throw err;
        }
        const backoff = retryAfterMs(err, baseMs * 2 ** (attempt - 1));
        const jitter = Math.floor(Math.random() * 200);
        const waitMs = Math.min(2e4, backoff + jitter);
        logger.warn(
          {
            stage: "claude-queue",
            event: "retry",
            jobId: job.id,
            kind: job.kind,
            attempt,
            retryMax,
            httpStatus: status ?? null,
            backoffMs: waitMs
          },
          "Claude retry after overload or connection error"
        );
        await sleep(waitMs);
      }
    }
    throw lastErr;
  }
};
var queue = new ClaudeRequestQueue();
function runClaudeJob(kind, run) {
  return queue.enqueue(kind, run);
}

// src/lib/claude/client.ts
var _client = null;
function getClient() {
  if (!_client) {
    const { baseUrl, apiKey } = config.anthropic;
    _client = new Anthropic({
      apiKey,
      ...baseUrl ? { baseURL: baseUrl } : {}
    });
  }
  return _client;
}
var BASE_PROMPT = `Scale 1.0\u20136.0. Each level has 5 sub-steps (0\u20134); complexity_instruction governs vocabulary and scaffolding at each sub-step.
Return ONLY valid JSON. No preamble, no markdown, no code fences.

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
VISUAL RULES
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
Do not invent photos, charts, maps, graphs, or scenes.
Do not say "look at the picture/diagram" unless a library photo is already on screen
(has_library_image = true) or you also supplied a short keyboard-mark visual.
Optional exception: a few keyboard marks (counts, plus/equals, simple outlines)
may be placed in visual / option_diagrams when they make the item easier.
If words are enough, omit marks. Spoken audio must still stay free of "as you can see".
If a topic is visual and you cannot mark it simply, describe it in prose.`.trim();
var PASSAGE_SENTENCE_TARGETS = {
  1: "1\u20133 very short sentences (~12\u201335 words). One idea each. Common words only. No extra background.",
  2: "1\u20133 short sentences (~18\u201345 words). Simple sentences. Do not write a paragraph.",
  3: "3\u20134 sentences (~80\u2013120 words): one short, focused paragraph. Simple, familiar vocabulary.",
  4: "5\u20137 sentences (~130\u2013180 words): one developed paragraph with a clear main idea. Moderate Tier-2 vocabulary.",
  5: "8\u201310 sentences (~200\u2013260 words): an extended paragraph or two short paragraphs. Higher-register academic vocabulary, some inference required.",
  6: "11\u201314 sentences (~300\u2013400 words): two or more developed paragraphs with supporting detail, nuanced vocabulary, and complex sentence structures."
};
var LEVEL_QUESTION_COUNT = { 1: 2, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };
var LEVEL_MAX_TOKENS = { 1: 1200, 2: 1200, 3: 1500, 4: 2e3, 5: 2500, 6: 3e3 };
function academicSessionScale(level) {
  const clampedLevel = Math.min(Math.max(Math.floor(level), 1), 6);
  return {
    clampedLevel,
    questionCount: LEVEL_QUESTION_COUNT[clampedLevel] ?? 2,
    passageSentenceTarget: PASSAGE_SENTENCE_TARGETS[clampedLevel] ?? PASSAGE_SENTENCE_TARGETS[1],
    maxTokens: LEVEL_MAX_TOKENS[clampedLevel] ?? 1200
  };
}
function toDisplayText(value) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "object") {
    const obj = value;
    const candidate = obj.text ?? obj.prompt ?? obj.content ?? obj.description;
    if (typeof candidate === "string") return candidate;
    const stringValues = Object.values(obj).filter((v) => typeof v === "string");
    if (stringValues.length > 0) return stringValues.join(" ");
  }
  return String(value);
}
async function callClaude(systemPrompt, userPrompt, maxTokens = 1200) {
  const claude = getClient();
  try {
    const response = await runClaudeJob(
      "messages.json",
      () => claude.messages.create({
        model: config.anthropic.model,
        max_tokens: maxTokens,
        temperature: 0.7,
        // Plain string: some live proxies reject cache_control on short L1–2 prompts.
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }]
      })
    );
    const usage = response.usage;
    const tokenCtx = getAiTokenContext();
    if ((tokenCtx?.studentId || tokenCtx?.userId) && usage) {
      recordAiTokenCall({
        studentId: tokenCtx.studentId,
        userId: tokenCtx.userId,
        imageJobId: tokenCtx.imageJobId,
        sessionId: tokenCtx.sessionId,
        callKind: tokenCtx.callKind ?? "other",
        domain: tokenCtx.domain,
        model: response.model,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens
      });
    }
    const text26 = response.content[0].type === "text" ? response.content[0].text : "";
    let cleaned = text26.replace(/^```(?:json)?\n?/i, "").replace(/\n?```\s*$/, "").trim();
    const fixJson = (s) => s.replace(/,\s*([}\]])/g, "$1").replace(/[\x00-\x1F\x7F]/g, (c) => c === "\n" || c === "	" ? c : " ").replace(/"\s*\n\s*"/g, '", "').replace(/([}\]"])\s*\n\s*([{\["])/g, "$1,$2").replace(/:\s*'([^']*)'/g, ': "$1"');
    try {
      return JSON.parse(fixJson(cleaned));
    } catch {
      const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (jsonMatch) {
        try {
          return JSON.parse(fixJson(jsonMatch[1]));
        } catch {
          const deepCleaned = jsonMatch[1].replace(/\\n/g, " ").replace(/\n/g, " ").replace(/\t/g, " ").replace(/,\s*([}\]])/g, "$1").replace(/([}\]"])\s+([{\["])/g, "$1,$2");
          return JSON.parse(deepCleaned);
        }
      }
      throw new Error("Could not parse Claude response as JSON");
    }
  } catch (err) {
    logger.error({ err }, "Claude API error");
    throw err;
  }
}

// src/lib/claude/prompts/optional-line-visuals.ts
var OPTIONAL_LINE_VISUALS_BLOCK = `\u2501\u2501 OPTIONAL LINE VISUALS \u2501\u2501
When has_library_image is false and a few keyboard marks would help (especially L1\u20132), you MAY add:
  visual          \u2192 one short mark string for the item stem
  option_diagrams \u2192 array same length as options; string or null per choice
Allowed: stroke counts, plus/equals, simple 2D outlines named in text.
Never: photos, people, scenes, or diagrams harder than the words.`.trim();
function parseVisual(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function parseOptionDiagrams(value) {
  return Array.isArray(value) ? value : void 0;
}

// src/lib/claude/prompts/compose.ts
function buildSystemPrompt(...blocks) {
  return blocks.map((b) => b.trim()).filter(Boolean).join("\n\n");
}
function blockIf(condition, block) {
  return condition ? block : "";
}

// src/lib/claude/prompts/content/library-photo-policy.ts
var LIBRARY_PHOTO_NO_LOOK = "When has_library_image is false: never say look / picture / photo / what you see / in this image.";
var LIBRARY_PHOTO_CORE = `
LIBRARY PHOTO (when has_library_image or selected_image_id is set)
\u2022 image_tags, image_concept, and image_description are planning metadata \u2014 ground composed text in 1\u20133 tag objects; do NOT list the scene like a caption.
\u2022 Write a connected mini-story or subject passage that USES tag objects as characters, setting, or evidence.
\u2022 Tasks must be answerable from composed text (heard or read), not from viewing the photo alone.
\u2022 Do not invent objects absent from image_tags. Do not copy image_description verbatim.
\u2022 Never say look / picture / photo / in this image / what you see.
`.trim();
var ONE_PHOTO_L12_HEADER = `
ONE PHOTO (levels 1\u20132): one library photograph on screen when has_library_image is true.
Compare = two tag objects in the text, not two image files.
${LIBRARY_PHOTO_NO_LOOK}
`.trim();

// src/lib/claude/prompts/content/writing-image-passage.ts
var WRITING_IMAGE_PASSAGE_RULES = `
IMAGE-CONNECTED PASSAGE (when selected_image_id is set)
\u2022 Pick selected_image_id FIRST from library_candidates.
${LIBRARY_PHOTO_CORE.split("\n").slice(1).join("\n")}
\u2022 The writing prompt must logically follow the passage.
`.trim();
var LIBRARY_IMAGE_READING_EXTRA = `
READING: passage is what the student reads; questions from THIS passage only \u2014 not picture-only answers.
`.trim();
var LIBRARY_IMAGE_LISTENING_EXTRA = `
LISTENING: audio_script uses the same story rules; questions from heard text only \u2014 not picture-only answers.
`.trim();
var LIBRARY_IMAGE_SPEAKING_EXTRA = `
SPEAKING: photo is visual support; student responds to the oral language task, not a "what do you see" scene description.
`.trim();
var LIBRARY_IMAGE_READING_PASSAGE_RULES = `${LIBRARY_PHOTO_CORE}
${LIBRARY_IMAGE_READING_EXTRA}`;
var LIBRARY_IMAGE_LISTENING_PASSAGE_RULES = `${LIBRARY_PHOTO_CORE}
${LIBRARY_IMAGE_LISTENING_EXTRA}`;
var LIBRARY_IMAGE_SPEAKING_PASSAGE_RULES = `${LIBRARY_PHOTO_CORE}
${LIBRARY_IMAGE_SPEAKING_EXTRA}`;
function buildWritingPassageSentenceTarget(level, keyUse) {
  const lv = Math.max(1, Math.min(6, Math.floor(level)));
  const baseByLevel = {
    1: "2\u20133 very short sentences (~25\u201345 words). Simple present. One clear who / where / what.",
    2: "3\u20134 short sentences (~45\u201365 words). Mini-story or fact sequence (first, then, last).",
    3: "4\u20135 sentences (~65\u201385 words). One compare, cause, or explain relationship.",
    4: "5\u20136 sentences (~85\u2013105 words). More detail; use because / but / also connectors.",
    5: "6\u20137 sentences (~105\u2013125 words). Informational tone; subject vocabulary allowed.",
    6: "6\u20138 sentences (~120\u2013140 words). Dense academic context the student writes from."
  };
  const kuNote = {
    Narrate: "Shape: short event or story using tag objects as who/where/what happened.",
    Inform: "Shape: factual report of what is in the scene \u2014 names and properties, not a writing task.",
    Explain: "Shape: function, process, or why/how the tag objects matter in this setting.",
    Argue: "Shape: two visible ideas or sides grounded in tags; the prompt will ask for a position."
  };
  const ku = kuNote[keyUse] ?? "Ground every sentence in the selected candidate tags, concept, and description.";
  return `${baseByLevel[lv] ?? baseByLevel[6]} ${ku}`;
}

// src/lib/content/writingLibraryCandidates.ts
import { and as and2, asc, eq as eq2, or, sql as sql2, notInArray } from "drizzle-orm";

// src/lib/claude/prompts/base.ts
var BASE_BLOCK = `WIDA SCALE: 1.0\u20136.0. Each integer level has 5 sub-steps (0\u20134).
complexity_instruction governs vocabulary ceiling, sentence complexity, and scaffolding at each sub-step \u2014 follow it exactly.
OUTPUT RULE: Return ONLY valid JSON. No preamble, no markdown, no code fences.`.trim();

// src/lib/claude/prompts/listening-core.ts
var LISTENING_CORE_BLOCK = `\u2501\u2501 WIDA ACADEMIC LISTENING \u2501\u2501

Grade 6\u20138 ELLs. Student LISTENS to a passage then answers comprehension questions. All content self-contained \u2014 no prior subject knowledge required.

SCAFFOLDING
\u2022 last_session_score \u2265 70 or null \u2192 standard difficulty
\u2022 last_session_score < 70 \u2192 define key terms in-passage, shorter sentences, stronger transitions; do NOT simplify the academic concept itself, only how it is presented
\u2022 is_retry \u2192 change speaker name, setting, or specific example; keep same unit

PASSAGE RULES
\u2022 audio_script: plain spoken English in oral_format register. No SSML, symbols, formulas, or visual references ("as you can see\u2026").
\u2022 oral_format and passage_sentence_target are hard limits \u2014 follow precisely.
\u2022 Define opaque vocabulary within the sentence it appears.

QUESTION RULES
\u2022 Test LISTENING COMPREHENSION only \u2014 answerable from the passage alone, no prior knowledge.
\u2022 Exactly question_count questions. Each selected-response item has exactly 3 options (1 correct + 2 distractors).
\u2022 Wrong options: plausible but passage-contradicted misreadings (swapped quantities, confused terms, conclusions the passage doesn't support).
\u2022 explanation: max 8 words.`.trim();

// src/lib/claude/prompts/grammar-correction-rules.ts
var LANGUAGE_FORMS_ACCURACY_FOR_CONTENT = `
LANGUAGE FORMS \u2014 ACCURACY IN GENERATED ENGLISH
Every English string you output (prompt, passage, sentence_frame, word_bank) must be grammatically correct for Grade 6\u20138 academic practice at this pld.

Follow standard grammar:
\u2022 Verbs \u2014 correct tense for the time frame; subject\u2013verb agreement (he/she/it + -s where needed).
\u2022 Pronouns \u2014 clear antecedent; it for things, they for plurals; do not switch he/it for the same noun.
\u2022 Articles and prepositions \u2014 a/an/the and common prepositions (in, on, at, to) used naturally.
\u2022 Spelling \u2014 tier-3 and academic_subject terms spelled correctly; American English unless stated otherwise.
\u2022 Sentences \u2014 complete sentences in passage and frames; match pld length (fragments only when pld is word/phrase level).

Never embed intentional grammar or spelling errors in scaffolds \u2014 students should see correct models.
Self-check before returning JSON: read prompt, passage, and sentence_frame; fix any slip.
`.trim();
var LANGUAGE_FORMS_CORRECTION_COACHING = `
LANGUAGE FORMS \u2014 CORRECT GRAMMAR, VERBS, PRONOUNS, SPELLING
Students must use grammatically correct English for this level. A clear teachable slip means NOT YET even when the idea is right \u2014 they must correct it before passing.

Teachable slips (coach one gap per try):
\u2022 Verb tense or form (go/went, is/are, missing -s on he/she/it)
\u2022 Subject\u2013verb agreement
\u2022 Pronoun errors (he/she/it/they; wrong it for a person, wrong they for one thing)
\u2022 Articles or prepositions (a/an/the; in/on/at)
\u2022 Word order that breaks meaning
\u2022 Spelling of a key word from the prompt, word bank, or passage (not STT noise on speaking)

Do not treat accent or dialect as an error. At higher levels, ignore one minor typo if meaning is clear; at levels 1\u20132, coach spelling of key academic words.

When NOT YET for a language slip, coaching MUST instruct correction without giving a paste-ready answer:
1. What is wrong \u2014 point to their word or pattern.
2. Why it is wrong \u2014 one simple reason they can learn (not a grammar-class label dump).
3. Revision hint \u2014 one short fix target only (e.g. "Use it for the cell" / "Change went to go" / "Add one sentence about why"). Do NOT write full sentences, paragraphs, or a complete answer they could copy.

WRITING \u2014 never use "You can write:", "Try writing:", "Example response:", or model_response text. model_response must be "".
SPEAKING \u2014 you may give a brief corrected phrase to say aloud (not a full paragraph).

One gap only. Do not add a new topic or a second grammar lesson.
On writing retry: PASS only if they fixed the coached gap in their own words \u2014 not if they pasted or lightly edited coaching text.
`.trim();

// src/lib/claude/prompts/content/kernel.ts
var CONTENT_KERNEL = `
You generate WIDA ACCESS practice content for Grade 6\u20138 English learners.
WIDA scale 1.0\u20136.0 with sub-steps 0\u20134. This call is ONE domain and ONE band only.
Obey user JSON framework for the language job; calibrate English hardness to framework.pld and complexity_instruction only.
Return ONLY valid JSON \u2014 no preamble, markdown, or code fences.
If prior_practice_report is present, use it as a helper on weaknesses only; never override framework level, key language use, functions, or PLD.
`.trim();

// src/lib/claude/prompts/content/router.ts
function contentBand(level) {
  return level <= 2 ? "1_2" : "3_6";
}

// src/lib/claude/prompts/subjects/math.ts
var MATH_SUBJECT_BLOCK = `\u2501\u2501 SUBJECT: Mathematics (CCSS Grades 6\u20138) \u2501\u2501

Align to content_framework "CCSS-Math", domain_code, and content_standards in user JSON.

PASSAGE FORMAT \u2014 Word Problem Read Aloud
A teacher reads a real-world word problem aloud. Must:
\u2022 Include specific numbers (quantities, prices, distances, times, measurements)
\u2022 Describe a clear mathematical situation with one or two quantities or relationships
\u2022 NOT ask the student to compute \u2014 set up the situation only
\u2022 Begin naturally: "Listen carefully. Maria has\u2026" / "A store sells\u2026"
\u2022 Use tier3_vocabulary naturally, defining technical terms inline: "The unit rate, which tells us the cost per one item, is\u2026"
\u2022 is_retry: change names, numbers, or setting; keep the same math_unit

Choose question types from available_question_formats in user JSON \u2014 pick what best assesses framework.language_functions for this math situation.

WHAT QUESTIONS MUST TEST (math language comprehension \u2014 never computation)
  \u2713 "How much does one pound of apples cost?" \u2014 given information
  \u2713 "What does the problem ask Maria to find?" \u2014 the mathematical goal
  \u2717 NEVER: "What is the total cost?" / "What is 12 \xD7 3?" \u2014 computation, not comprehension`.trim();
var MATH_OUTPUT_SCHEMA = `OUTPUT
{
  "can_do_descriptor": "<action + one Can Do item that best fits this math problem>",
  "audio_script": "<word problem read aloud by teacher \u2014 plain spoken English, no symbols>",
  "topic": "<echo input topic>",
  "context": "Teacher reading a word problem aloud to the class",
  "format": "<primary question format used>",
  "questions": [
    {
      "id": "1",
      "type": "<multiple_choice|sequence_ordering|pair_matching>",
      "question": "<tests comprehension of math language \u2014 no computation>",
      "options": ["A", "B", "C"],
      "correct": 0,
      "explanation": "<max 8 words>"
    }
  ]
}`.trim();

// src/lib/claude/prompts/subjects/science.ts
var SCIENCE_SUBJECT_BLOCK = `\u2501\u2501 SUBJECT: Science (NGSS MS-LS, MS-PS, MS-ESS, MS-ETS) \u2501\u2501

Align to content_framework "NGSS", performance expectations in content_standards, and science_practices / crosscutting_concepts when present.

PASSAGE FORMAT \u2014 Teacher or Scientist Narration
A teacher or scientist narrates a phenomenon, process, or discovery to the class. Must:
\u2022 Describe a real phenomenon using tier3_vocabulary, with analogies to make it concrete:
  "Think of the cell membrane like a security guard \u2014 it decides what gets in and out."
\u2022 NOT require prior science knowledge \u2014 the passage teaches the concept
\u2022 Begin clearly: "Today we're going to look at\u2026" / "Imagine you're watching a volcano\u2026"
\u2022 Define technical terms inline: "mitosis, which is the process where one cell splits into two\u2026"
\u2022 is_retry: use a different analogy, species, or example; same science_unit and concept

Choose question types from available_question_formats \u2014 pick what best assesses framework.language_functions for this science narration.

WHAT QUESTIONS MUST TEST (scientific language comprehension \u2014 never memorized facts)
  \u2713 "According to the teacher, why do tectonic plates move?" \u2014 what the narration explains
  \u2713 "What does the teacher say happens when two plates collide?" \u2014 cause and effect from narration
  \u2717 NEVER: "What is photosynthesis?" / "Name three types of rocks." \u2014 answerable without listening`.trim();
var SCIENCE_OUTPUT_SCHEMA = `OUTPUT
{
  "can_do_descriptor": "<action + one Can Do item that fits this science narration>",
  "audio_script": "<teacher/scientist narration \u2014 plain spoken English, no visual references>",
  "topic": "<echo input topic>",
  "context": "Teacher explaining a science concept to the class",
  "format": "<primary question format used>",
  "questions": [
    {
      "id": "1",
      "type": "<multiple_choice|sequence_ordering|pair_matching|agree_disagree>",
      "question": "<tests comprehension of scientific language \u2014 no memorized-fact recall>",
      "options": ["A", "B", "C"],
      "correct": 0,
      "explanation": "<max 8 words>"
    }
  ]
}`.trim();

// src/lib/claude/prompts/subjects/social-studies.ts
var SOCIAL_STUDIES_SUBJECT_BLOCK = `\u2501\u2501 SUBJECT: Social Studies (C3 Framework \u2014 History, Geography, Civics, Economics) \u2501\u2501

Align to content_framework "C3", D2 indicators in content_standards, and c3_inquiry_dimensions when present.

PASSAGE FORMAT \u2014 Teacher or Historian Narration
A teacher or historian narrates an event, concept, or system. Must:
\u2022 Tell a clear story with specific names, dates, places, and amounts
\u2022 NOT assume prior knowledge \u2014 the passage provides all context
\u2022 Begin clearly: "Today we're going to look at\u2026" / "Imagine you are living in 1776\u2026"
\u2022 Define technical terms inline: "feudalism, a system where peasants worked the lord's land in exchange for protection\u2026"
\u2022 Speak dates aloud: "seventeen seventy-six" not "1776"
\u2022 is_retry: use a different angle, person, or specific example within the same ss_unit

Choose question types from available_question_formats \u2014 pick what best assesses framework.language_functions for this narration.

WHAT QUESTIONS MUST TEST (historical/civic language comprehension \u2014 never memorized facts)
  \u2713 "According to the teacher, why were colonists angry about the Stamp Act?" \u2014 cause from narration
  \u2713 "What does 'taxation without representation' mean in this passage?" \u2014 term in context
  \u2717 NEVER: "Who was the first president?" / "What year did WWII end?" \u2014 answerable without listening`.trim();
var SOCIAL_STUDIES_OUTPUT_SCHEMA = `OUTPUT
{
  "can_do_descriptor": "<action + one Can Do item that fits this social studies narration>",
  "audio_script": "<teacher/historian narration \u2014 plain spoken English>",
  "topic": "<echo input topic>",
  "context": "Teacher narrating a historical event or social studies concept to the class",
  "format": "<primary question format used>",
  "questions": [
    {
      "id": "1",
      "type": "<multiple_choice|sequence_ordering|pair_matching|agree_disagree>",
      "question": "<tests comprehension of historical/civic language \u2014 no memorized-fact recall>",
      "options": ["A", "B", "C"],
      "correct": 0,
      "explanation": "<max 8 words>"
    }
  ]
}`.trim();

// src/lib/claude/prompts/subjects/ela.ts
var ELA_SUBJECT_BLOCK = `\u2501\u2501 SUBJECT: English Language Arts (CCSS RL, RI, W, L, SL Grades 6\u20138) \u2501\u2501

Align to content_framework "CCSS-ELA", domain_code (RL/RI/W/L/SL), and content_standards in user JSON.

PASSAGE FORMAT \u2014 Text Read Aloud
A teacher reads a short literary or informational text aloud. Genre depends on ela_genre:
  narrative      \u2192 short story excerpt or personal narrative (character, conflict, setting, resolution)
  informational  \u2192 explanatory text (main idea, supporting details, text structure)
  argument       \u2192 opinion text (claim, evidence, counterclaim)
  author_craft   \u2192 excerpt with notable craft choices (figurative language, tone, point of view, word choice)

Must:
\u2022 Be polished read-aloud prose \u2014 NOT a writing prompt or instructions
\u2022 Use tier3_vocabulary naturally, defining literary terms inline:
  "The author uses a simile \u2014 a comparison using 'like' or 'as' \u2014 when she writes 'the thunder rolled like a freight train.'"
\u2022 Provide enough context for questions about literary elements, text structure, or the author's choices
\u2022 is_retry: different character, topic, or setting; same ela_unit and literary focus

Choose question types from available_question_formats \u2014 pick what best assesses framework.language_functions for this read-aloud text.

WHAT QUESTIONS MUST TEST (textual/literary comprehension \u2014 never prior knowledge)
  \u2713 "According to the passage, what is the main problem the character faces?" \u2014 narrative comprehension
  \u2713 "What does the author compare the storm to in this passage?" \u2014 figurative language in text
  \u2717 NEVER: "Define metaphor." / "What is a protagonist?" \u2014 answerable without listening`.trim();
var ELA_OUTPUT_SCHEMA = `OUTPUT
{
  "can_do_descriptor": "<action + one Can Do item that fits this ELA passage>",
  "audio_script": "<literary or informational text read aloud \u2014 polished prose>",
  "topic": "<echo input topic>",
  "context": "<one sentence: who reads this aloud and to whom>",
  "format": "<primary question format used>",
  "questions": [
    {
      "id": "1",
      "type": "<multiple_choice|sequence_ordering|pair_matching|agree_disagree>",
      "question": "<tests literary/textual comprehension \u2014 no prior knowledge required>",
      "options": ["A", "B", "C"],
      "correct": 0,
      "explanation": "<max 8 words>"
    }
  ]
}`.trim();

// src/lib/content/writingLibraryCandidates.ts
var TOPIC_STOP_WORDS = /* @__PURE__ */ new Set([
  "this",
  "that",
  "with",
  "from",
  "about",
  "show",
  "shows",
  "what",
  "does",
  "have",
  "into",
  "and",
  "the",
  "for",
  "are",
  "your",
  "their",
  "them"
]);
var LIBRARY_COLS = {
  id: libraryTable.id,
  tags: libraryTable.tags,
  s3Key: libraryTable.s3Key,
  description: libraryTable.description,
  imageConcept: libraryTable.imageConcept,
  detectionResults: libraryTable.detectionResults,
  contexts: libraryTable.contexts,
  academicVision: libraryTable.academicVision,
  useCount: libraryTable.useCount
};
function topicSearchTerms(topic) {
  return topic.replace(/[\[\]]/g, " ").split(/[^a-zA-Z0-9]+/).map((w) => w.toLowerCase()).filter((w) => w.length >= 4 && !TOPIC_STOP_WORDS.has(w));
}
function scoreLibraryCandidateForTerms(candidate, terms) {
  const haystack = [
    candidate.imageConcept ?? "",
    candidate.description ?? "",
    ...candidate.tags
  ].join(" ").toLowerCase();
  let score = (3 - TIER_RANK[candidate.matchTier]) * 5;
  for (const term of terms) {
    const t = term.toLowerCase();
    if (t.length < 3) continue;
    if (haystack.includes(t)) score += 12;
  }
  return score;
}
function curriculumSearchTerms(curriculum) {
  return [
    ...topicSearchTerms(curriculum.unit ?? ""),
    ...topicSearchTerms(curriculum.topicLabel ?? ""),
    ...(curriculum.tier3Vocabulary ?? []).map((v) => v.toLowerCase().trim()),
    ...topicSearchTerms(curriculum.scenarioExamples?.[0] ?? "")
  ].filter((t, i, arr) => arr.indexOf(t) === i);
}
function imageSearchTerms(candidate) {
  return [
    ...topicSearchTerms(candidate.imageConcept ?? ""),
    ...topicSearchTerms(candidate.description ?? ""),
    ...candidate.tags.map((t) => t.toLowerCase().trim())
  ].filter((t, i, arr) => arr.indexOf(t) === i && t.length >= 3);
}
function prepareLibraryComposeSession(candidates, curriculum, limit = 3) {
  if (candidates.length === 0) {
    return {
      candidates: [],
      mode: "image_led",
      lockedImageId: null,
      suppressCurriculumScenarios: true
    };
  }
  const terms = curriculumSearchTerms(curriculum);
  const ranked = [...candidates].sort(
    (a, b) => scoreLibraryCandidateForTerms(b, terms) - scoreLibraryCandidateForTerms(a, terms)
  );
  const topScore = scoreLibraryCandidateForTerms(ranked[0], terms);
  if (topScore >= 12) {
    const minScore = Math.max(12, topScore - 6);
    const filtered = ranked.filter((c) => scoreLibraryCandidateForTerms(c, terms) >= minScore).slice(0, limit);
    return {
      candidates: filtered.length > 0 ? filtered : [ranked[0]],
      mode: "curriculum_matched",
      lockedImageId: filtered.length === 1 ? filtered[0].id : null,
      suppressCurriculumScenarios: false
    };
  }
  return {
    candidates: [ranked[0]],
    mode: "image_led",
    lockedImageId: ranked[0].id,
    suppressCurriculumScenarios: true
  };
}
function detectLibraryContentMismatch(candidate, text26, curriculum) {
  const audio = text26.toLowerCase();
  const curriculumTerms = curriculumSearchTerms(curriculum);
  const imageTerms = imageSearchTerms(candidate);
  const curriculumHits = curriculumTerms.filter(
    (t) => t.length >= 4 && audio.includes(t)
  ).length;
  const imageHits = imageTerms.filter(
    (t) => t.length >= 4 && audio.includes(t)
  ).length;
  if (imageHits >= 1) return false;
  if (curriculumHits >= 2 && imageHits === 0) return true;
  const strongCurriculum = (curriculum.tier3Vocabulary ?? []).filter(
    (t) => t.length >= 5 && audio.includes(t.toLowerCase())
  ).length;
  return strongCurriculum >= 2 && imageHits === 0;
}
function pickBestLibraryCandidateForCurriculum(candidates, params) {
  if (candidates.length === 0) return null;
  const terms = [
    ...topicSearchTerms(params.unit ?? ""),
    ...topicSearchTerms(params.topicLabel ?? ""),
    ...params.tier3Vocabulary ?? [],
    ...topicSearchTerms(params.scenarioExamples?.[0] ?? "")
  ].filter((t, i, arr) => arr.indexOf(t) === i);
  if (terms.length === 0) return candidates[0] ?? null;
  return [...candidates].sort(
    (a, b) => scoreLibraryCandidateForTerms(b, terms) - scoreLibraryCandidateForTerms(a, terms)
  )[0] ?? null;
}
var TIER_RANK = {
  topic_link: 0,
  topic_meta: 1,
  subject_tags: 2,
  recycle: 3
};
function serializeWritingLibraryCandidatesForPrompt(candidates) {
  return candidates.map((c) => ({
    id: c.id,
    tags: c.tags,
    concept: c.imageConcept,
    description: c.description,
    match_tier: c.matchTier
  }));
}
function resolveWritingLibrarySelection(selectedId, candidates) {
  if (!selectedId) return null;
  return candidates.find((c) => c.id === selectedId) ?? null;
}
function sessionUsesLibraryPhotos(level) {
  return Math.floor(level) <= 2;
}
function isEarlyBand(level) {
  return sessionUsesLibraryPhotos(level);
}
function resolveWritingLibrarySelectionWithPolicy(selectedId, candidates, level, curriculum) {
  if (candidates.length === 0) return null;
  const picked = resolveWritingLibrarySelection(selectedId, candidates);
  if (picked) return picked;
  if (isEarlyBand(level)) {
    return pickBestLibraryCandidateForCurriculum(candidates, curriculum ?? {}) ?? candidates[0] ?? null;
  }
  return null;
}

// src/lib/claude/prompts/academic-image-anchor.ts
var ACADEMIC_IMAGE_ANCHOR_EXAMPLES = `\u2501\u2501 IMAGE ANCHOR EXAMPLES (by academic_subject) \u2501\u2501
  math:           countable objects \u2192 word-problem setting
  science:        natural objects \u2192 phenomenon narration
  social_studies: built environment / cultural objects \u2192 historical anchor
  ela:            scene as story setting or informational/argument topic`.trim();
function buildLibraryComposeUserFields(params) {
  if (params.candidates.length === 0) {
    return { has_library_image: false };
  }
  const imageLed = params.composeMode === "image_led";
  return {
    has_library_image: true,
    compose_mode: params.composeMode ?? "curriculum_matched",
    library_candidates: serializeWritingLibraryCandidatesForPrompt(params.candidates),
    library_image_required: sessionUsesLibraryPhotos(params.level),
    ...imageLed ? { compose_mode_note: "IMAGE-LED: photo tags/concept are the ONLY topic." } : {},
    ...params.lockedImageId ? { locked_selected_image_id: params.lockedImageId } : {},
    passage_sentence_target: buildWritingPassageSentenceTarget(params.level, params.keyUse),
    library_image_note: params.domainNote,
    curriculum_topic: imageLed ? null : params.curriculumTopic ?? null,
    academic_unit: imageLed ? null : params.academicUnit ?? null
  };
}

// src/lib/claude/standards/2020/prompts/shared.ts
var FRAMEWORK_2020_PROMPT_SLICE = `
EDITION: WIDA ELD Standards Framework, 2020.

The user JSON contains framework \u2014 your authoritative task specification:
\u2022 eld_standard \u2014 subject world; stay inside it.
\u2022 key_language_use \u2014 Narrate | Inform | Explain | Argue; do not switch jobs.
\u2022 mode \u2014 interpretive (listen/read) or expressive (speak/write); match the domain.
\u2022 language_expectations \u2014 goal list (same at every level for this cell).
\u2022 language_functions + language_features \u2014 the steps to assess; do not invent extra functions.
\u2022 pld \u2014 five lines for THIS integer level only; organization/cohesion/density/sentence/word_phrase set English hardness \u2014 not the topic or job.

Do not invent missing cells. Shape and formats are your choice when the schema allows null scaffolds or multiple question types.
`.trim();

// src/lib/claude/standards/2020/data/wida_eld_language_functions_6-8.json
var wida_eld_language_functions_6_8_default = {
  grade_band: "6-8",
  source: "WIDA English Language Development Standards Framework, 2020 Edition, Kindergarten-Grade 12",
  source_pages_in_file: "141-177",
  source_pages_as_labeled_in_document: "139-175",
  note: "This file captures the Language Functions layer that was found missing from the existing standards/rubric JSON files. Per the framework text (doc-labeled p.142): 'Language Expectations are built around a set of Language Functions... In Figure 3-5, you can see that the Language Functions are listed in bulleted form, under the interpretive and expressive language expectations.' Language Features (doc p.142) 'are examples of various language resources that carry out particular Language Functions' and are only provided for the expressive mode. Standard 1 (Social and Instructional) has no Language Features by design -- interpretive and expressive expectations are identical there, and its bullets serve directly as its Functions -- this is documented in the source text, not a data gap.",
  standards: {
    "1": {
      standard_name: "Language for Social and Instructional Purposes",
      reference_code_note: "ELD-SI 4-12 (same Language Expectations apply grades 4-12; grades K-3 have a separate span not captured in this 6-8 extraction)",
      has_language_features: false,
      key_language_uses: {
        Narrate: {
          reference_code: "ELD-SI 4-12 Narrate",
          language_expectations: [
            "Share ideas about one's own and others' lived experiences and previous learning",
            "Connect stories with images and representations to add meaning",
            "Identify and raise questions about what might be unexplained, missing, or left unsaid",
            "Recount and restate ideas to sustain and move dialogue forward",
            "Create closure, recap, and offer next steps"
          ]
        },
        Inform: {
          reference_code: "ELD-SI 4-12 Inform",
          language_expectations: [
            "Define and classify facts and interpretations; determine what is known vs. unknown",
            "Report on explicit and inferred characteristics, patterns, or behavior",
            "Describe the parts and wholes of a system",
            "Sort, clarify, and summarize relationships",
            "Summarize most important aspects of information"
          ]
        },
        Explain: {
          reference_code: "ELD-SI 4-12 Explain",
          language_expectations: [
            "Generate and convey initial thinking",
            "Follow and describe cycles and sequences of steps or procedures and their causes and effects",
            "Compare changing variables, factors, and circumstances",
            "Offer alternatives to extend or deepen awareness of factors that contribute to particular outcomes",
            "Act on feedback to revise understandings of how or why something is or works in particular ways"
          ]
        },
        Argue: {
          reference_code: "ELD-SI 4-12 Argue",
          language_expectations: [
            "Generate questions about different perspectives",
            "Support or challenge an opinion, premise, or interpretation",
            "Clarify and elaborate ideas based on feedback",
            "Evaluate changes in thinking, identifying trade-offs",
            "Refine claims and reasoning based on new information or evidence"
          ]
        }
      }
    },
    "2": {
      standard_name: "Language for Language Arts",
      has_language_features: true,
      note: "Explain is not detailed for this standard at grades 6-8 -- the framework only provides full Language Expectations/Functions/Features for the 'most prominent' Key Language Use x Standard combinations per grade band (see Table 3-11, Distribution of Key Language Uses in Grades 6-8).",
      key_language_uses: {
        Narrate: {
          reference_code_interpretive: "ELD-LA 6-8 Narrate Interpretive",
          reference_code_expressive: "ELD-LA 6-8 Narrate Expressive",
          interpretive: {
            intro: "Interpret language arts narratives by",
            language_expectations: [
              "Identifying a theme or central idea that develops over the course of a text",
              "Analyzing how character attributes and actions develop in relation to events or dialogue",
              "Evaluating impact of specific word choices about meaning and tone"
            ]
          },
          expressive: {
            intro: "Construct language arts narratives that",
            language_expectations: [
              "Orient audience to context and point of view",
              "Develop and describe characters and their relationships",
              "Develop story, including themes with complication and resolution, time, and event sequences",
              "Engage and adjust for audience"
            ]
          },
          language_functions: [
            {
              function: "Orient audience to context and point of view",
              language_features: [
                "Expanded noun groups to state who or what the narrative is about",
                "A variety of sentence types to introduce the context such as rhetorical and other questions, statements, dialog (Are we ever truly happy? It was confusing time, nothing seemed normal.)",
                "Adverbial and prepositional phrases to establish time and location (They stood together silently on the hill as the sun rose.)",
                "Statements and questions to foreshadow or state complication (As she walked home, she felt watched.)"
              ]
            },
            {
              function: "Develop and describe characters and their relationships",
              language_features: [
                "Verbs to describe character behaviors (turned instinctively), thoughts (concerned), feelings (pleased), speech (asked weakly)",
                "Expanded verb groups to show relationship between characters",
                "Saying, thinking, and feeling dialog verbs to add nuance to characters' relationships (\u201CDanny,\u201D the old man said, \u201CI was angry. Forgive me.\u201D)",
                "Expanded noun groups to add description and detail (He was short, but strong, with light, closely cut hair and a determined face.)",
                "Cohesive devices (pronouns, demonstratives, renaming, synonyms) to reference characters or ideas across the text"
              ]
            },
            {
              function: "Develop story, including themes with complication and resolution, time, and event sequences",
              language_features: [
                "Dependent clauses to add details (the race, which only happened every four years)",
                "A variety of verb tenses to pace narrative and locate events in time, including dialog (\u201CWhere are you going?,\u201D I asked.)",
                "Connectors to develop and link sections of text to sequence time (meanwhile, later), ideas (in the first place, at this point), and add information (what's more, likewise, in addition)",
                "Statements to provide closure, evaluate experience, or summarize narrative (Finally, it was over; The experience was enlightening; There are some things that can't be seen but only felt.)"
              ]
            },
            {
              function: "Engage and adjust for audience",
              language_features: [
                "Evaluative word choices to describe author's attitudes (with death-cold scorn in his voice; pitiful, gracious, self-sacrificing, enriching)",
                "Literary devices (similes and metaphors) to enrich the narrative (fly like an eagle, life is a highway), alliteration (babbling brook), sensory words/phrases, and onomatopoeia (tick-tock)",
                "Tone of voice, gesturing, acting behaviors to adjust for audience",
                "Language to address reader/listener and draw them in (She scuffled away across the snowy field like a small hunched animal.)"
              ]
            }
          ]
        },
        Inform: {
          reference_code_interpretive: "ELD-LA 6-8 Inform Interpretive",
          reference_code_expressive: "ELD-LA 6-8 Inform Expressive",
          interpretive: {
            intro: "Interpret informational texts in language arts by",
            language_expectations: [
              "Identifying and/or summarizing main ideas and their relationship to supporting ideas",
              "Analyzing observations and descriptions in textual evidence for key attributes, qualities, characteristics, activities, and behaviors",
              "Evaluating the impact of author's key word choices over the course of a text"
            ]
          },
          expressive: {
            intro: "Construct informational texts in language arts that",
            language_expectations: [
              "Introduce and define topic and/or entity for audience",
              "Establish objective or neutral stance",
              "Add precision, details, and clarity about relevant attributes, qualities, characteristics, activities, and behaviors",
              "Develop coherence and cohesion throughout text"
            ]
          },
          language_functions: [
            {
              function: "Introduce and define topic and/or entity for audience",
              language_features: [
                "Generalized nouns and descriptive titles to introduce topic (Revolutions, Environmental Disasters, Mining the Earth)",
                "Opening statements to identify type of information (describing, comparing/contrasting, classifying)",
                "Relating verbs (have, be, belong to) to link an entity with its attributes; define, describe, and classify (It was a cultural and intellectual movement.)",
                "Timeless present verbs (rises, shapes, determines) to indicate generalizable nature of information",
                "Expanded noun groups to define key concepts (a period in European history that took place)"
              ]
            },
            {
              function: "Establish objective or neutral stance",
              language_features: [
                "Declarative statements to provide objective, factual information",
                "Technical word choices to add precise and descriptive information without evaluative language (the effects versus devastating effects)",
                "Generalized nouns to maintain neutrality (millennials, stringed instruments, marsupials)",
                "Variety of structures to define and describe entities (embedded clauses, relating verbs, nominalizations, given/new patterns)",
                "Reporting devices (saying verbs) to integrate sourced information into report (said, reported, claims), direct and indirect quotes"
              ]
            },
            {
              function: "Add precision, details, and clarity about relevant attributes, qualities, characteristics, activities, and behaviors",
              language_features: [
                "Adverbial and prepositional phrases to specify time and location (in 1592, following the Middle Ages, during the spring, along the ridge, located within the Earth's core)",
                "Expanded noun groups to add precision (strummed or plucked vibration of the strings)",
                "Adjectives and adverbs to answer questions about quantity, size, shape, manner (microscopic, right-angled, voraciously, precisely)",
                "Contrasting connectors to differentiate between entities or components (unlike, as opposed to, however)",
                "Visuals (graphs, data, diagrams) to support key details"
              ]
            },
            {
              function: "Develop coherence and cohesion throughout text",
              language_features: [
                "Referential devices (pronoun reference, synonyms, renaming, collocations) to link ideas across sections of text",
                "Topic or headings to serve as openers for sentences or paragraphs",
                "Nominalization to condense clauses (it rained year after year=annual floods) or summarize key ideas"
              ]
            }
          ]
        },
        Argue: {
          reference_code_interpretive: "ELD-LA 6-8 Argue Interpretive",
          reference_code_expressive: "ELD-LA 6-8 Argue Expressive",
          interpretive: {
            intro: "Interpret language arts arguments by",
            language_expectations: [
              "Identifying and summarizing central idea distinct from prior knowledge or opinions",
              "Analyzing how an author acknowledges and responds to conflicting evidence or viewpoints",
              "Evaluating relevance, sufficiency of evidence, and validity of reasoning that support claim(s)"
            ]
          },
          expressive: {
            intro: "Construct language arts arguments that",
            language_expectations: [
              "Introduce and develop claim(s) and acknowledge counterclaim(s)",
              "Support claims with reasons and evidence that are clear, relevant, and credible",
              "Establish and maintain formal style",
              "Logically organize claim(s) with clear reasons and relevant evidence; offer a conclusion"
            ]
          },
          language_functions: [
            {
              function: "Introduce and develop claim(s) and acknowledge counterclaim(s)",
              language_features: [
                "Declarative statements to frame topic, provide background information, state claim, and acknowledge counterclaim (Graphic novels provide a unique way to read that appeals to many teenagers.)",
                "Noun groups to provide details (Maus, a graphic novel written and illustrated by Art Spiegelman\u2026)",
                "Connectors to introduce alternative points of view (although, on the other hand, unlike, contrary to common belief)",
                "Pronouns, synonyms, collocations, renaming subjects to maintain cohesion (graphic novels=these unique texts=young adult comic books)"
              ]
            },
            {
              function: "Support claims with reasons and evidence that are clear, relevant, and credible",
              language_features: [
                "A variety of clauses (adverbial, embedded) to support opinion and/or claim(s) (quotes, references, detailed descriptions, examples or other sources and data) (according to X, the author's claim)",
                "Connectors to elaborate an idea/interpretation (so, this means, therefore, leading one to believe, a way to think about this)",
                "Connectors to link claim(s) with evidence and reasoning (because, as a result, when, if, although, but)",
                "Literary devices to support evidence and interpretation (similes and metaphors, alliteration, idioms, figurative and sensory words/phrases, collocation, multilingual words/phrases)",
                "Modality to express obligation or certainty (might, could, must, need to) or to open up to other possibilities (possibly, apparently, perhaps, definitely, absolutely)"
              ]
            },
            {
              function: "Establish and maintain formal style",
              language_features: [
                "First, second, third person use to connect with reader, build alliance, or maintain neutrality (unjust power, a theme throughout the text, reminds us to be aware of our individual resourcefulness as sources of hope in desperate situations)",
                "Authoritative declarative sentences to evaluate and interpret events (Spiegelman's clever use of imagery and graphic layout presents a unique way of using the graphic novel format.)",
                "Nouns, adjectives, verbs, and adverbs to adjust intensity and strength of message (somewhat powerful versus incredibly powerful; ugly versus grotesque)"
              ]
            },
            {
              function: "Logically organize claim(s) with clear reasons and relevant evidence; offer a conclusion",
              language_features: [
                "Connectors to support inferential conclusions (Students' preference for graphic novels is evident because/due to the rate these novels are checked out of the library.)",
                "Comparing/contrasting connectors to differentiate between claims and counterclaims (unlike, as opposed to, contrasted with, conversely, similarly, in spite of that)",
                "Verb structures to present information in a variety of ways (past, timeless present, passive voice)",
                "Connectors to sequence points in the argument and maintain logical progression (one way, another point, as mentioned previously, in addition)",
                "Summary statement to reiterate claim(s), call to action, or encourage a response (While Maus relies on images to get the point across, the message of how we dehumanize others is loud and clear.)"
              ]
            }
          ]
        }
      }
    },
    "3": {
      standard_name: "Language for Mathematics",
      has_language_features: true,
      note: "Narrate and Inform are not detailed for this standard at grades 6-8, per prominence distribution (Table 3-11).",
      key_language_uses: {
        Explain: {
          reference_code_interpretive: "ELD-MA 6-8 Explain Interpretive",
          reference_code_expressive: "ELD-MA 6-8 Explain Expressive",
          interpretive: {
            intro: "Interpret mathematical explanations by",
            language_expectations: [
              "Identifying concept or entity",
              "Analyzing possible ways to represent and solve a problem",
              "Evaluating model and rationale for underlying relationships in selected problem-solving approach"
            ]
          },
          expressive: {
            intro: "Construct mathematical explanations that",
            language_expectations: [
              "Introduce concept or entity",
              "Share solution with others",
              "Describe data and/or problem-solving strategy",
              "State reasoning used to generate solution"
            ]
          },
          language_functions: [
            {
              function: "Introduce concept or entity",
              language_features: [
                "Mathematical terms and phrases to describe concept, process, or purpose (this probability model, randomized sampling will provide more valid results)",
                "Relating verbs (belong to, are part of, be, have) to define or describe concept"
              ]
            },
            {
              function: "Share solution with others",
              language_features: [
                "Generalized nouns to add precision to discussion (distributions, probability, frequencies)",
                "Language choices to reflect on completed and on-going process (we should have done this, we might be able to, what if we try)",
                "First person (I, We) to describe approach; third person to describe approach with neutral stance of authority",
                "Observational (notice, it appears, looks like) and comparative language (different from, similar to, the same) to share results (We notice our process was different, but we have the same solution.)",
                "Modality (verbs, adverbs, nouns, adjectives) to express opinions, degrees of certainty, or temper disagreement (It's a possibility, We have to do it this way, Maybe we could look at)"
              ]
            },
            {
              function: "Describe data and/or problem-solving strategy",
              language_features: [
                "Abstract, generalized, or multi-meaning noun groups to add precision to mathematical descriptions (randomized variation, proportional relationships, constituents)",
                "Visual data displays (tables, tree diagrams, simulations, data charts, manipulatives) to clarify approach and/or solution",
                "Connectors to link sentences and longer stretches of text signaling details of time (next, at the same time), causality (therefore, consequently, as a result), clarification (for example, as seen in the model)",
                "Passive voice verbs to explain or analyze (The variable is given a value of six.)",
                "Timeless present verbs to present generalizable truths (The hypotenuse is opposite the right angle.)"
              ]
            },
            {
              function: "State reasoning used to generate solution",
              language_features: [
                "Causal connectors to express reasoning (We took these steps to solve problems with the ratios because\u2026)",
                "Conditional conjunctions to propose future options (if/so, if/then) and generalized relationships (if/will, if we follow the order of operations, we will show that\u2026)"
              ]
            }
          ]
        },
        Argue: {
          reference_code_interpretive: "ELD-MA 6-8 Argue Interpretive",
          reference_code_expressive: "ELD-MA 6-8 Argue Expressive",
          interpretive: {
            intro: "Interpret mathematics arguments by",
            language_expectations: [
              "Comparing conjectures with previously established results",
              "Distinguishing commonalities among strategies used",
              "Evaluating relationships between evidence and mathematical facts to create generalizations"
            ]
          },
          expressive: {
            intro: "Construct mathematics arguments that",
            language_expectations: [
              "Create conjecture, using definitions and previously established results",
              "Generalize logic across cases",
              "Justify conclusions with evidence and mathematical facts",
              "Evaluate and critique others' arguments"
            ]
          },
          language_functions: [
            {
              function: "Create conjecture, using definitions and previously established results",
              language_features: [
                "Conditional conjunctions (if or when) to make and justify conjecture (If I add 4/5 and 3/4, the result will be less than 2 because each fraction is less than a whole number.)",
                "Relating verbs (have, belong to, be) to define principles, operational theorems, and properties (for right angled triangles the Pythagorean formula is a\xB2 + b\xB2 = c\xB2)",
                "Adverbial phrases (qualities, quantities, frequencies) to add precision related to conjecture (For all integers, For every vote candidate A received, candidate B received three votes which means\u2026)"
              ]
            },
            {
              function: "Generalize logic across cases",
              language_features: [
                "Declarative statements to present generalizable processes (The expression 4n-1 can be used to find any value in the pattern.)",
                "Verbs to apply mathematical principles (commands) (use, do, apply, divide) across cases (Use the distributive property when there is no common factor.)"
              ]
            },
            {
              function: "Justify conclusions with evidence and mathematical facts",
              language_features: [
                "Conditional structures (if/then, when) to demonstrate conclusions (If it's a proportional relationship then the ratio between the 2 variables is always going to be the same thing.)",
                "Technical nouns and noun groups to add precision and details (coordinate plane, one-variable equations, two- and three-dimensional shapes)",
                "Models, drawings, graphs to demonstrate principles"
              ]
            },
            {
              function: "Evaluate and critique others' arguments",
              language_features: [
                "Questions (what, how, why, do), requests (could, would) to request information, clarification, procedure (Could you show me how you got that answer? Why did you do\u2026instead of\u2026?)",
                "Causal connectors (so, because, therefore) to identify misconceptions (The pattern is multiplying by a factor of 2, so it can't be a linear function.)",
                "Negation (don't, doesn't, can't) and obligation modal verbs (have to, must, should, could, might) to engage with others (I don't think you can apply that theorem, I think you have to use this....)"
              ]
            }
          ]
        }
      }
    },
    "4": {
      standard_name: "Language for Science",
      has_language_features: true,
      note: "Narrate and Inform are not detailed for this standard at grades 6-8, per prominence distribution (Table 3-11).",
      key_language_uses: {
        Explain: {
          reference_code_interpretive: "ELD-SC 6-8 Explain Interpretive",
          reference_code_expressive: "ELD-SC 6-8 Explain Expressive",
          interpretive: {
            intro: "Interpret scientific explanations by",
            language_expectations: [
              "Defining investigable questions or design problems based on observations, information, and/or data about a phenomenon",
              "Determining central ideas in complex evidence and information to help explain how or why a phenomenon occurs",
              "Evaluating scientific reasoning that shows why data or evidence adequately supports conclusions"
            ]
          },
          expressive: {
            intro: "Construct scientific explanations that",
            language_expectations: [
              "Describe valid and reliable evidence from sources about a phenomenon",
              "Establish neutral or objective stance in how results are communicated",
              "Develop reasoning to show relationships among independent and dependent variables in models and simple systems",
              "Summarize patterns in evidence, making trade-offs, revising, and retesting"
            ]
          },
          language_functions: [
            {
              function: "Describe valid and reliable evidence from sources about a phenomenon",
              language_features: [
                "Abstract nouns to introduce concepts, ideas, and technical terms (effects, predator-prey relationships, magnetic forces)",
                "Cohesion to reference ideas, people across text (pronouns, substitutions, renaming, synonyms, collocations)",
                "Relating verb groups to state relationships or attributes (have, be, belong to)",
                "A variety of ways to define phenomenon (relative clauses, declarative statements)"
              ]
            },
            {
              function: "Establish neutral or objective stance in how results are communicated",
              language_features: [
                "Passive voice and declarative statements (Indonesia was formed by, tectonic plates have shifted for billions of years)",
                "Word choices to moderate stance (hedging) (could/might, a possibility, usually)",
                "Objective and evaluative language to adjust precision and establish shared interest"
              ]
            },
            {
              function: "Develop reasoning to show relationships among independent and dependent variables in models and simple systems",
              language_features: [
                "Connectors to link clauses and combine ideas into logical relationships (as a result, therefore) or order events",
                "Variety of clause types to express causality (If magma is thick, gas bubbles cannot easily escape, building pressure as the magma rises.)",
                "Given/new patterns to link relationships, add new details, and condense information into abstract nouns"
              ]
            },
            {
              function: "Summarize patterns in evidence, making trade-offs, revising, and retesting",
              language_features: [
                "Labeling/describing diagrams, graphics, data, statistics to add information about a phenomenon",
                "Ask and answer questions to theorize, clarify, and make extrapolations about a phenomenon",
                "Conditional clauses (if/then) to generalize a phenomenon to additional contexts"
              ]
            }
          ]
        },
        Argue: {
          reference_code_interpretive: "ELD-SC 6-8 Argue Interpretive",
          reference_code_expressive: "ELD-SC 6-8 Argue Expressive",
          interpretive: {
            intro: "Interpret scientific arguments by",
            language_expectations: [
              "Identifying convincing evidence from data, models, and/or information from investigations of phenomena or design solutions",
              "Comparing reasoning and claims based on evidence from two arguments on the same topic",
              "Evaluating whether they emphasize similar or different evidence and/or interpretations of facts"
            ]
          },
          expressive: {
            intro: "Construct scientific arguments that",
            language_expectations: [
              "Introduce and contextualize topic/phenomenon in issues related to the natural and designed world(s)",
              "Support or refute a claim based on data and evidence",
              "Establish and maintain a neutral or objective stance",
              "Signal logical relationships among reasoning, evidence, data, and/or a model when making or defending a claim or counterclaim"
            ]
          },
          language_functions: [
            {
              function: "Introduce and contextualize topic/phenomenon in issues related to the natural and designed world(s)",
              language_features: [
                "A variety of ways to define phenomenon (relative clauses, declarative statements, relational verbs)",
                "Abstract nouns to introduce concepts, ideas, and technical terms (molecules, atoms, reactions, energy, regrouping)",
                "A variety of verb groups (past, timeless present, future, conditional) to describe events known or anticipated"
              ]
            },
            {
              function: "Support or refute a claim based on data and evidence",
              language_features: [
                "Expanded noun groups to classify and/or add details (energy releasing reactions, reconfigured molecular bonds)",
                "Connectors to link clauses and establish logical relationships (as a result, therefore, to be more precise, instead, however, on the other hand)",
                "Variety of clause types to express causality (If the total number in each type of atom is conserved, there is no change in the atom's mass.)",
                "Diagrams, models, data, graphics to add support to claim or evidence"
              ]
            },
            {
              function: "Establish and maintain a neutral or objective stance",
              language_features: [
                "Passive voice and declarative statement to establish a factual stance (Some chemical reactions release energy, others store it.)",
                "Word choices to moderate stance (hedging) (could/might, a possibility, usually, often)"
              ]
            },
            {
              function: "Signal logical relationships among reasoning, evidence, data, and/or a model when making or defending a claim or counterclaim",
              language_features: [
                "Given/new patterns to link relationships, add new details, and condense information into abstract nouns",
                "Cohesion to reference ideas, concepts, phenomena across text (pronouns, substitutions, renaming subjects, collocations, synonyms)",
                "Connectors to signal time (next, at the same time), causality (therefore, consequently, as a result, because), clarification (for example, this shows how\u2026)"
              ]
            }
          ]
        }
      }
    },
    "5": {
      standard_name: "Language for Social Studies",
      has_language_features: true,
      note: "Narrate and Inform are not detailed for this standard at grades 6-8, per prominence distribution (Table 3-11).",
      key_language_uses: {
        Explain: {
          reference_code_interpretive: "ELD-SS 6-8 Explain Interpretive",
          reference_code_expressive: "ELD-SS 6-8 Explain Expressive",
          interpretive: {
            intro: "Interpret social studies explanations by",
            language_expectations: [
              "Determining multiple points of view in sources for answering compelling and supporting questions about phenomena or events",
              "Analyzing sources for logical relationships among contributing factors or causes",
              "Evaluating experts' points of agreement, along with strengths and weakness of explanations"
            ]
          },
          expressive: {
            intro: "Construct social studies explanations that",
            language_expectations: [
              "Introduce and contextualize phenomena or events",
              "Establish perspective for communicating outcomes, consequences, or documentation",
              "Develop reasoning, sequences with linear and nonlinear relationships, evidence, and details, acknowledging strengths and weaknesses",
              "Generalize multiple causes and effects of developments or events"
            ]
          },
          language_functions: [
            {
              function: "Introduce and contextualize phenomena or events",
              language_features: [
                "Prepositional phrases of time, place to contextualize phenomena or events (a place where tourists already come)",
                "A variety of structures (embedded clauses, relating verbs, nominalizations, noun groups) to define phenomena or events",
                "Cohesion to reference ideas, people across text (pronouns, substitutions, renaming, synonyms, collocations)"
              ]
            },
            {
              function: "Establish perspective for communicating outcomes, consequences, or documentation",
              language_features: [
                "Passive voice to emphasize main topic (British trade was disrupted by\u2026)",
                "Active verbs to highlight agents and recipients (The colonists disrupted British trade.)",
                "Declarative statements to evaluate and interpret events (Feudalism was the ultimate system of control for medieval society.)",
                "Verbs and adjectives to judge behavior or moral character (rallied, conquered, cruel, compassionate)"
              ]
            },
            {
              function: "Develop reasoning, sequences with linear and nonlinear relationships, evidence, and details, acknowledging strengths and weaknesses",
              language_features: [
                "Nominalizations to name abstract concepts, ideas, ideologies (colonization, feudalism)",
                "Dependent clauses to express details as a result of place, manner, duration, extent",
                "Complex sentences to clarify causal, linked, time-bound, or sequential relationships",
                "Expanded noun groups to add details (living standards of 18th century people)",
                "Connectors to maintain chronological, causal or logical relationships (as a result, meanwhile, later, in order to)"
              ]
            },
            {
              function: "Generalize multiple causes and effects of events and developments",
              language_features: [
                "Word choices to evaluate, judge, or appreciate significance of events or phenomena",
                "Nominalizations to summarize events and name abstract phenomena"
              ]
            }
          ]
        },
        Argue: {
          reference_code_interpretive: "ELD-SS 6-8 Argue Interpretive",
          reference_code_expressive: "ELD-SS 6-8 Argue Expressive",
          interpretive: {
            intro: "Interpret social studies arguments by",
            language_expectations: [
              "Identifying topic and purpose (argue in favor or against a position, present a balanced interpretation, challenge perspective)",
              "Analyzing relevant information from multiple sources to support claims",
              "Evaluating point of view and credibility of source based on relevance and intended use"
            ]
          },
          expressive: {
            intro: "Construct social studies arguments that",
            language_expectations: [
              "Introduce and contextualize topic",
              "Select relevant information to support claims with evidence gathered from multiple sources",
              "Establish perspective",
              "Show relationships between claims and counterclaims, differences in perspectives, and evidence and reasoning"
            ]
          },
          language_functions: [
            {
              function: "Introduce and contextualize topic",
              language_features: [
                "Generalized nouns and a descriptive title to introduce topic (empire, excavation, The Cradle of Modern Civilization)",
                "A variety of verb tenses (past, timeless present, relational) to present position and/or provide background information",
                "Expanded noun groups with embedded and relative clauses to add details (Mesopotamia, often referred to as the Cradle of Life, was located between the Tigris and Euphrates Rivers.)",
                "Cohesion to reference ideas, people across text (pronouns, synonyms, substitutions, renaming, collocations)",
                "Connectors to structure paragraphs (first, in the beginning, meanwhile, as a result, in conclusion)",
                "Given/new patterns to link relationships, add new details, and condense information into abstract nouns"
              ]
            },
            {
              function: "Select relevant information to support claims with evidence gathered from multiple sources",
              language_features: [
                "A variety of clauses to frame details, examples, quotes, data (according to, historians dis/agree, several sources suggest, these data suggest)",
                "Adverbial and prepositional phrases to specify time (duration, specific date or range), location, how or why something happened (during the late Neolithic period, the area between\u2026)",
                "A variety of verb forms to express agency in doing, thinking, saying, feeling actions (I contradicted him, we support, they challenged)"
              ]
            },
            {
              function: "Establish perspective",
              language_features: [
                "Passive voice to keep emphasis on main topic rather than who or what is doing the action (Soldiers were housed in primitive tents.) or to keep emphasis on who or what is doing the action",
                "Objective or emotive language to appeal to logic or feelings (credited with inventing the wheel versus the greatest inventions of all times)",
                "Evaluative verbs, adverbs, and adjectives to add author's perspective (dominated, absolutely, compelling)"
              ]
            },
            {
              function: "Show relationships between claims and counterclaims, differences in perspectives, and evidence and reasoning",
              language_features: [
                "Connectors to link claims with evidence and reasoning (because, but, as a result, when, if, although, therefore)",
                "Connectors to signal alternate points of view (on the other hand, contrary to common belief, according to), show concession or comparison/contrast (while, although, instead, despite this, however)",
                "Modality in summary statements to reiterate position, or create a call to action (could be argued, undoubtedly, ought to, may)"
              ]
            }
          ]
        }
      }
    }
  }
};

// src/lib/claude/standards/2020/data/wida_eld_proficiency_level_descriptors_6-8.json
var wida_eld_proficiency_level_descriptors_6_8_default = {
  grade_band: "6-8",
  source: "WIDA English Language Development Standards Framework, 2020 Edition, Kindergarten-Grade 12 -- Section 3, Proficiency Level Descriptors",
  source_pages_in_file: "173-177",
  source_pages_as_labeled_in_document: "171-175",
  note_on_relationship_to_language_expectations: "Per the source document (doc-labeled p.171): 'Whereas Language Expectations offer goals for how all students might use language to meet academic content standards, PLDs offer a succinct description of how multilingual learners might develop language across levels of language proficiency in moving toward meeting Language Expectations.' PLDs are designed to be used IN COORDINATION WITH Language Expectations, Language Functions, and Language Features (see wida_eld_language_functions_6-8.json) -- not as a standalone item-generation source. Each level includes and builds on previous levels (PL4 = PL1+PL2+PL3+PL4); PL6 is open-ended.",
  caution: "These are capability descriptors (what a student's language looks like at a level), not task templates -- same caution as Can-Do Descriptors. Use PLDs to drive the COMPLEXITY/scaffolding layer of item generation only; task-frame/instruction content should come from wida_eld_language_functions_6-8.json.",
  possible_duplicate_source_flag: "wida_language_charts_data.json already contains PLD-like content for this grade band, but sourced from a DIFFERENT WIDA publication (Language Charts: Tying WIDA ACCESS Scores to Classroom Assessment, 2025), not this 2020 Framework PDF. Cross-check the two -- if they diverge, this file (native to the same document as the Language Expectations/Functions/Features) is likely the one to standardize on.",
  interpretive_communication_mode: {
    modes_covered: "Listening, Reading, Viewing",
    framing: "Toward the end of each proficiency level, when scaffolded appropriately, multilingual learners will...",
    dimensions: [
      {
        dimension: "Discourse - Organization of language",
        criterion_prompt: "Understand how coherent texts (spoken, written, multimodal) are created\u2026",
        end_of_level_1: "to meet a purpose (to inform, narrate, entertain, argue, explain) in a series of topic-related sentences",
        end_of_level_2: "to meet a purpose in a short, connected text",
        end_of_level_3: "to meet a purpose through generic (not genre-specific) organizational patterns in texts (introduction, body, conclusion)",
        end_of_level_4: "to meet a purpose through genre-specific organizational patterns (orientation and explanation sequence)",
        end_of_level_5: "to meet a purpose through genre-specific organizational patterns (claim, evidence, reasoning) linking ideas, events, and reasons",
        level_6: "to meet a purpose reflective of genre and discipline, linking ideas, events, and reasons in a variety of ways (causes and effects, factors and outcomes, events and consequences)"
      },
      {
        dimension: "Discourse - Cohesion of language",
        criterion_prompt: "Understand how ideas are connected across a whole text through\u2026",
        end_of_level_1: "a few different types of cohesive devices (repetition, pronoun referencing, demonstratives, etc.)",
        end_of_level_2: "multiple cohesive devices (synonyms, antonyms)",
        end_of_level_3: "a variety of cohesive devices that connect larger meaningful chunks of text (class/subclass, whole/part)",
        end_of_level_4: "a wide variety of cohesive devices that connect ideas throughout text (whole/part, substitution, ellipsis)",
        end_of_level_5: "cohesive devices and common strategies that connect ideas throughout text (given/new)",
        level_6: "various types of cohesive devices and strategies that connect ideas throughout text"
      },
      {
        dimension: "Discourse - Density of language",
        criterion_prompt: "Understand how ideas are elaborated or condensed through\u2026",
        end_of_level_1: "expanded noun groups with classifiers (crescent moon)",
        end_of_level_2: "expanded noun groups with prepositional phrases (waxing crescent moon in the second half of the month)",
        end_of_level_3: "expanded noun groups with embedded clauses (waxing crescent moon that was growing each day)",
        end_of_level_4: "expanded noun groups with a variety of embedded clauses (predictable and observable moon phases in your particular time zone)",
        end_of_level_5: "expanded noun groups with a wide variety of embedded clauses and compacted noun groups (nominalization)",
        level_6: "multiple ways of elaborating and condensing text to enrich the meaning and add details characteristic of genres and content areas (the relative positions of the sun, earth, and moon cause these changes)"
      },
      {
        dimension: "Sentence - Grammatical complexity",
        criterion_prompt: "Understand how meanings are extended or enhanced through\u2026",
        end_of_level_1: "related simple sentences (African savannas are full of wildlife.)",
        end_of_level_2: "multiple related simple sentences (African savannas are full of life. Explore Tanzania.)",
        end_of_level_3: "simple or compound sentences with familiar ways of combining clauses through using coordinating conjunctions (African savannas are unique and they have amazing wildlife.)",
        end_of_level_4: "compound sentences with frequently used ways of combining clauses (A variety of wildlife live in the savanna such as\u2026)",
        end_of_level_5: "compound and complex sentences with a variety of ways of combining clauses addressing genre, audience, and content area (Since it's an ecosystem, it has a variety of\u2026)",
        level_6: "a wide variety of sentence types that show a variety of increasingly complex relationships (condition, concession, contrast) addressing genre, audience, and content area (The Black Rhino is at risk of extinction, unless\u2026)"
      },
      {
        dimension: "Word, Phrase - Precision of language",
        criterion_prompt: "Understand how precise meanings are created through everyday, cross-disciplinary, and technical language through\u2026",
        end_of_level_1: "an increasing number of words and phrases (don't be late for class)",
        end_of_level_2: "a growing number of words and phrases in a variety of contexts (inside the membrane)",
        end_of_level_3: "an expanding number of words and phrases including idioms and collocations (gravity is bringing me down)",
        end_of_level_4: "a variety of words and phrases such as adverbials of time, manner, and place; verb types; and abstract nouns (at the speed of light)",
        end_of_level_5: "a wide variety of words, phrases, and expressions with multiple meanings across content areas",
        level_6: "strategic use of various words, phrases, and expressions with shades of meaning across content areas (trembling in the corner, pounding rain, the whisper of dragonfly wings)"
      }
    ]
  },
  expressive_communication_mode: {
    modes_covered: "Speaking, Writing, Representing",
    framing: "Toward the end of each proficiency level, when scaffolded appropriately, multilingual learners will...",
    dimensions: [
      {
        dimension: "Discourse - Organization of language",
        criterion_prompt: "Create coherent texts (spoken, written, multimodal) using\u2026",
        end_of_level_1: "sentences that convey intended purpose with emerging organization (topic sentence, supporting details)",
        end_of_level_2: "short text that conveys intended purpose using predictable organization (signaled with some paragraph openers: First\u2026Finally, In 1842, This is how volcanos form)",
        end_of_level_3: "expanding text that conveys intended purpose using generic (not genre-specific) organizational patterns (introduction, body, conclusion)",
        end_of_level_4: "text that conveys intended purpose using genre-specific organizational patterns (statement of position, arguments, call to action) with a variety of paragraph openers",
        end_of_level_5: "text that conveys intended purpose using genre-specific organizational patterns with strategic ways of signaling relationships between paragraphs and throughout text (the first reason, the second reason, the evidence\u2026)",
        level_6: "text that conveys intended purpose using genre-specific organizational patterns using a wide range of ways to signal relationships throughout the text"
      },
      {
        dimension: "Discourse - Cohesion of language",
        criterion_prompt: "Connect ideas across a whole text through\u2026",
        end_of_level_1: "some formulaic cohesive devices (repetition, pronoun referencing, etc.)",
        end_of_level_2: "a growing number of cohesive devices (emerging use of articles to refer to the same word, synonyms, antonyms)",
        end_of_level_3: "an expanding number of cohesive devices (given/new, whole/part, class/subclass)",
        end_of_level_4: "a flexible number of cohesive devices (ellipsis, substitution/omission)",
        end_of_level_5: "a variety of cohesive devices used in genre- and discipline-specific ways",
        level_6: "a wide variety of cohesive devices (substitution, omission, synonyms, antonyms, whole/part, class/subclass) used in genre- and discipline-specific ways"
      },
      {
        dimension: "Discourse - Density of language",
        criterion_prompt: "Elaborate or condense ideas through\u2026",
        end_of_level_1: "some types of elaboration (adding a newly learned adjective to a noun)",
        end_of_level_2: "a growing number of types of elaboration (adding articles or demonstratives to a noun: the or these clouds)",
        end_of_level_3: "a variety of types of elaboration (adding classifiers: cumulus and cumulonimbus clouds)",
        end_of_level_4: "a wide variety of elaboration (adding in embedded clauses after the noun: those storm clouds that we saw yesterday)",
        end_of_level_5: "a flexible range of elaboration and some ways to condense ideas (scary looking storm clouds that turned dark in a matter of minutes and condensing through nominalization: that storm system)",
        level_6: "multiple types of elaboration and a growing number of ways to condense ideas throughout a text"
      },
      {
        dimension: "Sentence - Grammatical complexity",
        criterion_prompt: "Extend or enhance meanings through\u2026",
        end_of_level_1: "simple sentences (The main character is Harry. He is a wizard.)",
        end_of_level_2: "sentences with emerging use of clauses (no conjunctions: The main character is Harry. His friends are\u2026 They go to Hogwarts.)",
        end_of_level_3: "simple or compound sentences with familiar ways of combining clauses (with some coordinating conjunctions: He goes to Hogwarts School and his friends are\u2026)",
        end_of_level_4: "compound sentences with frequently used ways of combining clauses (They fight the forces of evil, yet they can't overcome them.)",
        end_of_level_5: "compound and complex sentences with a variety of ways of combining clauses characteristic of the genre and content area (with a range of techniques to extend, or shorten sentences: Harry has a lightning bolt scar because he was attacked when\u2026)",
        level_6: "a wide variety of sentence types with increasingly complex clause relationships (condition, cause, concession, contrast) addressing genre, audience, and content area (When Harry is close to Voldemort, his scar throbs.)"
      },
      {
        dimension: "Word, Phrase - Precision of language",
        criterion_prompt: "Create precise meanings through everyday, cross-disciplinary, and technical language with\u2026",
        end_of_level_1: "a small repertoire of words and phrases with developing precision (order of operations, on page 12)",
        end_of_level_2: "a growing repertoire of words and phrases with growing precision (kinetic energy, law of motion)",
        end_of_level_3: "an expanding repertoire of words and phrases including idioms and collocations with expanding precision (love-hate relationship)",
        end_of_level_4: "a flexible repertoire of words and phrases such as adverbials of time, manner, and place; verb types; and abstract nouns with consistent precision (fill the beaker to the top line)",
        end_of_level_5: "a variety of words and phrases, including evaluation and obligation, with precision (stupid test, we should figure this out)",
        level_6: "a wide variety of words and phrases with precision (weighing 4.4 pounds on Earth, wrong answer) according to the genre, purpose and discipline"
      }
    ]
  }
};

// src/lib/claude/standards/2020/select.ts
var SUBJECT_TO_STANDARD = {
  ela: "2",
  math: "3",
  science: "4",
  social_studies: "5"
};
var STANDARD_NAMES = {
  "1": "Language for Social and Instructional Purposes",
  "2": "Language for Language Arts",
  "3": "Language for Mathematics",
  "4": "Language for Science",
  "5": "Language for Social Studies"
};
var MAX_FUNCTIONS = 8;
var MAX_FEATURES = 8;
var pack = wida_eld_language_functions_6_8_default;
var plds = wida_eld_proficiency_level_descriptors_6_8_default;
function asKeyUse(keyUse) {
  if (keyUse === "Recount") return "Narrate";
  if (keyUse === "Inform" || keyUse === "Explain" || keyUse === "Argue" || keyUse === "Narrate") {
    return keyUse;
  }
  return "Inform";
}
function kluCell(standardId, klu) {
  return pack.standards[standardId]?.key_language_uses?.[klu] ?? null;
}
function hasExpressiveCell(subject, keyUse) {
  if (!subject) return false;
  const cell = kluCell(SUBJECT_TO_STANDARD[subject], asKeyUse(keyUse));
  if (!cell) return false;
  const functions = cell.language_functions?.length ?? 0;
  const expectations = cell.expressive?.language_expectations?.length ?? 0;
  return functions > 0 || expectations > 0;
}
function hasInterpretiveCell(subject, keyUse) {
  if (!subject) return false;
  const cell = kluCell(SUBJECT_TO_STANDARD[subject], asKeyUse(keyUse));
  if (!cell) return false;
  const interp = cell.interpretive?.language_expectations?.length ?? 0;
  const topLevel = cell.language_expectations?.length ?? 0;
  return interp > 0 || topLevel > 0;
}
function resolveStandardId(keyUse, academicSubject) {
  if (academicSubject) {
    const preferred = SUBJECT_TO_STANDARD[academicSubject];
    if (kluCell(preferred, keyUse)) return preferred;
  }
  return "1";
}
function pldLineFromMode(mode, dimensionName, level) {
  const modePack = mode === "interpretive" ? plds.interpretive_communication_mode : plds.expressive_communication_mode;
  const dims = modePack?.dimensions ?? [];
  const dim = dims.find((d) => d.dimension === dimensionName);
  if (!dim) return "";
  const clamped = Math.min(6, Math.max(1, Math.round(level)));
  if (clamped === 1) return dim.end_of_level_1 ?? "";
  if (clamped === 2) return dim.end_of_level_2 ?? "";
  if (clamped === 3) return dim.end_of_level_3 ?? "";
  if (clamped === 4) return dim.end_of_level_4 ?? "";
  if (clamped === 5) return dim.end_of_level_5 ?? "";
  return dim.level_6 ?? "";
}
function selectPld(level, mode) {
  const clamped = Math.min(6, Math.max(1, Math.round(level)));
  const modePack = mode === "interpretive" ? plds.interpretive_communication_mode : plds.expressive_communication_mode;
  return {
    level: clamped,
    framing: modePack?.framing ?? "Toward the end of each proficiency level, when scaffolded appropriately, multilingual learners will...",
    discourse_organization: pldLineFromMode(mode, "Discourse - Organization of language", clamped),
    discourse_cohesion: pldLineFromMode(mode, "Discourse - Cohesion of language", clamped),
    discourse_density: pldLineFromMode(mode, "Discourse - Density of language", clamped),
    sentence: pldLineFromMode(mode, "Sentence - Grammatical complexity", clamped),
    word_phrase: pldLineFromMode(mode, "Word, Phrase - Precision of language", clamped)
  };
}
function expectationsFromCell(cell, mode) {
  if (mode === "interpretive") {
    if (cell.interpretive?.language_expectations?.length) {
      return cell.interpretive.language_expectations;
    }
    return cell.language_expectations ?? [];
  }
  if (cell.expressive?.language_expectations?.length) {
    return cell.expressive.language_expectations;
  }
  return cell.language_expectations ?? [];
}
function functionsFromCell(cell, mode) {
  if (mode === "interpretive") {
    const bullets2 = expectationsFromCell(cell, "interpretive");
    return bullets2.slice(0, MAX_FUNCTIONS).map((text26) => ({
      function: text26,
      language_features: []
    })).filter((row) => row.function.length > 0);
  }
  if (Array.isArray(cell.language_functions) && cell.language_functions.length > 0) {
    return cell.language_functions.slice(0, MAX_FUNCTIONS).map((row) => ({
      function: String(row.function ?? "").trim(),
      language_features: (row.language_features ?? []).map((f) => String(f)).slice(0, MAX_FEATURES)
    })).filter((row) => row.function.length > 0);
  }
  const bullets = expectationsFromCell(cell, "expressive");
  return bullets.slice(0, MAX_FUNCTIONS).map((text26) => ({
    function: text26,
    language_features: []
  }));
}
function referenceCodeFromCell(cell, mode) {
  if (mode === "interpretive") {
    return cell.reference_code_interpretive ?? cell.reference_code ?? null;
  }
  return cell.reference_code_expressive ?? cell.reference_code ?? null;
}
function selectFrameworkTask(opts) {
  const klu = asKeyUse(opts.keyUse);
  const mode = opts.mode ?? "expressive";
  let standardId = resolveStandardId(klu, opts.academicSubject);
  let cell = kluCell(standardId, klu);
  if (!cell) {
    standardId = "1";
    cell = kluCell("1", klu);
  }
  if (!cell) {
    throw new Error(`No WIDA 2020 ELD cell for key language use "${klu}" (standard ${standardId})`);
  }
  const expectations = expectationsFromCell(cell, mode);
  const level = Math.min(6, Math.max(1, Math.round(opts.level)));
  return {
    edition: "2020",
    eld_standard: {
      id: standardId,
      name: STANDARD_NAMES[standardId]
    },
    key_language_use: klu,
    mode,
    reference_code: referenceCodeFromCell(cell, mode),
    language_expectations: expectations.slice(0, 8),
    language_functions: functionsFromCell(cell, mode),
    pld: selectPld(level, mode)
  };
}
function serializeFrameworkTask(task) {
  return {
    edition: task.edition,
    eld_standard: task.eld_standard,
    key_language_use: task.key_language_use,
    mode: task.mode,
    reference_code: task.reference_code,
    language_expectations: task.language_expectations,
    language_functions: task.language_functions,
    pld: task.pld
  };
}
function frameworkTaskDescriptor(task) {
  const fns = task.language_functions.map((f) => f.function).filter(Boolean);
  if (fns.length > 0) return fns.slice(0, 3).join("; ");
  return task.language_expectations.slice(0, 2).join("; ");
}

// src/lib/claude/standards/2020/prompts/feedback.ts
var FEEDBACK_2020_SHARED = `
The user JSON may contain framework (2020 ELD Standard \xD7 Key Language Use \xD7 mode \xD7 language_functions + pld).
If framework is present, the student's job matches framework.key_language_use AND framework.language_functions.
Use framework.pld as the English-level target \u2014 not a different level's column.
Do not invent language functions or expectations that are not in framework.
Use only facts in the user message (picture, framework, task on screen, student answer).
If this item is speaking or writing: YOU decide judgment (agree | partial | rejected) from the WIDA framework job and the student's work.
`.trim();
var FEEDBACK_2020_SPEAKING_1_2 = `
Goal: this student should leave this item able to do what framework.language_functions describe at THIS level \u2014 not the next level.
Look at framework.language_functions and this prompt as the practice vehicle.
If the talk is still short of what these functions ask on this task, judgment = partial (or rejected if silent / off-task).
If the talk already shows they can do these functions on this task, judgment = agree.
`.trim();
var FEEDBACK_2020_SPEAKING_3_6 = `
Judge against the ACCESS speaking rubric, then framework.language_functions, task, picture facts, and transcript.
`.trim();

// src/lib/claude/standards/index.ts
var WIDA_FRAMEWORK_VERSION = "2020";
function frameworkPromptSlice(version = WIDA_FRAMEWORK_VERSION) {
  assertLiveFrameworkVersion(version);
  return FRAMEWORK_2020_PROMPT_SLICE;
}
function assertLiveFrameworkVersion(version) {
  if (version !== "2020") {
    throw new Error(
      `WIDA framework version "${version}" is not supported. Live paths use 2020 only.`
    );
  }
}

// src/lib/claude/prompts/content/one-photo-l12.ts
var ONE_PHOTO_L12 = `${ONE_PHOTO_L12_HEADER}

${LIBRARY_PHOTO_CORE}`.trim();

// src/lib/claude/prompts/content/framework-driven-content.ts
var FRAMEWORK_INTERPRETIVE_BUILD_ORDER = `
BUILD ORDER (listening / reading)
1. Job = framework.language_functions (+ language_expectations). Hardness = framework.pld + complexity_instruction.
2. Academic world = academic_unit, content_standards, tier3_vocabulary; scenario_example (if any) is tone-only \u2014 invent a new scene.
3. Choose question type(s) from available_question_formats that best assess the functions \u2014 not a fixed template per key use.
4. Questions test comprehension of language in the passage/audio \u2014 not memorized facts or photo labels alone.
`.trim();
var FRAMEWORK_EXPRESSIVE_BUILD_ORDER = `
BUILD ORDER (speaking / writing)
1. Job = framework.language_functions + key_language_use. Hardness = framework.pld + complexity_instruction.
2. Academic world = academic_unit, content_standards, tier3_vocabulary; scenario_example is tone-only \u2014 invent a new scene.
3. Choose prompt shape, scaffolds, response length, and formats from framework \u2014 not a fixed template per key use.
`.trim();
var FRAMEWORK_FORMAT_SELECTION = `
FORMAT SELECTION
\u2022 available_question_formats / available_prompt_types = UI-capable types \u2014 choose what best fits framework.language_functions.
\u2022 Vary formats across questions when several types fit equally well; do not default to one habit (e.g. agree/disagree only).
`.trim();

// src/lib/claude/prompts/content/listening-1-2.ts
var LISTENING_CONTENT_1_2 = `
DOMAIN: LISTENING  |  BAND: 1\u20132  |  student HEARS audio_script, then answers

${ONE_PHOTO_L12}

${FRAMEWORK_INTERPRETIVE_BUILD_ORDER}

${FRAMEWORK_FORMAT_SELECTION}

\u2022 Questions test language heard in audio_script \u2014 not objects visible only in the photo.
\u2022 Match oral_format and passage_sentence_target. explanation: max 8 words.
`.trim();

// src/lib/claude/prompts/content/listening-3-6.ts
var LISTENING_CONTENT_3_6 = `
DOMAIN: LISTENING  |  BAND: 3\u20136  |  student hears audio_script, then answers from the AUDIO

${FRAMEWORK_INTERPRETIVE_BUILD_ORDER}

${FRAMEWORK_FORMAT_SELECTION}

\u2022 Match oral_format and passage_sentence_target. Plain spoken English \u2014 no SSML or "as you can see".
\u2022 multiple_choice / agree_disagree: exactly 3 options. Foils = plausible mishearings of THIS audio. explanation: max 8 words on MC only.
\u2022 sequence_ordering, pair_matching, category_sorting: use interactive JSON (items/order, left/right/pairs, categories/items) \u2014 not options-only. Follow question_type_plan; vary types across questions.
\u2022 last_session_score < 70 \u2192 clearer signals, same skill. is_retry \u2192 new speaker/setting, same skill.
`.trim();

// src/lib/claude/prompts/content/reading-1-2.ts
var READING_CONTENT_1_2 = `
DOMAIN: READING  |  BAND: 1\u20132  |  student READS passage, then answers from THIS text

${ONE_PHOTO_L12}

${FRAMEWORK_INTERPRETIVE_BUILD_ORDER}

${FRAMEWORK_FORMAT_SELECTION}

\u2022 Passage = mini-story or informational text \u2014 stay under passage_word_max / text_format. Questions answerable from passage only. Vocabulary: 2\u20133 words from the passage.
`.trim();

// src/lib/claude/prompts/content/reading-3-6.ts
var READING_CONTENT_3_6 = `
DOMAIN: READING  |  BAND: 3\u20136  |  student READS this passage only

${FRAMEWORK_INTERPRETIVE_BUILD_ORDER}

${FRAMEWORK_FORMAT_SELECTION}

\u2022 Passage hardness from framework.pld, text_format, and passage_word_max.
\u2022 Foils = plausible misreadings of THIS passage. Vocabulary: 2\u20133 Tier-2 words from the passage.
`.trim();

// src/lib/claude/prompts/content/speaking-1-2.ts
var SPEAKING_CONTENT_1_2 = `
DOMAIN: SPEAKING  |  BAND: 1\u20132  |  student SPEAKS one short turn

${ONE_PHOTO_L12}

${FRAMEWORK_EXPRESSIVE_BUILD_ORDER}

${FRAMEWORK_FORMAT_SELECTION.replace("available_question_formats", "available_prompt_types")}

\u2022 You choose scaffold, response_length, and prompt shape from framework.pld.
\u2022 Pick prompt_type from available_prompt_types that fits framework.language_functions.
`.trim();

// src/lib/claude/prompts/content/speaking-3-6.ts
var SPEAKING_CONTENT_3_6 = `
DOMAIN: SPEAKING  |  BAND: 3\u20136  |  student SPEAKS a longer turn

${FRAMEWORK_EXPRESSIVE_BUILD_ORDER}

${FRAMEWORK_FORMAT_SELECTION.replace("available_question_formats", "available_prompt_types")}

\u2022 You choose response_length, scaffold, prompt shape, and target_seconds from framework.pld (typical_* user fields are hints only).
\u2022 Pick prompt_type from available_prompt_types based on framework.language_functions.
`.trim();

// src/lib/claude/prompts/content/writing.ts
var WRITING_BUILD_ORDER = `
BUILD ORDER
1. Job = framework.language_functions + key_language_use. Hardness = framework.pld + complexity_instruction.
2. You choose word_bank, sentence_frame, task_type, and min_sentences from framework.
3. SEPARATE FIELDS: prompt = job only; sentence_frame = starter only; word_bank = vocabulary only \u2014 never duplicate across fields.
`.trim();
var WRITING_CONTENT_NO_IMAGE = `
DOMAIN: WRITING  |  Grade 6\u20138  |  expressive

${LIBRARY_PHOTO_NO_LOOK}
\u2022 passage MUST be null. Write from academic_unit, content_standards, tier3_vocabulary.

${WRITING_BUILD_ORDER}
`.trim();
var WRITING_CONTENT_WITH_LIBRARY = `
DOMAIN: WRITING  |  Grade 6\u20138  |  expressive

${LIBRARY_PHOTO_CORE}
\u2022 Level 1\u20132: when library_candidates exist, MUST set selected_image_id \u2014 content is image-led.
\u2022 Level 3+: no library photo \u2014 write from unit + standards only.
\u2022 Pick selected_image_id FIRST from library_candidates, then compose passage, then prompt.
\u2022 passage follows passage_sentence_target when an image is selected; null when selected_image_id is null.

${WRITING_BUILD_ORDER}
`.trim();
function buildWritingContentSlice(hasLibraryCandidates) {
  const base = hasLibraryCandidates ? WRITING_CONTENT_WITH_LIBRARY : WRITING_CONTENT_NO_IMAGE;
  return `${base}

${LANGUAGE_FORMS_ACCURACY_FOR_CONTENT}`;
}

// src/lib/claude/prompts/content/system-prompt.ts
var DOMAIN_BAND_SLICES = {
  listening: { "1_2": LISTENING_CONTENT_1_2, "3_6": LISTENING_CONTENT_3_6 },
  reading: { "1_2": READING_CONTENT_1_2, "3_6": READING_CONTENT_3_6 },
  speaking: { "1_2": SPEAKING_CONTENT_1_2, "3_6": SPEAKING_CONTENT_3_6 }
};
function buildContentSystemPrompt(domain, level, schemaSection, opts = {}) {
  const band = contentBand(level);
  const domainSlice = domain === "writing" ? buildWritingContentSlice(opts.hasLibraryCandidates ?? false) : DOMAIN_BAND_SLICES[domain][band];
  const includeLineVisuals = opts.includeLineVisuals ?? (domain === "writing" ? level <= 2 : true);
  return buildSystemPrompt(
    CONTENT_KERNEL,
    frameworkPromptSlice("2020"),
    domainSlice,
    blockIf(includeLineVisuals, OPTIONAL_LINE_VISUALS_BLOCK),
    opts.academicContentLayer ?? "",
    blockIf(!!opts.hasLibraryImage, ACADEMIC_IMAGE_ANCHOR_EXAMPLES),
    ...opts.extraBlocks ?? [],
    schemaSection
  );
}

// src/lib/claude/dump-content-gen.ts
import fs from "node:fs";
import path3 from "node:path";
function prettyUser(userPrompt) {
  try {
    return JSON.stringify(JSON.parse(userPrompt), null, 2);
  } catch {
    return userPrompt;
  }
}
function dumpContentGenRequest(domain, systemPrompt, userPrompt) {
  const dir = path3.resolve(config.logging.dir);
  fs.mkdirSync(dir, { recursive: true });
  const body = [
    `captured_at: ${(/* @__PURE__ */ new Date()).toISOString()}`,
    `domain: ${domain}`,
    "",
    "======== SYSTEM (instructions) ========",
    systemPrompt,
    "",
    "======== USER (this session) ========",
    prettyUser(userPrompt),
    ""
  ].join("\n");
  const latest = path3.join(dir, "last-content-gen.txt");
  const named = path3.join(dir, `last-content-gen-${domain}.txt`);
  fs.writeFileSync(latest, body, "utf8");
  fs.writeFileSync(named, body, "utf8");
  logger.info(
    { file: latest, also: named, domain, systemChars: systemPrompt.length, userChars: userPrompt.length },
    "Wrote Claude content-gen request dump"
  );
}

// src/lib/practice-report.ts
function priorPracticeForGenerator(report) {
  if (!report) return void 0;
  return {
    from_last_session: true,
    score_pct: report.scorePct,
    interpretive_score_point: report.interpretiveScorePoint,
    meets_task: report.meetsTask,
    level: report.level,
    fractional_level: report.fractionalLevel ?? report.level,
    step_within_level: report.stepWithinLevel,
    key_use: report.keyUse,
    topic: report.topic,
    summary: report.summary,
    strengths: report.strengths,
    weaknesses: report.weaknesses,
    next_steps: report.nextSteps,
    coach: report.coachForNextSession,
    rule: "Helper only. Give a bit more practice on weaknesses. Do not change level, key language use, language functions, or PLD. If this report fights those, ignore it."
  };
}
function mergePriorPractice(user, report) {
  const prior = priorPracticeForGenerator(report);
  if (!prior) return user;
  return { ...user, prior_practice_report: prior };
}

// src/lib/content/session-content-schema.ts
var QUESTION_TYPE_REGISTRY = {
  multiple_choice: {
    type: "multiple_choice",
    label: "Multiple choice",
    ui: "multiple_choice",
    ai: {
      use: "Main idea, detail, inference, vocabulary, comparison, summary, claim/evidence",
      note: "3 options (listening) or 3\u20134 (reading); correct is 0-based index."
    },
    minLevel: 1,
    maxLevel: 6,
    domains: ["listening", "reading", "listening_l12"],
    requiredFields: ["question", "options", "correct"],
    optionalFields: ["option_diagrams", "visual", "explanation"]
  },
  image_grid: {
    type: "image_grid",
    label: "Picture choices",
    ui: "image_grid",
    ai: {
      use: "Listening \u2014 pick the picture that matches what was heard",
      note: "3 image options with labels; imageUrls populated server-side."
    },
    minLevel: 3,
    maxLevel: 6,
    domains: ["listening"],
    requiredFields: ["question", "options", "correct"],
    optionalFields: ["imageUrls", "explanation"]
  },
  sequence_ordering: {
    type: "sequence_ordering",
    label: "Put in order (listening)",
    ui: "sequence",
    ai: {
      use: "Narrate \u2014 event order; Inform \u2014 reported facts; Explain \u2014 process steps",
      note: "Interactive: items + correct_order. MC fallback: 3 order strings in options."
    },
    minLevel: 2,
    maxLevel: 6,
    domains: ["listening"],
    requiredFields: ["question"],
    optionalFields: ["items", "correct_order", "options", "correct", "explanation"]
  },
  sequence_order: {
    type: "sequence_order",
    label: "Put in order (reading)",
    ui: "sequence",
    ai: {
      use: "Story order, fact/report order, process steps from the passage",
      note: "items (scrambled) + correct_order where correct_order[i] = destination of items[i]."
    },
    minLevel: 2,
    maxLevel: 6,
    domains: ["reading"],
    requiredFields: ["question", "items", "correct_order"],
    optionalFields: ["explanation"]
  },
  pair_matching: {
    type: "pair_matching",
    label: "Match pairs (listening)",
    ui: "match",
    ai: {
      use: "Match terms to definitions, speakers to views, causes to effects",
      note: "Interactive: left_items + right_items + correct_pairs. MC fallback: matched strings in options."
    },
    minLevel: 3,
    maxLevel: 6,
    domains: ["listening"],
    requiredFields: ["question"],
    optionalFields: ["left_items", "right_items", "correct_pairs", "options", "correct", "explanation"]
  },
  match_columns: {
    type: "match_columns",
    label: "Match columns (reading)",
    ui: "match",
    ai: {
      use: "Word\u2013picture match (L1), cause\u2013effect, term\u2013definition from passage",
      note: "left + right (scrambled) + correct_pairs as [left_idx, right_idx]."
    },
    minLevel: 1,
    maxLevel: 6,
    domains: ["reading"],
    requiredFields: ["question", "left", "right", "correct_pairs"],
    optionalFields: ["explanation"]
  },
  agree_disagree: {
    type: "agree_disagree",
    label: "Agree or disagree",
    ui: "agree_disagree",
    ai: {
      use: "Evaluate a claim from audio/passage; distinguish claim from opinion",
      note: "MC: 3 options with Agree/Disagree reasons. Legacy: answer field agree|disagree."
    },
    minLevel: 1,
    maxLevel: 6,
    domains: ["listening", "reading"],
    requiredFields: ["question"],
    optionalFields: ["options", "correct", "answer", "visual", "explanation"]
  },
  category_sorting: {
    type: "category_sorting",
    label: "Sort into categories (listening)",
    ui: "classify",
    ai: {
      use: "Classify spoken items \u2014 cause vs effect, pros vs cons, step types",
      note: "Interactive: categories + items + correct_categories. MC fallback: grouping strings in options."
    },
    minLevel: 3,
    maxLevel: 6,
    domains: ["listening"],
    requiredFields: ["question"],
    optionalFields: ["categories", "items", "correct_categories", "options", "correct", "explanation"]
  },
  classify: {
    type: "classify",
    label: "Sort statements (reading)",
    ui: "classify",
    ai: {
      use: "Fact vs opinion, true vs false, pro vs con from the passage",
      note: "categories + items + correct (array: category index per item)."
    },
    minLevel: 1,
    maxLevel: 6,
    domains: ["reading"],
    requiredFields: ["question", "categories", "items", "correct"],
    optionalFields: ["explanation"]
  },
  object_detect: {
    type: "object_detect",
    label: "Tap object in scene",
    ui: "object_detect",
    ai: {
      use: "Teacher-provided scene \u2014 student taps the correct region",
      note: "Requires imageSrc + options labels; detection runs client-side."
    },
    minLevel: 3,
    maxLevel: 6,
    domains: ["listening", "reading"],
    requiredFields: ["question", "imageSrc", "options"],
    optionalFields: ["correct", "explanation"]
  },
  image_object_tap: {
    type: "image_object_tap",
    label: "Tap object in picture",
    ui: "image_object_tap",
    ai: {
      use: "L1\u20132 listening \u2014 tap the object named in the audio",
      note: "targetLabel must match DINO tags; options for text-choice fallback."
    },
    minLevel: 0,
    maxLevel: 2,
    domains: ["listening_l12"],
    requiredFields: ["question", "targetLabel"],
    optionalFields: ["options", "correct", "explanation"]
  },
  image_yes_no: {
    type: "image_yes_no",
    label: "Agree or disagree (picture)",
    ui: "image_yes_no",
    ai: {
      use: "L1\u20132 listening \u2014 agree/disagree with a statement about the photo",
      note: "correctAnswer is agree or disagree."
    },
    minLevel: 0,
    maxLevel: 2,
    domains: ["listening_l12"],
    requiredFields: ["question", "correctAnswer", "targetLabel"],
    optionalFields: ["explanation"]
  },
  image_explain_mc: {
    type: "image_explain_mc",
    label: "Picture multiple choice",
    ui: "multiple_choice",
    ai: {
      use: "L1\u20132 when box tap is unavailable \u2014 text choices about the photo",
      note: "Same shape as multiple_choice with targetLabel for coaching."
    },
    minLevel: 0,
    maxLevel: 2,
    domains: ["listening_l12"],
    requiredFields: ["question", "options", "correct", "targetLabel"],
    optionalFields: ["explanation"]
  }
};
var SPEAKING_PROMPT_TYPES = {
  wh_answer: { use: "Answer a who/what/where question about the prompt", note: "L1 \u2014 short phrase." },
  descriptive: { use: "Describe people, objects, or scenes", note: "Concrete details from prompt." },
  yes_no: { use: "Respond yes/no with brief support", note: "L1 only." },
  narrative: { use: "Retell or narrate events in order", note: "Story structure." },
  argumentative: { use: "State and support an opinion", note: "Claim + reason." },
  explanatory: { use: "Explain how or why something works", note: "Process or cause." },
  summary: { use: "Summarize main points", note: "Concise recap." },
  extended_report: { use: "Extended oral report with sections", note: "L5\u20136 only." }
};
var WRITING_TASK_TYPES = {
  sentence_completion: { use: "Complete frames or short sentences", note: "L1\u20132 with scaffolds." },
  paragraph: { use: "Single focused paragraph", note: "L2\u20133." },
  informational_essay: { use: "Inform/explain in organized paragraphs", note: "L4\u20135." },
  analytical_essay: { use: "Analyze evidence from sources", note: "L5\u20136 Argue/Explain." },
  opinion_piece: { use: "State and defend a position", note: "Argue key use." }
};
function listeningAvailableFormats(level) {
  const lv = Math.floor(level);
  if (lv <= 1) return ["multiple_choice", "agree_disagree"];
  if (lv === 2) return ["multiple_choice", "agree_disagree", "sequence_ordering"];
  return [
    "multiple_choice",
    "pair_matching",
    "sequence_ordering",
    "agree_disagree",
    "category_sorting"
  ];
}
function listeningL12AvailableFormats() {
  return ["image_object_tap", "image_yes_no", "image_explain_mc"];
}
function readingAvailableFormats(level) {
  const lv = Math.floor(level);
  if (lv <= 1) return ["multiple_choice", "match_columns", "classify"];
  if (lv === 2) return ["multiple_choice", "sequence_order", "classify"];
  return ["multiple_choice", "sequence_order", "match_columns", "classify"];
}
function speakingAvailablePromptTypes(level) {
  const lv = Math.floor(level);
  if (lv <= 1) return ["wh_answer", "descriptive", "yes_no"];
  if (lv === 2) return ["narrative", "descriptive", "argumentative", "wh_answer"];
  if (lv <= 4) return ["narrative", "descriptive", "explanatory", "argumentative", "summary"];
  return ["narrative", "descriptive", "explanatory", "argumentative", "summary", "extended_report"];
}
function formatsForDomain(domain, level) {
  if (domain === "listening_l12") return listeningL12AvailableFormats();
  if (domain === "listening") return listeningAvailableFormats(level);
  if (domain === "reading") return readingAvailableFormats(level);
  if (domain === "speaking") return speakingAvailablePromptTypes(level);
  return Object.keys(WRITING_TASK_TYPES);
}
function hasOptions(q) {
  return Array.isArray(q.options) && q.options.length > 0;
}
function hasSequenceShape(q) {
  return Array.isArray(q.items) && q.items.length > 0 && Array.isArray(q.correct_order) && q.correct_order.length > 0;
}
function hasMatchShape(q) {
  const left = q.left ?? q.left_items;
  const right = q.right ?? q.right_items;
  return Array.isArray(left) && left.length > 0 && Array.isArray(right) && right.length > 0 && Array.isArray(q.correct_pairs);
}
function hasClassifyShape(q) {
  const correct = q.correct_categories ?? q.correct;
  return Array.isArray(q.categories) && q.categories.length > 0 && Array.isArray(q.items) && q.items.length > 0 && Array.isArray(correct);
}
function resolveQuestionUi(domain, q) {
  const type = String(q.type ?? "");
  if (type === "image_grid") return "image_grid";
  if (type === "object_detect" && q.imageSrc) return "object_detect";
  if (type === "image_object_tap") return "image_object_tap";
  if (type === "image_yes_no") return "image_yes_no";
  if (type === "sequence_order" || type === "sequence_ordering") {
    return hasSequenceShape(q) ? "sequence" : hasOptions(q) ? "multiple_choice" : "unsupported";
  }
  if (type === "match_columns" || type === "pair_matching") {
    return hasMatchShape(q) ? "match" : hasOptions(q) ? "multiple_choice" : "unsupported";
  }
  if (type === "classify" || type === "category_sorting") {
    return hasClassifyShape(q) ? "classify" : hasOptions(q) ? "multiple_choice" : "unsupported";
  }
  if (type === "agree_disagree") {
    if (hasOptions(q)) return "multiple_choice";
    if (q.answer === "agree" || q.answer === "disagree") return "agree_disagree";
    return "multiple_choice";
  }
  if (type === "multiple_choice" || type === "image_explain_mc" || hasOptions(q)) {
    return "multiple_choice";
  }
  const def = QUESTION_TYPE_REGISTRY[type];
  if (def && formatsForDomain(domain === "listening_l12" ? "listening_l12" : domain, 6).includes(type)) {
    return def.ui;
  }
  return "unsupported";
}
function getAiFormatGuide(type) {
  return QUESTION_TYPE_REGISTRY[type]?.ai ?? SPEAKING_PROMPT_TYPES[type] ?? WRITING_TASK_TYPES[type];
}
function aiFormatDescriptionsFor(types) {
  const out = {};
  for (const t of types) {
    const guide = getAiFormatGuide(t);
    if (guide) out[t] = guide;
  }
  return out;
}
function validateQuestionShape(q) {
  const type = String(q.type ?? "");
  const def = QUESTION_TYPE_REGISTRY[type];
  const ui = resolveQuestionUi("listening", q);
  if (ui === "unsupported") {
    return { valid: false, ui, missingFields: ["type"] };
  }
  if (!def) {
    return { valid: true, ui, missingFields: [] };
  }
  const missing = [];
  for (const field of def.requiredFields) {
    if (field === "correct" && ui === "sequence" && hasSequenceShape(q)) continue;
    if (field === "options" && ui !== "multiple_choice" && ui !== "image_grid") continue;
    if (field === "items" && ui === "multiple_choice") continue;
    if (field === "correct_order" && ui === "multiple_choice") continue;
    if (field === "left" && hasMatchShape(q) === false && ui === "multiple_choice") continue;
    if (q[field] === void 0 || q[field] === null || q[field] === "") {
      missing.push(field);
    }
  }
  return { valid: missing.length === 0, ui, missingFields: missing };
}

// src/lib/choice-options.ts
function clampToOptions(options, correct, max) {
  const cleaned = (Array.isArray(options) ? options : []).map((o) => String(o ?? "").trim()).filter(Boolean);
  if (cleaned.length === 0) return { options: [], correct: 0 };
  let idx = typeof correct === "number" && Number.isFinite(correct) ? Math.trunc(correct) : 0;
  if (idx < 0 || idx >= cleaned.length) idx = 0;
  if (cleaned.length <= max) {
    return { options: cleaned.slice(0, max), correct: Math.min(idx, cleaned.length - 1) };
  }
  if (idx < max) {
    return { options: cleaned.slice(0, max), correct: idx };
  }
  const picked = [...cleaned.slice(0, max - 1), cleaned[idx]];
  return { options: picked, correct: max - 1 };
}
function clampToThreeOptions(options, correct) {
  return clampToOptions(options, correct, 3);
}

// src/lib/content/listening-question-pipeline.ts
var INTERACTIVE_DECLARED = /* @__PURE__ */ new Set([
  "sequence_order",
  "sequence_ordering",
  "match_columns",
  "pair_matching",
  "classify",
  "category_sorting"
]);
var INTERACTIVE_FORMATS = ["sequence_ordering", "pair_matching", "category_sorting"];
function buildListeningQuestionTypePlan(permittedFormats, questionCount, rotationSeed) {
  const permitted = [...new Set(permittedFormats.filter(Boolean))];
  if (permitted.length === 0) {
    return Array.from({ length: questionCount }, () => "multiple_choice");
  }
  const seed = (Math.floor(rotationSeed) % 997 + 997) % 997;
  const interactive = permitted.filter(
    (f) => INTERACTIVE_FORMATS.includes(f)
  );
  const nonMc = permitted.filter((f) => f !== "multiple_choice");
  const pool2 = [];
  if (questionCount >= 3 && interactive.length > 0) {
    for (let i = 0; i < interactive.length; i++) {
      pool2.push(interactive[(seed + i) % interactive.length]);
    }
  }
  for (const f of nonMc) {
    if (!pool2.includes(f)) pool2.push(f);
  }
  if (permitted.includes("multiple_choice") && !pool2.includes("multiple_choice")) {
    pool2.push("multiple_choice");
  }
  if (pool2.length === 0) pool2.push(permitted[seed % permitted.length] ?? "multiple_choice");
  const plan = [];
  for (let i = 0; i < questionCount; i++) {
    plan.push(pool2[(seed + i) % pool2.length] ?? pool2[0]);
  }
  const minDistinct = questionCount >= 2 && permitted.length >= 2 ? Math.min(2, questionCount, permitted.length) : 1;
  if (new Set(plan).size < minDistinct && pool2.length >= 2) {
    const alt = pool2.find((f) => f !== plan[0]) ?? pool2[1];
    if (questionCount > 1) plan[1] = alt;
  }
  return plan;
}
function normalizeListeningQuestionRaw(q) {
  const out = { ...q };
  const left = out.left ?? out.left_items;
  const right = out.right ?? out.right_items;
  if (left?.length) {
    out.left_items = left;
    out.left = left;
  }
  if (right?.length) {
    out.right_items = right;
    out.right = right;
  }
  if (out.type === "category_sorting" && !out.correct_categories && Array.isArray(out.correct)) {
    out.correct_categories = out.correct;
  }
  return out;
}
function mapListeningQuestionsFromClaude(raw) {
  return (raw ?? []).map((rawQ, i) => {
    const q = normalizeListeningQuestionRaw(rawQ);
    const type = String(q.type ?? "multiple_choice");
    const three = Array.isArray(q.options) ? clampToThreeOptions(q.options, q.correct) : { options: void 0, correct: q.correct };
    return {
      id: String(q.id ?? i + 1),
      type,
      question: toDisplayText(q.question ?? ""),
      visual: parseVisual(q.visual),
      optionDiagrams: parseOptionDiagrams(q.option_diagrams)?.slice(0, three.options?.length ?? 3),
      options: three.options,
      correct: three.correct,
      explanation: typeof q.explanation === "string" ? q.explanation : void 0,
      left_items: q.left_items ?? q.left,
      right_items: q.right_items ?? q.right,
      correct_pairs: q.correct_pairs,
      items: q.items,
      correct_order: q.correct_order,
      answer: q.answer,
      categories: q.categories,
      correct_categories: q.correct_categories ?? q.correct
    };
  });
}
function listeningQuestionMcFallback(q) {
  const declared = String(q.type ?? "");
  if (!INTERACTIVE_DECLARED.has(declared)) return false;
  const ui = resolveQuestionUi("listening", q);
  return ui === "multiple_choice";
}
function validateListeningSessionQuestions(questions, permittedFormats, questionCount) {
  const issues = [];
  if (questions.length !== questionCount) {
    issues.push(`Expected ${questionCount} questions, got ${questions.length}.`);
  }
  let mcFallbackCount = 0;
  const declaredTypes = /* @__PURE__ */ new Set();
  const resolvedUi = /* @__PURE__ */ new Set();
  questions.forEach((q, i) => {
    declaredTypes.add(q.type);
    const raw = q;
    const v = validateQuestionShape(raw);
    const ui = resolveQuestionUi("listening", raw);
    if (ui !== "unsupported") resolvedUi.add(ui);
    if (!permittedFormats.includes(q.type)) {
      issues.push(`Question ${i + 1}: type "${q.type}" not in permitted formats.`);
    }
    if (v.missingFields.length > 0 && INTERACTIVE_DECLARED.has(q.type)) {
      issues.push(
        `Question ${i + 1} (${q.type}): missing ${v.missingFields.join(", ")} \u2014 use interactive fields, not options-only.`
      );
    }
    if (listeningQuestionMcFallback(raw)) {
      mcFallbackCount += 1;
      issues.push(
        `Question ${i + 1}: type "${q.type}" fell back to multiple_choice \u2014 add required interactive fields.`
      );
    }
  });
  const permitted = new Set(permittedFormats);
  const interactivePermitted = [...permitted].filter((t) => INTERACTIVE_DECLARED.has(t));
  const minDistinct = questionCount >= 2 && permitted.size >= 2 ? Math.min(2, questionCount, permitted.size) : 1;
  if (declaredTypes.size < minDistinct) {
    issues.push(
      `Use at least ${minDistinct} different question type(s) from ${permittedFormats.join(", ")} \u2014 got ${[...declaredTypes].join(", ") || "none"}.`
    );
  }
  if (questionCount >= 3 && interactivePermitted.length > 0 && !questions.some((q) => INTERACTIVE_DECLARED.has(q.type))) {
    issues.push(
      `Include at least one interactive question (${interactivePermitted.join(" or ")}) when permitted.`
    );
  }
  const ok = issues.length === 0;
  return {
    ok,
    mcFallbackCount,
    distinctDeclaredTypes: declaredTypes.size,
    distinctResolvedUi: resolvedUi.size,
    issues
  };
}
function buildListeningQuestionsFixPrompt(payload, validation, permittedFormats, questionCount, questionTypePlan) {
  return JSON.stringify({
    task: "Fix ONLY the questions array. Keep audio_script, topic, and context unchanged.",
    permitted_formats: permittedFormats,
    question_count: questionCount,
    question_type_plan: questionTypePlan ?? buildListeningQuestionTypePlan(permittedFormats, questionCount, validation.distinctDeclaredTypes),
    validation_errors: validation.issues,
    rules: [
      `Match each question's "type" to question_type_plan[i] when possible \u2014 repair shapes, do not collapse all to multiple_choice.`,
      "sequence_ordering: items (3\u20135 strings) + correct_order (same length as items).",
      "pair_matching: left_items + right_items (scrambled) + correct_pairs [[leftIdx, rightIdx], ...].",
      "category_sorting: categories + items + correct_categories (one category index per item).",
      "multiple_choice / agree_disagree: exactly 3 options + correct index.",
      "Use at least two different question types when formats allow."
    ],
    current_content: payload,
    output: { questions: "[ ... fixed questions only ... ]" }
  });
}

// src/lib/claude/listening.ts
var LEVEL_MC_SKILLS = {
  3: ["main_idea", "detail", "vocabulary", "sequence", "comparison"],
  4: ["main_idea", "inference", "vocabulary", "comparison", "summary"],
  5: ["main_idea", "inference", "summary", "opposing_view", "vocabulary"],
  6: ["claim", "evidence", "inference", "summary", "opposing_view", "vocabulary"]
};
function buildListeningOutputSchema(level, availableFormats, questionCount, opts) {
  const mcSkills = LEVEL_MC_SKILLS[level] ?? ["main_idea", "detail", "vocabulary"];
  const FORMAT_DESCRIPTIONS = aiFormatDescriptionsFor(availableFormats);
  const lines = [
    `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`,
    `OUTPUT SCHEMA \u2014 LEVEL ${level}`,
    `Available question formats (UI-capable): ${availableFormats.join(" | ")}`,
    `Choose type(s) from this list that best assess framework.language_functions. Produce exactly ${questionCount} questions.`,
    questionCount >= 2 && availableFormats.length >= 2 ? `Use at least ${Math.min(2, questionCount)} different "type" values from the list \u2014 follow question_type_plan in user JSON when provided.` : "",
    questionCount >= 3 && availableFormats.some((f) => ["sequence_ordering", "pair_matching", "category_sorting"].includes(f)) ? `Include at least one interactive type (sequence_ordering, pair_matching, or category_sorting) when listed above.` : "",
    `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`,
    ``,
    `{`,
    `  "task_descriptor": "<echo 2\u20133 language_functions this session assesses>",`,
    ...opts?.libraryCompose ? [
      `  "selected_image_id": "<REQUIRED uuid from library_candidates \u2014 pick BEFORE writing audio_script>",`
    ] : [],
    `  "audio_script": "<spoken passage \u2014 plain English, no stage directions or SSML>",`,
    `  "topic": "<echo input topic>",`,
    `  "context": "<one sentence: who speaks and to whom \u2014 e.g. 'A science teacher explains to students'>",`,
    `  "format": "<primary format you chose for this session>",`,
    `  /* Echo the main question type used \u2014 must appear in available_question_formats */`,
    `  "questions": [`,
    ``
  ];
  const blocks = [];
  if (availableFormats.includes("multiple_choice")) {
    const d = FORMAT_DESCRIPTIONS.multiple_choice;
    blocks.push(
      `    /* \u2500\u2500 multiple_choice \u2500\u2500 */
    /* Use for: ${d.use} */
    /* ${d.note} */
    {
      "id": "1",
      "type": "multiple_choice",
      "question": "<question that tests the Can Do skill directly from the audio>",
      "options": ["<A>", "<B>", "<C>"],
      "option_diagrams": [null, null, null],
      "correct": 0,
      /* 0-based index of the correct option */
      "explanation": "<max 8 words stating why>"
    }
    /* Valid skill targets at Level ${level}: ${mcSkills.join(" | ")} */`
    );
  }
  if (availableFormats.includes("pair_matching")) {
    const d = FORMAT_DESCRIPTIONS.pair_matching;
    blocks.push(
      `    /* \u2500\u2500 pair_matching (interactive \u2014 NOT options-only) \u2500\u2500 */
    /* Use for: ${d.use} */
    /* ${d.note} */
    {
      "id": "2",
      "type": "pair_matching",
      "question": "<match terms from the audio to definitions or effects>",
      "left_items": ["<term A>", "<term B>"],
      "right_items": ["<match B>", "<match A>"],
      "correct_pairs": [[0, 1], [1, 0]]
    }`
    );
  }
  if (availableFormats.includes("sequence_ordering")) {
    const d = FORMAT_DESCRIPTIONS.sequence_ordering;
    blocks.push(
      `    /* \u2500\u2500 sequence_ordering (interactive \u2014 NOT options-only) \u2500\u2500 */
    /* Use for: ${d.use} */
    /* ${d.note} */
    {
      "id": "3",
      "type": "sequence_ordering",
      "question": "Put these steps or events in the correct order.",
      "items": ["<step B>", "<step A>", "<step C>"],
      "correct_order": [1, 0, 2]
    }`
    );
  }
  if (availableFormats.includes("agree_disagree")) {
    const d = FORMAT_DESCRIPTIONS.agree_disagree;
    blocks.push(
      `    /* \u2500\u2500 agree_disagree \u2500\u2500 */
    /* Use for: ${d.use} */
    /* ${d.note} */
    {
      "id": "4",
      "type": "agree_disagree",
      "question": "<present a claim from the audio and ask if the speaker agrees/disagrees \u2014 or ask student to evaluate it>",
      "options": [
        "Agree \u2014 <brief reason that matches what the speaker said>",
        "Disagree \u2014 <plausible but incorrect reason>",
        "Agree \u2014 <plausible but incorrect reason>"
      ],
      "correct": 0,
      "explanation": "<max 8 words>"
    }`
    );
  }
  if (availableFormats.includes("category_sorting")) {
    const d = FORMAT_DESCRIPTIONS.category_sorting;
    blocks.push(
      `    /* \u2500\u2500 category_sorting (interactive \u2014 NOT options-only) \u2500\u2500 */
    /* Use for: ${d.use} */
    /* ${d.note} */
    {
      "id": "5",
      "type": "category_sorting",
      "question": "Sort each idea into the correct group.",
      "categories": ["<Group A>", "<Group B>"],
      "items": ["<idea 1>", "<idea 2>", "<idea 3>"],
      "correct_categories": [0, 1, 0]
    }`
    );
  }
  lines.push(blocks.join(",\n\n"));
  lines.push(``);
  lines.push(`  ]`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`SCHEMA ENFORCEMENT RULES`);
  lines.push(`\u2022 Return every key above. Produce exactly ${questionCount} questions.`);
  lines.push(`\u2022 Each question "type" must be one of: ${availableFormats.join(", ")}.`);
  lines.push(`\u2022 Vary types across the session when formats allow.`);
  lines.push(`\u2022 multiple_choice / agree_disagree: exactly 3 options + "correct" (0-based index). "explanation" max 8 words on MC only.`);
  lines.push(`\u2022 sequence_ordering: MUST include "items" + "correct_order" \u2014 never options-only for this type.`);
  lines.push(`\u2022 pair_matching: MUST include "left_items" + "right_items" + "correct_pairs" \u2014 never options-only for this type.`);
  lines.push(`\u2022 category_sorting: MUST include "categories" + "items" + "correct_categories" \u2014 never options-only for this type.`);
  lines.push(`\u2022 If you cannot build a valid interactive shape, set "type" to "multiple_choice" instead of mis-labeling.`);
  lines.push(`\u2022 "audio_script" must be plain spoken English \u2014 no stage directions, SSML, or image references.`);
  lines.push(`\u2022 Students hear audio_script via TTS only \u2014 it is never shown as on-screen text; questions must be answerable from listening.`);
  lines.push(`\u2022 Do NOT include image_tags, imageUrls, or target_label in any field.`);
  if (opts?.libraryCompose) {
    lines.push(`\u2022 selected_image_id is REQUIRED when library_candidates exist \u2014 audio_script MUST match that photo's concept/tags.`);
    lines.push(`\u2022 Never write audio_script about a different topic than the selected photo shows.`);
  }
  return lines.filter((line) => line !== "").join("\n");
}
async function finalizeListeningQuestionsWithRetry(params) {
  const questionTypePlan = params.questionTypePlan ?? buildListeningQuestionTypePlan(
    params.permittedFormats,
    params.questionCount,
    params.varietySeed ?? 0
  );
  let mapped = mapListeningQuestionsFromClaude(params.rawQuestions);
  let validation = validateListeningSessionQuestions(
    mapped,
    params.permittedFormats,
    params.questionCount
  );
  if (validation.ok) return mapped;
  for (let attempt = 0; attempt < 2 && !validation.ok; attempt += 1) {
    logger.warn(
      { attempt: attempt + 1, issues: validation.issues, mcFallback: validation.mcFallbackCount },
      "listening questions validation failed \u2014 retrying shape fix"
    );
    try {
      const fixUser = buildListeningQuestionsFixPrompt(
        {
          audio_script: params.audioScript,
          topic: params.topic,
          context: params.context,
          questions: mapped
        },
        validation,
        params.permittedFormats,
        params.questionCount,
        questionTypePlan
      );
      const fixed = await callClaude(params.systemPrompt, fixUser, params.maxTokens);
      if (Array.isArray(fixed.questions) && fixed.questions.length > 0) {
        mapped = mapListeningQuestionsFromClaude(fixed.questions);
        validation = validateListeningSessionQuestions(
          mapped,
          params.permittedFormats,
          params.questionCount
        );
      }
    } catch (err) {
      logger.warn({ err, attempt: attempt + 1 }, "listening questions fix call failed");
      break;
    }
  }
  if (!validation.ok) {
    logger.warn(
      { issues: validation.issues, mcFallback: validation.mcFallbackCount },
      "listening questions still imperfect after fix \u2014 shipping best effort"
    );
  }
  return mapped;
}
function listeningGenerationVarietyFields(permittedFormats, questionCount, varietySeed) {
  return {
    varietySeed,
    questionTypePlan: buildListeningQuestionTypePlan(
      permittedFormats,
      questionCount,
      varietySeed
    )
  };
}
var FALLBACK_LISTENING = {
  audioScript: "Today in science class, Ms. Chen explained photosynthesis. She said plants use sunlight, water, and carbon dioxide to make their own food. This process produces oxygen, which animals need to breathe. That is why plants are so important for life on Earth.",
  topic: "Photosynthesis",
  context: "Science classroom lecture",
  questions: [
    {
      id: "1",
      type: "multiple_choice",
      question: "What are the three things plants need for photosynthesis?",
      options: [
        "Sunlight, water, carbon dioxide",
        "Sunlight, oxygen, nitrogen",
        "Water, soil, fertilizer"
      ],
      correct: 0,
      explanation: "Ms. Chen said plants need sunlight, water, and carbon dioxide."
    },
    {
      id: "2",
      type: "sequence_ordering",
      question: "Put these steps in the order Ms. Chen described.",
      items: [
        "Plants take in carbon dioxide",
        "Sunlight provides energy in the leaf",
        "Plants release oxygen"
      ],
      correct_order: [0, 1, 2]
    },
    {
      id: "3",
      type: "agree_disagree",
      question: "Plants are important because they produce oxygen animals need.",
      options: ["Agree", "Disagree", "Not in the audio"],
      correct: 0
    }
  ]
};
var LISTENING_FALLBACK_VARIANTS = [
  FALLBACK_LISTENING,
  {
    audioScript: "In social studies, Mr. Rivera described how a bill becomes a law. First, someone in Congress writes a bill. Next, committees review it and both houses vote. If both approve, the bill goes to the president, who can sign it or veto it.",
    topic: "How a bill becomes a law",
    context: "Social studies class",
    questions: [
      {
        id: "1",
        type: "sequence_ordering",
        question: "Order the steps Mr. Rivera gave.",
        items: [
          "Congress votes on the bill",
          "Someone writes a bill",
          "The president signs or vetoes it",
          "Committees review the bill"
        ],
        correct_order: [1, 3, 0, 2]
      },
      {
        id: "2",
        type: "multiple_choice",
        question: "What can the president do with a bill?",
        options: ["Sign it or veto it", "Rewrite it alone", "Skip the vote"],
        correct: 0
      },
      {
        id: "3",
        type: "pair_matching",
        question: "Match each step to who does it.",
        left_items: ["Writes the bill", "Votes on the bill", "Signs or vetoes"],
        right_items: ["Congress member", "Congress", "President"],
        correct_pairs: [[0, 0], [1, 1], [2, 2]]
      }
    ]
  },
  {
    audioScript: "The school nurse explained healthy habits: drink water, sleep eight hours, wash hands before eating. Sugary drinks can make you tired later. Exercise helps your heart and brain stay strong.",
    topic: "Healthy habits",
    context: "School nurse",
    questions: [
      {
        id: "1",
        type: "category_sorting",
        question: "Sort each habit.",
        categories: ["Healthy habit", "Avoid"],
        items: ["Drink water", "Sleep eight hours", "Many sugary drinks"],
        correct_categories: [0, 0, 1]
      },
      {
        id: "2",
        type: "multiple_choice",
        question: "Why did the nurse mention sugary drinks?",
        options: [
          "They can make you tired later",
          "They replace sleep",
          "They are required at lunch"
        ],
        correct: 0
      },
      {
        id: "3",
        type: "agree_disagree",
        question: "Exercise helps your heart and brain.",
        options: ["Agree", "Disagree", "Not in the audio"],
        correct: 0
      }
    ]
  }
];
function pickListeningFallback(varietySeed = 0) {
  const n = LISTENING_FALLBACK_VARIANTS.length;
  const idx = (Math.floor(varietySeed) % n + n) % n;
  return LISTENING_FALLBACK_VARIANTS[idx] ?? FALLBACK_LISTENING;
}
function buildListening2020SystemPrompt(level, opts = {}) {
  const clamped = Math.min(Math.max(level, 1), 6);
  return buildContentSystemPrompt("listening", clamped, opts.schemaSection ?? "", {
    academicContentLayer: opts.academicContentLayer,
    extraBlocks: opts.extraBlocks,
    hasLibraryImage: opts.hasLibraryImage ?? opts.hasLibraryCandidates,
    hasLibraryCandidates: opts.hasLibraryCandidates,
    includeLineVisuals: opts.includeLineVisuals
  });
}
async function generateListeningContent(params) {
  const clampedLevel = Math.min(Math.max(params.level, 3), 6);
  const questionCount = LEVEL_QUESTION_COUNT[clampedLevel] ?? 3;
  const passageSentenceTarget = PASSAGE_SENTENCE_TARGETS[clampedLevel] ?? PASSAGE_SENTENCE_TARGETS[3];
  const maxTokens = LEVEL_MAX_TOKENS[clampedLevel] ?? 1500;
  const varietySeed = params.varietySeed ?? 0;
  const { questionTypePlan } = listeningGenerationVarietyFields(
    params.permittedFormats,
    questionCount,
    varietySeed
  );
  const schemaSection = buildListeningOutputSchema(clampedLevel, params.permittedFormats, questionCount);
  const systemPrompt = buildListening2020SystemPrompt(clampedLevel, { schemaSection });
  const userPrompt = JSON.stringify(mergePriorPractice({
    domain: "listening",
    current_score: params.fractionalLevel,
    integer_level: params.level,
    step_within_level: params.stepWithinLevel,
    complexity_instruction: params.complexityInstruction,
    framework: serializeFrameworkTask(params.framework),
    goal: "Create one listening task so the student can practice understanding language at framework.pld (end of this integer level).",
    required_key_use: params.framework.key_language_use,
    oral_format: params.oralFormat,
    available_question_formats: params.permittedFormats,
    question_type_plan: questionTypePlan,
    topic: params.topic,
    is_retry: params.isRetry ?? false,
    last_session_score: params.lastSessionScore ?? null,
    question_count: questionCount,
    passage_sentence_target: passageSentenceTarget,
    has_library_image: params.hasLibraryImage ?? false
  }, params.priorPracticeReport));
  dumpContentGenRequest("listening", systemPrompt, userPrompt);
  try {
    const result = await callClaude(systemPrompt, userPrompt, maxTokens);
    const questions = await finalizeListeningQuestionsWithRetry({
      systemPrompt,
      maxTokens,
      permittedFormats: params.permittedFormats,
      questionCount,
      audioScript: toDisplayText(result.audio_script),
      topic: result.topic,
      context: result.context,
      rawQuestions: result.questions,
      questionTypePlan,
      varietySeed
    });
    const taskDescriptor = result.task_descriptor ?? result.can_do_descriptor ?? frameworkTaskDescriptor(params.framework);
    return {
      taskDescriptor,
      canDoDescriptor: taskDescriptor,
      framework: params.framework,
      audioScript: toDisplayText(result.audio_script),
      topic: result.topic,
      context: result.context,
      visual: parseVisual(result.visual),
      questions
    };
  } catch (err) {
    logger.error({ err }, "generateListeningContent failed, using fallback");
    return pickListeningFallback(varietySeed);
  }
}

// src/lib/academic/academicFrameworkContext.ts
function mathFrameworkFromUnit(unit) {
  const standards = unit.standards ?? [];
  return {
    unitId: unit.id,
    contentFramework: "CCSS-Math",
    contentStandards: standards,
    domainCode: unit.ccs,
    grade: unit.grade,
    contentGuidelines: `Align to CCSS domain ${unit.ccs} (${unit.unit}). Cover concepts from: ${standards.slice(0, 4).join(", ") || unit.ccs}. Invent a fresh unit-aligned situation; define tier-3 terms inline.`
  };
}
function scienceFrameworkFromUnit(unit) {
  const standards = unit.standards ?? [];
  return {
    unitId: unit.id,
    contentFramework: "NGSS",
    contentStandards: standards,
    domainCode: unit.ngssDomain,
    strand: unit.strand,
    practices: unit.practices,
    crosscuttingConcepts: unit.crosscuttingConcepts,
    contentGuidelines: `Align to NGSS ${unit.ngssDomain ?? unit.strand} \u2014 ${unit.unit}. Performance expectations: ${standards.slice(0, 3).join(", ") || "MS middle school"}. ` + (unit.practices?.length ? `Reflect practices: ${unit.practices.join("; ")}. ` : "") + "Teach the phenomenon in the passage; no prior knowledge required."
  };
}
function socialStudiesFrameworkFromUnit(unit) {
  const standards = unit.standards ?? [];
  return {
    unitId: unit.id,
    contentFramework: "C3",
    contentStandards: standards,
    domainCode: unit.c3Discipline,
    strand: unit.strand,
    inquiryDimensions: unit.inquiryDimensions,
    contentGuidelines: `Align to C3 ${unit.c3Discipline ?? unit.strand} \u2014 ${unit.unit}. Indicators: ${standards.slice(0, 3).join(", ") || "D2 middle grades"}. ` + (unit.inquiryDimensions?.length ? `Touch inquiry dimensions ${unit.inquiryDimensions.join(", ")} when natural. ` : "") + "Supply all historical/civic context in the passage."
  };
}
function elaFrameworkFromUnit(unit, genre) {
  const standards = unit.standards ?? [];
  const domains = unit.ccssDomains?.join("/") ?? "RL/RI/W/L";
  const genreLabel = genre ?? unit.primaryGenre;
  return {
    unitId: unit.id,
    contentFramework: "CCSS-ELA",
    contentStandards: standards,
    domainCode: domains,
    contentGuidelines: `Align to CCSS ELA ${domains} \u2014 ${unit.unit} (${genreLabel}). Standards: ${standards.slice(0, 4).join(", ") || domains}. Questions must come from THIS text only.`
  };
}
function serializeAcademicFrameworkForPrompt(fields) {
  return {
    content_framework: fields.contentFramework,
    content_standards: fields.contentStandards,
    content_guidelines: fields.contentGuidelines,
    unit_id: fields.unitId,
    ...fields.domainCode ? { domain_code: fields.domainCode } : {},
    ...fields.grade != null ? { grade: fields.grade } : {},
    ...fields.strand ? { strand: fields.strand } : {},
    ...fields.practices?.length ? { science_practices: fields.practices } : {},
    ...fields.crosscuttingConcepts?.length ? { crosscutting_concepts: fields.crosscuttingConcepts } : {},
    ...fields.inquiryDimensions?.length ? { c3_inquiry_dimensions: fields.inquiryDimensions } : {}
  };
}
function scenarioExamplesForPrompt(scenarios, max = 1) {
  const one = pickScenarioExampleForPrompt(scenarios);
  return one ? [one] : [];
}
function pickScenarioExampleForPrompt(scenarios) {
  if (!scenarios.length) return null;
  const copy = [...scenarios];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy[0]?.trim() || null;
}
var SCENARIO_EXAMPLES_NOTE = "scenario_example is tone-only \u2014 invent a new scene for academic_unit + content_standards; do not copy or paraphrase it.";
function academicPromptFieldsFromContext(ctx) {
  const fields = {};
  if (ctx.unit) fields.academic_unit = ctx.unit;
  const scenarioExample = pickScenarioExampleForPrompt(ctx.scenarioExamples ?? []);
  if (scenarioExample) {
    fields.scenario_example = scenarioExample;
    fields.scenario_examples_note = SCENARIO_EXAMPLES_NOTE;
  }
  if (ctx.tier3Vocabulary?.length) fields.tier3_vocabulary = ctx.tier3Vocabulary;
  if (ctx.genre) fields.genre = ctx.genre;
  if (ctx.contentFramework && ctx.contentStandards?.length) {
    Object.assign(fields, serializeAcademicFrameworkForPrompt(ctx));
  }
  return fields;
}

// src/lib/claude/academicListeningLibrary.ts
function buildAcademicListeningLibraryCurriculum(params) {
  return {
    unit: params.unit,
    topicLabel: params.topic,
    tier3Vocabulary: params.tier3Vocabulary,
    scenarioExamples: params.scenarioExamples
  };
}
function buildAcademicListeningLibraryPromptFields(params) {
  const prepared = prepareLibraryComposeSession(params.libraryCandidates, params.curriculum);
  const hasCompose = prepared.candidates.length > 0;
  const composeFields = hasCompose ? buildLibraryComposeUserFields({
    candidates: prepared.candidates,
    level: params.level,
    keyUse: params.keyUse,
    academicSubject: params.academicSubject,
    domainNote: params.domainNote,
    curriculumTopic: params.curriculum.topicLabel,
    academicUnit: params.curriculum.unit,
    composeMode: prepared.mode,
    lockedImageId: prepared.lockedImageId
  }) : {
    has_library_image: false,
    passage_sentence_target: params.passageSentenceTarget
  };
  const academicFields = hasCompose && prepared.suppressCurriculumScenarios ? academicPromptFieldsFromContext({
    unit: params.unitField.unit,
    tier3Vocabulary: params.unitField.tier3Vocabulary,
    ...params.frameworkContext
  }) : academicPromptFieldsFromContext({
    unit: params.unitField.unit,
    scenarioExamples: params.unitField.scenarioExamples,
    tier3Vocabulary: params.unitField.tier3Vocabulary,
    ...params.frameworkContext
  });
  return {
    prepared,
    fields: { ...composeFields, ...academicFields }
  };
}
function finalizeAcademicListeningLibraryResult(params) {
  const pool2 = params.prepared.candidates.length > 0 ? params.prepared.candidates : params.allCandidates;
  const selectedCandidate = pool2.length > 0 ? resolveWritingLibrarySelectionWithPolicy(
    params.rawSelectedId ?? params.prepared.lockedImageId,
    pool2,
    params.level,
    params.curriculum
  ) : null;
  let audioScript = params.audioScript;
  let selectedLibraryImageId = selectedCandidate?.id ?? null;
  if (selectedCandidate && detectLibraryContentMismatch(selectedCandidate, audioScript, params.curriculum)) {
    logger.warn(
      {
        imageId: selectedCandidate.id,
        concept: selectedCandidate.imageConcept,
        curriculumUnit: params.curriculum.unit,
        audioPreview: audioScript.slice(0, 120),
        generator: params.logLabel,
        composeMode: params.prepared.mode
      },
      "Listening audio may misalign with library photo \u2014 keeping AI audio_script unchanged"
    );
  }
  return { selectedLibraryImageId, audioScript };
}

// src/lib/claude/academic-math.ts
var FALLBACK_ACADEMIC_MATH = {
  audioScript: "Listen carefully. A grocery store sells apples for one dollar and fifty cents per pound. Maria wants to buy three pounds of apples and two pounds of bananas. Bananas cost eighty cents per pound. She wants to know the total cost before she gets to the register.",
  topic: "Mathematics \u2014 Grade 6: Ratios & Rates",
  context: "Teacher reading a word problem aloud to the class",
  questions: [
    {
      id: "1",
      type: "multiple_choice",
      question: "How much does one pound of apples cost?",
      options: ["$0.80", "$1.50", "$3.00"],
      correct: 1,
      explanation: "The audio says apples cost $1.50 per pound."
    },
    {
      id: "2",
      type: "multiple_choice",
      question: "What does Maria want to find out?",
      options: [
        "How many apples to buy",
        "The total cost of her purchase",
        "The price per banana"
      ],
      correct: 1,
      explanation: "She wants the total cost before checkout."
    },
    {
      id: "3",
      type: "multiple_choice",
      question: "How many pounds of bananas does Maria buy?",
      options: ["One pound", "Three pounds", "Two pounds"],
      correct: 2,
      explanation: "The audio says two pounds of bananas."
    }
  ]
};
async function generateAcademicMathListeningContent(params) {
  const { questionCount, passageSentenceTarget, maxTokens } = academicSessionScale(params.level);
  const availableFormats = params.permittedFormats.length > 0 ? params.permittedFormats : listeningAvailableFormats(params.level);
  const { questionTypePlan, varietySeed } = listeningGenerationVarietyFields(
    availableFormats,
    questionCount,
    params.varietySeed ?? 0
  );
  const libraryCandidates = params.libraryCandidates ?? [];
  const curriculum = buildAcademicListeningLibraryCurriculum({
    unit: params.mathUnit,
    topic: params.topic,
    tier3Vocabulary: params.tier3Vocabulary,
    scenarioExamples: params.scenarioExamples
  });
  const { prepared, fields: libraryPromptFields } = buildAcademicListeningLibraryPromptFields({
    libraryCandidates,
    level: params.level,
    keyUse: params.framework.key_language_use,
    academicSubject: "math",
    domainNote: LIBRARY_IMAGE_LISTENING_EXTRA,
    curriculum,
    passageSentenceTarget,
    frameworkContext: params.frameworkContext,
    unitField: {
      unit: params.mathUnit,
      scenarioExamples: params.scenarioExamples,
      tier3Vocabulary: params.tier3Vocabulary
    }
  });
  const hasLibraryCandidates = prepared.candidates.length > 0;
  const schemaSection = buildListeningOutputSchema(
    params.level,
    availableFormats,
    questionCount,
    { libraryCompose: hasLibraryCandidates }
  );
  const systemPrompt = buildListening2020SystemPrompt(params.level, {
    academicContentLayer: MATH_SUBJECT_BLOCK,
    extraBlocks: [
      "Academic math listening: test whether the student understood the mathematical language and situation \u2014 not computation."
    ],
    hasLibraryCandidates,
    schemaSection
  });
  const prompt = JSON.stringify(mergePriorPractice({
    domain: "listening",
    integer_level: params.level,
    step_within_level: params.stepWithinLevel,
    complexity_instruction: params.complexityInstruction,
    framework: serializeFrameworkTask(params.framework),
    goal: "Create one math listening task so the student can practice understanding language at framework.pld.",
    required_key_use: params.framework.key_language_use,
    oral_format: params.oralFormat,
    math_unit: params.mathUnit,
    tier3_vocabulary: params.tier3Vocabulary,
    topic: params.topic,
    is_retry: params.isRetry ?? false,
    last_session_score: params.lastSessionScore ?? null,
    question_count: questionCount,
    available_question_formats: availableFormats,
    question_type_plan: questionTypePlan,
    ...libraryPromptFields
  }, params.priorPracticeReport));
  dumpContentGenRequest("academic-math", systemPrompt, prompt);
  try {
    const result = await callClaude(systemPrompt, prompt, maxTokens);
    const taskDescriptor = frameworkTaskDescriptor(params.framework);
    const rawSelectedId = typeof result.selected_image_id === "string" ? result.selected_image_id.trim() : null;
    const finalized = finalizeAcademicListeningLibraryResult({
      rawSelectedId,
      audioScript: toDisplayText(result.audio_script),
      prepared,
      allCandidates: libraryCandidates,
      curriculum,
      level: params.level,
      keyUse: params.framework.key_language_use,
      logLabel: "academic-math"
    });
    return {
      taskDescriptor,
      canDoDescriptor: taskDescriptor,
      framework: params.framework,
      selectedLibraryImageId: finalized.selectedLibraryImageId,
      audioScript: finalized.audioScript,
      topic: result.topic ?? params.topic,
      context: result.context ?? "Teacher reading a word problem aloud to the class",
      visual: parseVisual(result.visual),
      questions: await finalizeListeningQuestionsWithRetry({
        systemPrompt,
        maxTokens,
        permittedFormats: availableFormats,
        questionCount,
        audioScript: finalized.audioScript,
        topic: result.topic ?? params.topic,
        context: result.context ?? "Teacher reading a word problem aloud to the class",
        rawQuestions: result.questions,
        questionTypePlan,
        varietySeed
      })
    };
  } catch (err) {
    logger.error({ err }, "academic math listening generation failed, using fallback");
    return FALLBACK_ACADEMIC_MATH;
  }
}

// src/lib/claude/academic-science.ts
var FALLBACK_ACADEMIC_SCIENCE = {
  audioScript: "Today we are going to look at how plants make their own food. This process is called photosynthesis \u2014 which means 'putting together with light.' A plant takes in three things: sunlight from the sky, water from the soil through its roots, and carbon dioxide from the air through tiny openings in its leaves. Inside the leaf, cells use the energy from sunlight to combine the water and carbon dioxide and turn them into sugar. The plant uses that sugar as food to grow. As a result, the plant releases oxygen into the air \u2014 and that is the oxygen that we breathe.",
  topic: "Science \u2014 Life Science: Cells",
  context: "Teacher explaining a science concept to the class",
  questions: [
    {
      id: "1",
      type: "multiple_choice",
      question: "According to the teacher, what three things does a plant need for photosynthesis?",
      options: [
        "Sunlight, water, and carbon dioxide",
        "Sunlight, oxygen, and soil",
        "Water, nitrogen, and carbon dioxide"
      ],
      correct: 0,
      explanation: "The audio names sunlight, water, and carbon dioxide."
    },
    {
      id: "2",
      type: "multiple_choice",
      question: "What does the teacher say the plant releases as a result of photosynthesis?",
      options: ["Carbon dioxide", "Sugar", "Oxygen"],
      correct: 2,
      explanation: "The audio says the plant releases oxygen."
    },
    {
      id: "3",
      type: "multiple_choice",
      question: "What does 'photosynthesis' mean according to the teacher?",
      options: [
        "Making food from soil",
        "Putting together with light",
        "Taking in oxygen"
      ],
      correct: 1,
      explanation: "The teacher defines it as 'putting together with light.'"
    }
  ]
};
async function generateAcademicScienceListeningContent(params) {
  const { questionCount, passageSentenceTarget, maxTokens } = academicSessionScale(params.level);
  const availableFormats = params.permittedFormats.length > 0 ? params.permittedFormats : listeningAvailableFormats(params.level);
  const { questionTypePlan, varietySeed } = listeningGenerationVarietyFields(
    availableFormats,
    questionCount,
    params.varietySeed ?? 0
  );
  const libraryCandidates = params.libraryCandidates ?? [];
  const curriculum = buildAcademicListeningLibraryCurriculum({
    unit: params.scienceUnit,
    topic: params.topic,
    tier3Vocabulary: params.tier3Vocabulary,
    scenarioExamples: params.scenarioExamples
  });
  const { prepared, fields: libraryPromptFields } = buildAcademicListeningLibraryPromptFields({
    libraryCandidates,
    level: params.level,
    keyUse: params.framework.key_language_use,
    academicSubject: "science",
    domainNote: LIBRARY_IMAGE_LISTENING_EXTRA,
    curriculum,
    passageSentenceTarget,
    frameworkContext: params.frameworkContext,
    unitField: {
      unit: params.scienceUnit,
      scenarioExamples: params.scenarioExamples,
      tier3Vocabulary: params.tier3Vocabulary
    }
  });
  const hasLibraryCandidates = prepared.candidates.length > 0;
  const schemaSection = buildListeningOutputSchema(
    params.level,
    availableFormats,
    questionCount,
    { libraryCompose: hasLibraryCandidates }
  );
  const systemPrompt = buildListening2020SystemPrompt(params.level, {
    academicContentLayer: SCIENCE_SUBJECT_BLOCK,
    extraBlocks: [
      "Academic science listening: test scientific language and reasoning \u2014 not memorized facts."
    ],
    hasLibraryCandidates,
    schemaSection
  });
  const prompt = JSON.stringify(mergePriorPractice({
    domain: "listening",
    integer_level: params.level,
    step_within_level: params.stepWithinLevel,
    complexity_instruction: params.complexityInstruction,
    framework: serializeFrameworkTask(params.framework),
    goal: "Create one science listening task so the student can practice understanding language at framework.pld.",
    required_key_use: params.framework.key_language_use,
    oral_format: params.oralFormat,
    science_unit: params.scienceUnit,
    science_strand: params.scienceStrand,
    tier3_vocabulary: params.tier3Vocabulary,
    topic: params.topic,
    is_retry: params.isRetry ?? false,
    last_session_score: params.lastSessionScore ?? null,
    question_count: questionCount,
    available_question_formats: availableFormats,
    question_type_plan: questionTypePlan,
    ...libraryPromptFields
  }, params.priorPracticeReport));
  dumpContentGenRequest("academic-science", systemPrompt, prompt);
  try {
    const result = await callClaude(systemPrompt, prompt, maxTokens);
    const taskDescriptor = frameworkTaskDescriptor(params.framework);
    const rawSelectedId = typeof result.selected_image_id === "string" ? result.selected_image_id.trim() : null;
    const finalized = finalizeAcademicListeningLibraryResult({
      rawSelectedId,
      audioScript: toDisplayText(result.audio_script),
      prepared,
      allCandidates: libraryCandidates,
      curriculum,
      level: params.level,
      keyUse: params.framework.key_language_use,
      logLabel: "academic-science"
    });
    return {
      taskDescriptor,
      canDoDescriptor: taskDescriptor,
      framework: params.framework,
      selectedLibraryImageId: finalized.selectedLibraryImageId,
      audioScript: finalized.audioScript,
      topic: result.topic ?? params.topic,
      context: result.context ?? "Teacher explaining a science concept to the class",
      visual: parseVisual(result.visual),
      questions: await finalizeListeningQuestionsWithRetry({
        systemPrompt,
        maxTokens,
        permittedFormats: availableFormats,
        questionCount,
        audioScript: finalized.audioScript,
        topic: result.topic ?? params.topic,
        context: result.context ?? "Teacher explaining a science concept to the class",
        rawQuestions: result.questions,
        questionTypePlan,
        varietySeed
      })
    };
  } catch (err) {
    logger.error({ err }, "academic science listening generation failed, using fallback");
    return FALLBACK_ACADEMIC_SCIENCE;
  }
}

// src/lib/claude/academic-social-studies.ts
var FALLBACK_ACADEMIC_SOCIAL_STUDIES = {
  audioScript: "Today we are going to look at a turning point in American history. In seventeen seventy-three, a group of colonists in Boston decided they had had enough. The British government had passed a law called the Tea Act, which required colonists to pay a tax on tea \u2014 but the colonists had no representatives in the British Parliament. Their rallying cry became 'no taxation without representation.' On the night of December sixteenth, a group of colonists disguised as Mohawk Indians boarded three British ships in Boston Harbor and dumped three hundred and forty-two chests of tea into the water. This event became known as the Boston Tea Party.",
  topic: "U.S. History \u2014 The Road to Revolution",
  context: "Teacher narrating a historical event to the class",
  questions: [
    {
      id: "1",
      type: "multiple_choice",
      question: "According to the teacher, what was the Tea Act?",
      options: [
        "A law allowing colonists to grow tea",
        "A law requiring colonists to pay a tax on tea",
        "A trade agreement with the Mohawk Indians"
      ],
      correct: 1,
      explanation: "The audio says the Tea Act required colonists to pay a tax on tea."
    },
    {
      id: "2",
      type: "multiple_choice",
      question: "What does 'no taxation without representation' mean in this passage?",
      options: [
        "Colonists did not want to pay any taxes",
        "Colonists wanted to be represented in Parliament before being taxed",
        "The Mohawk Indians refused to pay taxes"
      ],
      correct: 1,
      explanation: "The passage explains colonists had no representatives in Parliament."
    },
    {
      id: "3",
      type: "multiple_choice",
      question: "What did the colonists do on the night of December sixteenth?",
      options: [
        "They attacked British soldiers",
        "They wrote a letter to the King",
        "They dumped chests of tea into the harbor"
      ],
      correct: 2,
      explanation: "The audio says they dumped three hundred and forty-two chests of tea."
    }
  ]
};
async function generateAcademicSocialStudiesListeningContent(params) {
  const { questionCount, passageSentenceTarget, maxTokens } = academicSessionScale(params.level);
  const availableFormats = params.permittedFormats.length > 0 ? params.permittedFormats : listeningAvailableFormats(params.level);
  const { questionTypePlan, varietySeed } = listeningGenerationVarietyFields(
    availableFormats,
    questionCount,
    params.varietySeed ?? 0
  );
  const libraryCandidates = params.libraryCandidates ?? [];
  const curriculum = buildAcademicListeningLibraryCurriculum({
    unit: params.ssUnit,
    topic: params.topic,
    tier3Vocabulary: params.tier3Vocabulary,
    scenarioExamples: params.scenarioExamples
  });
  const { prepared, fields: libraryPromptFields } = buildAcademicListeningLibraryPromptFields({
    libraryCandidates,
    level: params.level,
    keyUse: params.framework.key_language_use,
    academicSubject: "social_studies",
    domainNote: LIBRARY_IMAGE_LISTENING_EXTRA,
    curriculum,
    passageSentenceTarget,
    frameworkContext: params.frameworkContext,
    unitField: {
      unit: params.ssUnit,
      scenarioExamples: params.scenarioExamples,
      tier3Vocabulary: params.tier3Vocabulary
    }
  });
  const hasLibraryCandidates = prepared.candidates.length > 0;
  const schemaSection = buildListeningOutputSchema(
    params.level,
    availableFormats,
    questionCount,
    { libraryCompose: hasLibraryCandidates }
  );
  const systemPrompt = buildListening2020SystemPrompt(params.level, {
    academicContentLayer: SOCIAL_STUDIES_SUBJECT_BLOCK,
    extraBlocks: [
      "Academic social studies listening: test historical and civic language \u2014 not memorized facts."
    ],
    hasLibraryCandidates,
    schemaSection
  });
  const prompt = JSON.stringify(mergePriorPractice({
    domain: "listening",
    integer_level: params.level,
    step_within_level: params.stepWithinLevel,
    complexity_instruction: params.complexityInstruction,
    framework: serializeFrameworkTask(params.framework),
    goal: "Create one social studies listening task so the student can practice understanding language at framework.pld.",
    required_key_use: params.framework.key_language_use,
    oral_format: params.oralFormat,
    ss_unit: params.ssUnit,
    ss_strand: params.ssStrand,
    tier3_vocabulary: params.tier3Vocabulary,
    topic: params.topic,
    is_retry: params.isRetry ?? false,
    last_session_score: params.lastSessionScore ?? null,
    question_count: questionCount,
    available_question_formats: availableFormats,
    question_type_plan: questionTypePlan,
    ...libraryPromptFields,
    ...params.ssStrand ? { strand: params.ssStrand } : {}
  }, params.priorPracticeReport));
  dumpContentGenRequest("academic-social-studies", systemPrompt, prompt);
  try {
    const result = await callClaude(systemPrompt, prompt, maxTokens);
    const taskDescriptor = frameworkTaskDescriptor(params.framework);
    const rawSelectedId = typeof result.selected_image_id === "string" ? result.selected_image_id.trim() : null;
    const finalized = finalizeAcademicListeningLibraryResult({
      rawSelectedId,
      audioScript: toDisplayText(result.audio_script),
      prepared,
      allCandidates: libraryCandidates,
      curriculum,
      level: params.level,
      keyUse: params.framework.key_language_use,
      logLabel: "academic-social-studies"
    });
    return {
      taskDescriptor,
      canDoDescriptor: taskDescriptor,
      framework: params.framework,
      selectedLibraryImageId: finalized.selectedLibraryImageId,
      audioScript: finalized.audioScript,
      topic: result.topic ?? params.topic,
      context: result.context ?? "Teacher narrating a historical event or social studies concept to the class",
      visual: parseVisual(result.visual),
      questions: await finalizeListeningQuestionsWithRetry({
        systemPrompt,
        maxTokens,
        permittedFormats: availableFormats,
        questionCount,
        audioScript: finalized.audioScript,
        topic: result.topic ?? params.topic,
        context: result.context ?? "Teacher narrating a historical event or social studies concept to the class",
        rawQuestions: result.questions,
        questionTypePlan,
        varietySeed
      })
    };
  } catch (err) {
    logger.error({ err }, "academic social studies listening generation failed, using fallback");
    return FALLBACK_ACADEMIC_SOCIAL_STUDIES;
  }
}

// src/lib/claude/academic-ela.ts
var FALLBACK_ACADEMIC_ELA = {
  audioScript: "Listen to this short story. Maya walked into the school library and stopped. Every shelf was empty \u2014 the books were gone. Her heart sank. She loved this library more than any place at school. A note on the librarian's desk read: 'Books moved to Room 204 for renovation. Back in two weeks.' Maya smiled with relief. She grabbed her backpack and headed to Room 204.",
  topic: "ELA \u2014 Grade 6\u20138: Narrative Structure",
  context: "Teacher reading a short story excerpt to the class",
  questions: [
    {
      id: "1",
      type: "multiple_choice",
      question: "Why did Maya stop when she walked into the library?",
      options: [
        "The library was closed",
        "The shelves were empty",
        "She forgot her backpack"
      ],
      correct: 1,
      explanation: "The passage says every shelf was empty."
    },
    {
      id: "2",
      type: "multiple_choice",
      question: "How did Maya feel when she first saw the empty shelves?",
      options: ["Confused", "Angry", "Sad"],
      correct: 2,
      explanation: "The passage says 'her heart sank.'"
    },
    {
      id: "3",
      type: "multiple_choice",
      question: "What does 'her heart sank' tell us about Maya's feeling?",
      options: [
        "She felt surprised",
        "She felt disappointed",
        "She felt scared"
      ],
      correct: 1,
      explanation: "Heart sank means she felt disappointed."
    }
  ]
};
async function generateAcademicElaListeningContent(params) {
  const { questionCount, passageSentenceTarget, maxTokens } = academicSessionScale(params.level);
  const availableFormats = params.permittedFormats.length > 0 ? params.permittedFormats : listeningAvailableFormats(params.level);
  const { questionTypePlan, varietySeed } = listeningGenerationVarietyFields(
    availableFormats,
    questionCount,
    params.varietySeed ?? 0
  );
  const libraryCandidates = params.libraryCandidates ?? [];
  const curriculum = buildAcademicListeningLibraryCurriculum({
    unit: params.elaUnit,
    topic: params.topic,
    tier3Vocabulary: params.tier3Vocabulary,
    scenarioExamples: params.scenarioExamples
  });
  const { prepared, fields: libraryPromptFields } = buildAcademicListeningLibraryPromptFields({
    libraryCandidates,
    level: params.level,
    keyUse: params.framework.key_language_use,
    academicSubject: "ela",
    domainNote: LIBRARY_IMAGE_LISTENING_EXTRA,
    curriculum,
    passageSentenceTarget,
    frameworkContext: params.frameworkContext,
    unitField: {
      unit: params.elaUnit,
      scenarioExamples: params.scenarioExamples,
      tier3Vocabulary: params.tier3Vocabulary
    }
  });
  const hasLibraryCandidates = prepared.candidates.length > 0;
  const schemaSection = buildListeningOutputSchema(
    params.level,
    availableFormats,
    questionCount,
    { libraryCompose: hasLibraryCandidates }
  );
  const systemPrompt = buildListening2020SystemPrompt(params.level, {
    academicContentLayer: ELA_SUBJECT_BLOCK,
    extraBlocks: [
      "Academic ELA listening: test textual language \u2014 not prior ELA knowledge."
    ],
    hasLibraryCandidates,
    schemaSection
  });
  const prompt = JSON.stringify(mergePriorPractice({
    domain: "listening",
    integer_level: params.level,
    step_within_level: params.stepWithinLevel,
    complexity_instruction: params.complexityInstruction,
    framework: serializeFrameworkTask(params.framework),
    goal: "Create one ELA listening task so the student can practice understanding language at framework.pld.",
    required_key_use: params.framework.key_language_use,
    oral_format: params.oralFormat,
    ela_unit: params.elaUnit,
    ela_genre: params.elaGenre,
    tier3_vocabulary: params.tier3Vocabulary,
    topic: params.topic,
    is_retry: params.isRetry ?? false,
    last_session_score: params.lastSessionScore ?? null,
    question_count: questionCount,
    available_question_formats: availableFormats,
    question_type_plan: questionTypePlan,
    ...libraryPromptFields,
    ...params.elaGenre ? { genre: params.elaGenre } : {}
  }, params.priorPracticeReport));
  dumpContentGenRequest("academic-ela", systemPrompt, prompt);
  try {
    const result = await callClaude(systemPrompt, prompt, maxTokens);
    const taskDescriptor = frameworkTaskDescriptor(params.framework);
    const rawSelectedId = typeof result.selected_image_id === "string" ? result.selected_image_id.trim() : null;
    const finalized = finalizeAcademicListeningLibraryResult({
      rawSelectedId,
      audioScript: toDisplayText(result.audio_script),
      prepared,
      allCandidates: libraryCandidates,
      curriculum,
      level: params.level,
      keyUse: params.framework.key_language_use,
      logLabel: "academic-ela"
    });
    return {
      taskDescriptor,
      canDoDescriptor: taskDescriptor,
      framework: params.framework,
      selectedLibraryImageId: finalized.selectedLibraryImageId,
      audioScript: finalized.audioScript,
      topic: result.topic ?? params.topic,
      context: result.context ?? "Teacher reading a text aloud to the class",
      visual: parseVisual(result.visual),
      questions: await finalizeListeningQuestionsWithRetry({
        systemPrompt,
        maxTokens,
        permittedFormats: availableFormats,
        questionCount,
        audioScript: finalized.audioScript,
        topic: result.topic ?? params.topic,
        context: result.context ?? "Teacher reading a text aloud to the class",
        rawQuestions: result.questions,
        questionTypePlan,
        varietySeed
      })
    };
  } catch (err) {
    logger.error({ err }, "academic ELA listening generation failed, using fallback");
    return FALLBACK_ACADEMIC_ELA;
  }
}

// src/data/academicMathCurriculum.json
var academicMathCurriculum_default = {
  subject: "mathematics",
  framework: "Common Core State Standards for Mathematics",
  frameworkRef: "https://www.corestandards.org/Math/",
  gradeBand: "6-8",
  description: "CCSS Grade 6\u20138 mathematics \u2014 real-world word problem scenarios organized by grade and domain. Each unit maps to CCSS domain codes and representative performance expectations (standards). Tier-3 vocabulary is scaled to WIDA levels 3\u20136.",
  units: [
    {
      id: "g6_ratios",
      grade: 6,
      unit: "Ratios & Proportional Relationships",
      ccs: "6.RP",
      standards: ["6.RP.A.1", "6.RP.A.2", "6.RP.A.3", "6.RP.A.3a", "6.RP.A.3b", "6.RP.A.3c", "6.RP.A.3d"],
      tier3ByLevel: {
        "3": ["ratio", "rate", "unit rate", "equivalent", "per"],
        "4": ["ratio", "rate", "unit rate", "percent", "proportion", "equivalent ratio"],
        "5": ["ratio", "proportional", "unit rate", "percent", "equivalent ratio", "scale factor"],
        "6": ["ratio", "proportional relationship", "unit rate", "percent", "proportion", "scale factor", "constant ratio"]
      },
      scenarios: [
        "A grocery store sells apples at a fixed price per pound. A shopper wants to buy different amounts and compare costs.",
        "Two students are making lemonade using different amounts of lemon juice and water, and they want to know whose recipe is stronger.",
        "A car travels at a constant speed on the highway, and the driver tracks how far it goes over several hours.",
        "A baker uses a recipe that calls for ingredients in a specific ratio and needs to adjust it to make a larger batch.",
        "A store is offering a 25% discount on shoes, and a customer wants to figure out the sale price.",
        "Two runners are training at different speeds, and a coach compares how long each takes to finish the same route."
      ]
    },
    {
      id: "g6_fractions",
      grade: 6,
      unit: "Division of Fractions & Number Systems",
      ccs: "6.NS.A",
      standards: ["6.NS.A.1"],
      tier3ByLevel: {
        "3": ["fraction", "divide", "half", "whole", "equal"],
        "4": ["fraction", "divide", "mixed number", "quotient", "rational number"],
        "5": ["fraction", "divide", "mixed number", "quotient", "rational number", "reciprocal"],
        "6": ["fraction", "divide", "rational number", "quotient", "reciprocal", "integer", "absolute value"]
      },
      scenarios: [
        "A cook has a large container of flour and needs to divide it equally among several smaller bags for a bake sale.",
        "A student is cutting a ribbon into equal pieces for a school project and needs to figure out how many pieces she can make.",
        "A family is sharing a pizza equally among several children, and one child wants to know how much each person gets.",
        "A construction worker has a board of lumber and cuts it into equal sections for a fence project."
      ]
    },
    {
      id: "g6_rational_numbers",
      grade: 6,
      unit: "Rational Numbers & the Number Line",
      ccs: "6.NS.C",
      standards: ["6.NS.C.5", "6.NS.C.6", "6.NS.C.6a", "6.NS.C.6b", "6.NS.C.6c", "6.NS.C.7", "6.NS.C.8"],
      tier3ByLevel: {
        "3": ["negative", "below zero", "number line", "above", "below"],
        "4": ["negative number", "integer", "number line", "opposite", "absolute value"],
        "5": ["negative number", "integer", "absolute value", "rational number", "coordinate", "opposite"],
        "6": ["negative number", "integer", "absolute value", "rational number", "coordinate plane", "quadrant", "opposite values"]
      },
      scenarios: [
        "A scientist measures the temperature inside a freezer, which drops several degrees below zero overnight.",
        "A diver starts at the surface of the ocean and descends to different depths to observe sea life.",
        "A bank account starts with some money, and then the owner makes several deposits and withdrawals over the week.",
        "A city records the highest and lowest temperatures during a cold week in January."
      ]
    },
    {
      id: "g6_expressions",
      grade: 6,
      unit: "Expressions, Equations & Inequalities",
      ccs: "6.EE",
      standards: ["6.EE.A.1", "6.EE.A.2", "6.EE.A.2a", "6.EE.A.2b", "6.EE.A.2c", "6.EE.B.5", "6.EE.B.6", "6.EE.B.7", "6.EE.B.8", "6.EE.C.9"],
      tier3ByLevel: {
        "3": ["equation", "solve", "unknown", "value", "equal"],
        "4": ["expression", "equation", "variable", "solve", "substitute"],
        "5": ["expression", "equation", "variable", "evaluate", "substitute", "inequality"],
        "6": ["algebraic expression", "equation", "variable", "evaluate", "inequality", "solution set", "coefficient"]
      },
      scenarios: [
        "A student earns the same amount of money for each hour of babysitting and wants to know how much she earns for different numbers of hours.",
        "A store charges a flat fee plus a per-item cost, and a customer wants to figure out the total bill.",
        "A plumber charges a fixed service fee and an hourly rate, and a homeowner wants to know the total cost.",
        "A school fundraiser sells cookies for a set price each, and the team needs to figure out how many to sell to reach their goal."
      ]
    },
    {
      id: "g6_geometry",
      grade: 6,
      unit: "Geometry: Area, Surface Area & Volume",
      ccs: "6.G",
      standards: ["6.G.A.1", "6.G.A.2", "6.G.A.3", "6.G.A.4"],
      tier3ByLevel: {
        "3": ["area", "perimeter", "length", "width", "square"],
        "4": ["area", "surface area", "volume", "rectangle", "triangle", "net"],
        "5": ["area", "surface area", "volume", "rectangular prism", "triangle", "composite figure", "net"],
        "6": ["area", "surface area", "volume", "rectangular prism", "composite figure", "polygon", "three-dimensional figure"]
      },
      scenarios: [
        "A homeowner wants to tile a rectangular kitchen floor and needs to figure out how many tiles to buy.",
        "A student is wrapping a birthday present in a box and wants to know how much wrapping paper she needs.",
        "A gardener is building a raised garden bed and needs to figure out how much soil to fill it with.",
        "An architect designs a room and needs to calculate the total area of the walls to determine how much paint to buy."
      ]
    },
    {
      id: "g6_statistics",
      grade: 6,
      unit: "Statistics & Data",
      ccs: "6.SP",
      standards: ["6.SP.A.1", "6.SP.A.2", "6.SP.A.3", "6.SP.B.4", "6.SP.B.5", "6.SP.B.5a", "6.SP.B.5b", "6.SP.B.5c", "6.SP.B.5d"],
      tier3ByLevel: {
        "3": ["average", "most", "least", "data", "graph"],
        "4": ["mean", "median", "mode", "data set", "distribution"],
        "5": ["mean", "median", "mode", "range", "distribution", "variability", "histogram"],
        "6": ["mean", "median", "mode", "range", "interquartile range", "variability", "distribution", "outlier"]
      },
      scenarios: [
        "A teacher records student test scores for a class and analyzes how well the class did overall.",
        "A weather station records daily high temperatures for a month and looks for patterns.",
        "A sports coach tracks how many points each player scored over the season to decide who plays the most.",
        "A school tracks student arrival times each morning to see how many students are late and by how much."
      ]
    },
    {
      id: "g7_proportional",
      grade: 7,
      unit: "Proportional Relationships",
      ccs: "7.RP",
      standards: ["7.RP.A.1", "7.RP.A.2", "7.RP.A.2a", "7.RP.A.2b", "7.RP.A.2c", "7.RP.A.2d", "7.RP.A.3"],
      tier3ByLevel: {
        "3": ["proportion", "ratio", "percent", "equal", "double"],
        "4": ["proportional", "ratio", "percent increase", "percent decrease", "constant"],
        "5": ["proportional relationship", "constant of proportionality", "percent change", "markup", "discount"],
        "6": ["proportional relationship", "constant of proportionality", "percent change", "markup", "discount", "scale factor", "similar figures"]
      },
      scenarios: [
        "A traveler is exchanging dollars for euros and wants to know how much foreign currency she will receive.",
        "A restaurant charges a fixed tax and tip on every bill, and a customer wants to estimate the total cost of a meal.",
        "A driver tracks how many miles her car travels per gallon of gas to plan a long road trip.",
        "A store marks up the price of items by a fixed percentage and then offers a sale discount \u2014 a shopper wants to find the final price.",
        "A map uses a scale where one inch equals 50 miles, and a hiker wants to measure the real distance between two cities.",
        "A population of bacteria doubles every hour, and a scientist tracks how many there are after several hours."
      ]
    },
    {
      id: "g7_rational_ops",
      grade: 7,
      unit: "Operations with Rational Numbers",
      ccs: "7.NS",
      standards: ["7.NS.A.1", "7.NS.A.1a", "7.NS.A.1b", "7.NS.A.1c", "7.NS.A.1d", "7.NS.A.2", "7.NS.A.2a", "7.NS.A.2b", "7.NS.A.2c", "7.NS.A.3"],
      tier3ByLevel: {
        "3": ["add", "subtract", "negative", "positive", "total"],
        "4": ["rational number", "add", "subtract", "multiply", "negative", "positive"],
        "5": ["rational number", "operation", "negative", "absolute value", "multiply", "divide", "integer"],
        "6": ["rational number", "operation", "negative integer", "absolute value", "multiplicative inverse", "additive inverse"]
      },
      scenarios: [
        "A student has some money in a bank account and makes a series of deposits and withdrawals throughout the month.",
        "A weather station in Alaska records temperature changes over several days, including drops below zero.",
        "A football team gains and loses yards on different plays during a drive toward the end zone.",
        "An investor tracks the rise and fall of a stock price over one week."
      ]
    },
    {
      id: "g7_expressions_equations",
      grade: 7,
      unit: "Expressions & Linear Equations",
      ccs: "7.EE",
      standards: ["7.EE.A.1", "7.EE.A.2", "7.EE.B.3", "7.EE.B.4", "7.EE.B.4a", "7.EE.B.4b"],
      tier3ByLevel: {
        "3": ["equation", "solve", "equal", "total", "cost"],
        "4": ["expression", "equation", "variable", "coefficient", "solve"],
        "5": ["linear equation", "variable", "coefficient", "solution", "equivalent expression"],
        "6": ["linear equation", "variable", "coefficient", "solution", "equivalent expression", "inequality", "rational coefficient"]
      },
      scenarios: [
        "A phone company charges a flat monthly fee plus a cost per text message, and a customer wants to predict her monthly bill.",
        "Two students save money each week at different rates and start with different amounts \u2014 a teacher asks when they will have the same total.",
        "A gym offers two membership plans with different monthly fees and per-visit costs, and a person wants to choose the cheaper one.",
        "A taxi company charges a base fare plus a rate per mile, and a passenger wants to estimate the cost of a ride."
      ]
    },
    {
      id: "g7_geometry",
      grade: 7,
      unit: "Geometry: Scale, Area & Volume",
      ccs: "7.G",
      standards: ["7.G.A.1", "7.G.A.2", "7.G.A.3", "7.G.B.4", "7.G.B.5", "7.G.B.6"],
      tier3ByLevel: {
        "3": ["area", "circle", "triangle", "scale", "measurement"],
        "4": ["area", "circumference", "radius", "diameter", "scale drawing", "volume"],
        "5": ["area", "circumference", "radius", "diameter", "scale factor", "surface area", "volume", "cross-section"],
        "6": ["area", "circumference", "pi", "radius", "diameter", "scale factor", "surface area", "volume", "composite figure"]
      },
      scenarios: [
        "A landscape designer is planning a circular garden and needs to know how much fencing to buy for the border.",
        "An architect draws a scale model of a new park and marks the real distances using the map scale.",
        "A swimmer is calculating the volume of a cylindrical pool to figure out how many gallons of water it holds.",
        "A student decorates a cylindrical can for a science project and needs to find the total surface area to cover."
      ]
    },
    {
      id: "g7_statistics",
      grade: 7,
      unit: "Statistics & Probability",
      ccs: "7.SP",
      standards: ["7.SP.A.1", "7.SP.A.2", "7.SP.B.3", "7.SP.B.4", "7.SP.C.5", "7.SP.C.6", "7.SP.C.7", "7.SP.C.7a", "7.SP.C.7b", "7.SP.C.8", "7.SP.C.8a", "7.SP.C.8b", "7.SP.C.8c"],
      tier3ByLevel: {
        "3": ["likely", "unlikely", "sample", "survey", "data"],
        "4": ["probability", "sample", "population", "inference", "random"],
        "5": ["probability", "sample", "population", "inference", "random sampling", "compound event"],
        "6": ["probability", "sample", "population", "inference", "random sampling", "compound event", "independent", "dependent"]
      },
      scenarios: [
        "A school surveys a sample of students about their favorite lunch and uses the results to predict what all students prefer.",
        "A student flips a coin and rolls a die and wants to figure out the probability of certain outcomes.",
        "A store surveys customers about a new product and uses the responses to decide whether to stock more.",
        "A doctor collects data from a random sample of patients to estimate how common a condition is in the community."
      ]
    },
    {
      id: "g8_linear_equations",
      grade: 8,
      unit: "Linear Equations & Systems",
      ccs: "8.EE",
      standards: ["8.EE.C.7", "8.EE.C.7a", "8.EE.C.7b", "8.EE.C.8", "8.EE.C.8a", "8.EE.C.8b", "8.EE.C.8c"],
      tier3ByLevel: {
        "3": ["equation", "solve", "slope", "line", "intercept"],
        "4": ["linear equation", "slope", "y-intercept", "system of equations", "solution"],
        "5": ["linear equation", "slope", "y-intercept", "system of equations", "solution", "coefficient", "elimination"],
        "6": ["linear equation", "slope", "y-intercept", "system of equations", "solution", "coefficient", "elimination", "substitution", "consistent system"]
      },
      scenarios: [
        "Two friends start a savings account with different amounts and save different amounts each week \u2014 a teacher asks when they will have the same amount.",
        "A car rental company charges a base fee plus a daily rate, and a traveler wants to compare two companies to find the cheaper option.",
        "A cyclist rides at a constant speed and a teacher describes her position over time using a graph.",
        "A school store sells pens and notebooks, and the total sold in one day equals a certain amount \u2014 a student tries to figure out how many of each were sold."
      ]
    },
    {
      id: "g8_functions",
      grade: 8,
      unit: "Functions",
      ccs: "8.F",
      standards: ["8.F.A.1", "8.F.A.2", "8.F.A.3", "8.F.B.4", "8.F.B.5"],
      tier3ByLevel: {
        "3": ["input", "output", "pattern", "change", "value"],
        "4": ["function", "input", "output", "rate of change", "linear"],
        "5": ["function", "input", "output", "rate of change", "linear function", "nonlinear"],
        "6": ["function", "domain", "range", "rate of change", "linear function", "nonlinear function", "initial value"]
      },
      scenarios: [
        "A plant grows by the same amount every week starting from a certain height, and a scientist records its height over several months.",
        "A phone battery loses charge at a steady rate during the day, and a student tracks the percentage remaining every hour.",
        "A swimmer's speed changes as she gets tired during a race, and a coach charts her speed over time.",
        "A company's profit grows by the same amount every year, and an analyst projects future earnings."
      ]
    },
    {
      id: "g8_geometry",
      grade: 8,
      unit: "Geometry: Congruence, Similarity & Transformations",
      ccs: "8.G.A",
      standards: ["8.G.A.1", "8.G.A.2", "8.G.A.3", "8.G.A.4", "8.G.A.5"],
      tier3ByLevel: {
        "3": ["same shape", "size", "flip", "slide", "turn"],
        "4": ["congruent", "similar", "reflection", "translation", "rotation"],
        "5": ["congruent", "similar", "reflection", "translation", "rotation", "transformation", "angle"],
        "6": ["congruent", "similar", "reflection", "translation", "rotation", "dilation", "transformation", "corresponding angles", "scale factor"]
      },
      scenarios: [
        "A graphic designer creates a logo and then resizes it for different uses while keeping the same shape.",
        "An architect notices that two sections of a building have the exact same shape and size, and explains why.",
        "A student rearranges tiles on a floor so that each tile is a mirror image of the one next to it.",
        "A teacher explains how a smaller triangle and a larger triangle share the same angles but different side lengths."
      ]
    },
    {
      id: "g8_pythagorean",
      grade: 8,
      unit: "Pythagorean Theorem",
      ccs: "8.G.B",
      standards: ["8.G.B.6", "8.G.B.7", "8.G.B.8"],
      tier3ByLevel: {
        "3": ["triangle", "side", "right angle", "length", "distance"],
        "4": ["right triangle", "hypotenuse", "leg", "Pythagorean theorem", "square root"],
        "5": ["right triangle", "hypotenuse", "leg", "Pythagorean theorem", "square root", "irrational number"],
        "6": ["right triangle", "hypotenuse", "leg", "Pythagorean theorem", "square root", "irrational number", "distance formula", "three-dimensional"]
      },
      scenarios: [
        "A firefighter leans a ladder against a building wall and a safety inspector needs to verify the ladder reaches a certain height.",
        "Two hikers start at the same campsite and walk in perpendicular directions \u2014 a park ranger calculates how far apart they are.",
        "A TV screen is described by its diagonal measurement, and a buyer wants to know the dimensions of the screen.",
        "A ship sails directly east and then directly north, and a navigator calculates the straight-line distance back to the starting port."
      ]
    },
    {
      id: "g8_irrational_numbers",
      grade: 8,
      unit: "Irrational Numbers & Approximations",
      ccs: "8.NS",
      standards: ["8.NS.A.1", "8.NS.A.2"],
      tier3ByLevel: {
        "3": ["decimal", "repeat", "number", "approximate", "round"],
        "4": ["irrational number", "rational number", "decimal expansion", "approximate", "square root"],
        "5": ["irrational number", "rational number", "non-repeating decimal", "square root", "pi", "approximation"],
        "6": ["irrational number", "rational number", "non-repeating decimal", "square root", "pi", "approximation", "terminating decimal", "real number"]
      },
      scenarios: [
        "A math teacher explains why the square root of 2 cannot be written as a simple fraction and how to estimate its value on a calculator.",
        "An engineer designing a circular track uses pi to calculate the circumference and explains why pi is an irrational number.",
        "A student compares the decimal expansions of one-third and the square root of five and discusses which repeats and which does not.",
        "A carpenter needs to cut a board to a length of exactly the square root of 18 inches and must decide how to approximate that measurement."
      ]
    },
    {
      id: "g8_data",
      grade: 8,
      unit: "Bivariate Data & Linear Models",
      ccs: "8.SP",
      standards: ["8.SP.A.1", "8.SP.A.2", "8.SP.A.3", "8.SP.A.4"],
      tier3ByLevel: {
        "3": ["graph", "predict", "more", "less", "trend"],
        "4": ["scatter plot", "trend", "positive", "negative", "predict"],
        "5": ["scatter plot", "linear model", "trend line", "correlation", "predict", "positive association"],
        "6": ["scatter plot", "linear model", "trend line", "correlation", "predict", "positive association", "negative association", "outlier", "bivariate data"]
      },
      scenarios: [
        "A scientist plots the relationship between the number of hours students study and their test scores, and describes what the data shows.",
        "A coach graphs the relationship between players' practice hours and the number of goals they score in a season.",
        "A weather researcher compares average monthly temperatures and ice cream sales to look for a relationship.",
        "A health researcher tracks whether people who sleep more hours tend to have lower or higher stress levels."
      ]
    }
  ]
};

// src/lib/academic/academicMathEngine.ts
function clampLevel(level) {
  return Math.min(6, Math.max(3, Math.floor(level)));
}
function getMathUnits() {
  return academicMathCurriculum_default.units;
}
function getMathVocabForLevel(unit, widalLevel) {
  const key = String(clampLevel(widalLevel));
  return unit.tier3ByLevel[key] ?? unit.tier3ByLevel["3"] ?? [];
}
function scenarioRecentlyUsed(scenario, recentScenarios) {
  const needle = scenario.slice(0, 48).toLowerCase();
  return recentScenarios.some((r) => {
    const hay = r.toLowerCase();
    return hay.includes(needle) || needle.includes(hay.slice(0, 48));
  });
}
function selectMathScenario(persistedTopic, topicsUsedToday = [], recentScenarios = []) {
  const units = getMathUnits();
  let chosenUnit;
  let chosenScenario;
  if (persistedTopic) {
    const retryUnit = units.find(
      (u) => u.scenarios.some((s) => persistedTopic.includes(s.slice(0, 40)))
    ) ?? units[Math.floor(Math.random() * units.length)];
    chosenUnit = retryUnit;
    const matchedScenario = retryUnit.scenarios.find((s) => persistedTopic.includes(s.slice(0, 40)));
    chosenScenario = matchedScenario ?? retryUnit.scenarios[Math.floor(Math.random() * retryUnit.scenarios.length)];
  } else {
    const usedLower = topicsUsedToday.map((t) => t.toLowerCase());
    const available = units.filter(
      (u) => !usedLower.some((used) => u.unit.toLowerCase().includes(used) || used.includes(u.unit.toLowerCase()))
    );
    const pool2 = available.length > 0 ? available : units;
    chosenUnit = pool2[Math.floor(Math.random() * pool2.length)];
    const scenarioPool = chosenUnit.scenarios.filter(
      (s) => !usedLower.some((used) => used.includes(s.slice(0, 40).toLowerCase())) && !scenarioRecentlyUsed(s, recentScenarios)
    );
    const fallbackPool = chosenUnit.scenarios.filter(
      (s) => !scenarioRecentlyUsed(s, recentScenarios)
    );
    const pickFrom = scenarioPool.length > 0 ? scenarioPool : fallbackPool.length > 0 ? fallbackPool : chosenUnit.scenarios;
    chosenScenario = pickFrom[Math.floor(Math.random() * pickFrom.length)];
  }
  const topicLabel = `Mathematics \u2014 Grade ${chosenUnit.grade}: ${chosenUnit.unit}`;
  return {
    unit: chosenUnit.unit,
    scenario: chosenScenario,
    scenarioExamples: [],
    tier3Vocabulary: [],
    // caller fills this in after resolving WIDA level
    topicLabel
  };
}
function buildMathSessionContext(fractionalLevel, persistedTopic, topicsUsedToday = [], recentScenarios = []) {
  const ctx = selectMathScenario(persistedTopic, topicsUsedToday, recentScenarios);
  const units = getMathUnits();
  const unit = units.find((u) => u.unit === ctx.unit) ?? units[0];
  const vocab = getMathVocabForLevel(unit, fractionalLevel);
  return {
    ...ctx,
    tier3Vocabulary: vocab,
    scenarioExamples: scenarioExamplesForPrompt(unit.scenarios),
    permittedFormats: listeningAvailableFormats(clampLevel(fractionalLevel)),
    ...mathFrameworkFromUnit(unit)
  };
}

// src/data/academicScienceCurriculum.json
var academicScienceCurriculum_default = {
  subject: "science",
  framework: "Next Generation Science Standards",
  frameworkRef: "https://www.nextgenscience.org/",
  gradeBand: "6-8",
  description: "NGSS middle school science \u2014 Life (MS-LS), Physical (MS-PS), Earth & Space (MS-ESS), and Engineering (MS-ETS) domains. Each unit maps to performance expectations, disciplinary core ideas, and crosscutting concepts. Scenario seeds support three-dimensional instruction.",
  units: [
    {
      id: "ls_cells",
      strand: "Life Science",
      unit: "Cells",
      topics: "Cell structure, function, and processes",
      ngssDomain: "MS-LS1",
      standards: ["MS-LS1-1", "MS-LS1-2", "MS-LS1-6", "MS-LS1-7"],
      practices: ["developing and using models", "constructing explanations"],
      crosscuttingConcepts: ["structure and function", "energy and matter"],
      tier3ByLevel: {
        "3": ["cell", "membrane", "nucleus", "oxygen", "energy"],
        "4": ["cell membrane", "nucleus", "organelle", "photosynthesis", "respiration"],
        "5": ["cell membrane", "nucleus", "organelle", "photosynthesis", "cellular respiration", "diffusion"],
        "6": ["cell membrane", "nucleus", "organelle", "photosynthesis", "cellular respiration", "diffusion", "osmosis", "mitosis"]
      },
      scenarios: [
        "A biology teacher explains how a plant cell captures sunlight and turns it into food the plant can use.",
        "A science teacher describes what happens inside an animal cell when it needs to get energy from food.",
        "A teacher explains the job of the cell membrane and why cells need it to survive.",
        "A scientist describes how cells divide to help a cut on your skin heal over time.",
        "A teacher explains the difference between a plant cell and an animal cell and what structures each one has."
      ]
    },
    {
      id: "ls_human_body",
      strand: "Life Science",
      unit: "Human Body Systems",
      topics: "Body systems, information processing, and homeostasis",
      ngssDomain: "MS-LS1",
      standards: ["MS-LS1-3", "MS-LS1-8"],
      practices: ["developing and using models", "constructing explanations"],
      crosscuttingConcepts: ["structure and function", "systems and system models"],
      tier3ByLevel: {
        "3": ["body", "brain", "heart", "lung", "muscle"],
        "4": ["organ", "system", "nervous system", "digestive system", "circulatory system"],
        "5": ["organ system", "homeostasis", "stimulus", "response", "nerve cell"],
        "6": ["homeostasis", "stimulus", "response", "feedback loop", "sensory receptor", "interacting systems"]
      },
      scenarios: [
        "A biology teacher explains how the digestive system breaks down food so the body can absorb nutrients.",
        "A teacher describes how the nervous system sends signals from your eyes to your brain when you see something surprising.",
        "A health teacher explains how the circulatory system carries oxygen from the lungs to muscles during exercise.",
        "A scientist describes how the body maintains a stable internal temperature even when the weather changes.",
        "A teacher explains how multiple body systems work together when a person runs a race."
      ]
    },
    {
      id: "ls_genetics",
      strand: "Life Science",
      unit: "Genetics",
      topics: "DNA, heredity, traits, and reproduction",
      ngssDomain: "MS-LS3",
      standards: ["MS-LS3-1", "MS-LS3-2"],
      practices: ["developing and using models", "constructing explanations"],
      crosscuttingConcepts: ["structure and function", "cause and effect"],
      tier3ByLevel: {
        "3": ["trait", "parent", "inherit", "gene", "DNA"],
        "4": ["trait", "heredity", "gene", "chromosome", "inherit", "dominant"],
        "5": ["trait", "heredity", "gene", "chromosome", "dominant", "recessive", "DNA", "allele"],
        "6": ["heredity", "gene", "chromosome", "dominant", "recessive", "allele", "genotype", "phenotype", "mutation"]
      },
      scenarios: [
        "A genetics teacher explains how traits like eye color are passed from parents to their children.",
        "A science teacher describes the difference between a dominant and a recessive trait using flower color as an example.",
        "A teacher explains what DNA is and where it is found inside a living cell.",
        "A scientist describes how two parents who both have dark hair can sometimes have a child with red hair.",
        "A teacher explains why identical twins look exactly alike but fraternal twins may look very different."
      ]
    },
    {
      id: "ls_ecosystems",
      strand: "Life Science",
      unit: "Ecosystems",
      topics: "Food webs, populations, and matter cycling",
      ngssDomain: "MS-LS2",
      standards: ["MS-LS2-1", "MS-LS2-2", "MS-LS2-3", "MS-LS2-4"],
      practices: ["developing and using models", "analyzing and interpreting data"],
      crosscuttingConcepts: ["energy and matter", "stability and change"],
      tier3ByLevel: {
        "3": ["food chain", "producer", "consumer", "prey", "predator"],
        "4": ["food web", "producer", "consumer", "decomposer", "population", "habitat"],
        "5": ["food web", "producer", "consumer", "decomposer", "ecosystem", "population", "nutrient cycle"],
        "6": ["food web", "producer", "consumer", "decomposer", "ecosystem", "nutrient cycle", "trophic level", "biomass", "carrying capacity"]
      },
      scenarios: [
        "A science teacher explains how energy moves from the sun through grass, rabbits, and wolves in a meadow.",
        "A teacher describes what happens to the rabbit population in a field when wolves are removed.",
        "A teacher explains the role of decomposers like fungi and bacteria in returning nutrients to the soil.",
        "An ecologist describes how matter cycles through a forest ecosystem from living things back to the soil and air.",
        "A teacher explains how removing one species from a food web can affect many other species."
      ]
    },
    {
      id: "ls_evolution",
      strand: "Life Science",
      unit: "Evolution",
      topics: "Natural selection and the fossil record",
      ngssDomain: "MS-LS4",
      standards: ["MS-LS4-1", "MS-LS4-2", "MS-LS4-4", "MS-LS4-6"],
      practices: ["analyzing and interpreting data", "constructing explanations"],
      crosscuttingConcepts: ["patterns", "cause and effect"],
      tier3ByLevel: {
        "3": ["fossil", "survive", "adapt", "environment", "species"],
        "4": ["fossil", "adaptation", "natural selection", "survive", "variation", "species"],
        "5": ["fossil", "adaptation", "natural selection", "variation", "species", "extinct", "evolution"],
        "6": ["fossil", "adaptation", "natural selection", "variation", "species", "extinct", "evolution", "common ancestor", "genetic variation"]
      },
      scenarios: [
        "A teacher explains how fossils found in rock layers give scientists clues about animals that lived millions of years ago.",
        "A science teacher describes how darker-colored moths survived better than lighter moths when trees turned dark from pollution.",
        "A teacher explains why animals in cold climates often have thick fur and how this trait developed over many generations.",
        "A scientist describes what scientists discovered by studying the bones of a whale and comparing them to land mammal bones.",
        "A teacher explains how bacteria can become resistant to antibiotics through natural selection."
      ]
    },
    {
      id: "ps_matter",
      strand: "Physical Science",
      unit: "Matter",
      topics: "Atoms, molecules, states of matter, and the periodic table",
      ngssDomain: "MS-PS1",
      standards: ["MS-PS1-1", "MS-PS1-3", "MS-PS1-4"],
      practices: ["developing and using models", "planning and carrying out investigations"],
      crosscuttingConcepts: ["structure and function", "scale, proportion, and quantity"],
      tier3ByLevel: {
        "3": ["atom", "solid", "liquid", "gas", "element"],
        "4": ["atom", "molecule", "element", "compound", "solid", "liquid", "gas", "periodic table"],
        "5": ["atom", "molecule", "element", "compound", "periodic table", "density", "phase change", "chemical property"],
        "6": ["atom", "molecule", "element", "compound", "periodic table", "density", "phase change", "chemical property", "atomic number", "isotope"]
      },
      scenarios: [
        "A chemistry teacher explains how water changes from liquid to gas when it is heated and why this is called evaporation.",
        "A teacher describes what happens to the particles inside a metal rod when it is heated and begins to expand.",
        "A science teacher explains how table salt is made of two different elements \u2014 sodium and chlorine \u2014 bonded together.",
        "A teacher explains how scientists organize all the known elements on the periodic table by their properties.",
        "A teacher describes the difference between a physical change and a chemical change using examples like melting ice and burning wood."
      ]
    },
    {
      id: "ps_chemical_reactions",
      strand: "Physical Science",
      unit: "Chemical Reactions",
      topics: "Conservation of mass, reaction types, and energy changes",
      ngssDomain: "MS-PS1",
      standards: ["MS-PS1-2", "MS-PS1-5", "MS-PS1-6"],
      practices: ["planning and carrying out investigations", "constructing explanations"],
      crosscuttingConcepts: ["energy and matter", "cause and effect"],
      tier3ByLevel: {
        "3": ["react", "mix", "change", "heat", "gas"],
        "4": ["chemical reaction", "reactant", "product", "conservation", "evidence"],
        "5": ["chemical reaction", "reactant", "product", "conservation of mass", "endothermic", "exothermic"],
        "6": ["chemical reaction", "reactant", "product", "conservation of mass", "endothermic", "exothermic", "coefficient", "balanced equation"]
      },
      scenarios: [
        "A chemistry teacher explains why the total mass stays the same when vinegar and baking soda react in a closed container.",
        "A teacher describes the evidence that burning wood is a chemical reaction rather than just a physical change.",
        "A science teacher explains how rust forming on iron is a slow chemical reaction between iron and oxygen.",
        "A teacher describes how a cold pack gets cold because the chemical reaction inside absorbs heat from the surroundings.",
        "A lab instructor explains how to tell whether a chemical reaction occurred by looking for gas bubbles, color change, or temperature change."
      ]
    },
    {
      id: "ps_energy",
      strand: "Physical Science",
      unit: "Energy",
      topics: "Kinetic and potential energy, heat, light, and sound",
      ngssDomain: "MS-PS3",
      standards: ["MS-PS3-1", "MS-PS3-2", "MS-PS3-3", "MS-PS3-4", "MS-PS3-5"],
      practices: ["developing and using models", "planning and carrying out investigations"],
      crosscuttingConcepts: ["energy and matter", "systems and system models"],
      tier3ByLevel: {
        "3": ["energy", "heat", "light", "sound", "move"],
        "4": ["kinetic energy", "potential energy", "heat", "light", "transfer", "temperature"],
        "5": ["kinetic energy", "potential energy", "thermal energy", "light", "transfer", "conduction", "radiation"],
        "6": ["kinetic energy", "potential energy", "thermal energy", "transfer", "conduction", "convection", "radiation", "electromagnetic spectrum"]
      },
      scenarios: [
        "A teacher explains how a roller coaster converts potential energy at the top of the hill into kinetic energy as it races down.",
        "A science teacher describes how heat moves through a metal spoon sitting in a hot bowl of soup.",
        "A teacher explains why a dark-colored shirt feels hotter in sunlight than a white shirt.",
        "A teacher describes how sound energy travels through air as vibrations and why you can hear a bell even far away.",
        "An engineer explains how a solar panel converts light energy from the sun into electrical energy for a house."
      ]
    },
    {
      id: "ps_forces",
      strand: "Physical Science",
      unit: "Forces and Motion",
      topics: "Gravity, magnetism, and Newton's laws",
      ngssDomain: "MS-PS2",
      standards: ["MS-PS2-1", "MS-PS2-2", "MS-PS2-3", "MS-PS2-4", "MS-PS2-5"],
      practices: ["planning and carrying out investigations", "using mathematics and computational thinking"],
      crosscuttingConcepts: ["cause and effect", "stability and change"],
      tier3ByLevel: {
        "3": ["force", "push", "pull", "gravity", "speed"],
        "4": ["force", "gravity", "friction", "acceleration", "Newton's law", "mass"],
        "5": ["force", "gravity", "friction", "acceleration", "inertia", "Newton's law", "net force"],
        "6": ["force", "gravity", "friction", "acceleration", "inertia", "Newton's law", "net force", "velocity", "momentum"]
      },
      scenarios: [
        "A teacher explains why a heavy bowling ball and a tennis ball dropped from the same height hit the ground at the same time.",
        "A science teacher describes how friction between a car's tires and the road allows a car to slow down when the brakes are applied.",
        "A teacher explains Newton's first law using an example of a hockey puck sliding on ice with almost no friction.",
        "A teacher describes what happens to the speed of a soccer ball when a player kicks it harder versus more softly.",
        "An engineer explains how a rocket pushes gas downward to propel itself upward, illustrating Newton's third law."
      ]
    },
    {
      id: "ps_waves",
      strand: "Physical Science",
      unit: "Waves",
      topics: "Wave properties, light waves, and sound transmission",
      ngssDomain: "MS-PS4",
      standards: ["MS-PS4-1", "MS-PS4-2", "MS-PS4-3"],
      practices: ["developing and using models", "using mathematics and computational thinking"],
      crosscuttingConcepts: ["patterns", "structure and function"],
      tier3ByLevel: {
        "3": ["wave", "sound", "light", "travel", "vibrate"],
        "4": ["wave", "wavelength", "frequency", "amplitude", "sound wave", "light wave"],
        "5": ["wavelength", "frequency", "amplitude", "sound wave", "light wave", "reflection", "refraction"],
        "6": ["wavelength", "frequency", "amplitude", "sound wave", "light wave", "reflection", "refraction", "electromagnetic wave", "transverse wave"]
      },
      scenarios: [
        "A teacher explains how a guitar string vibrates to create a sound wave that travels through the air to your ears.",
        "A science teacher describes how light bends \u2014 or refracts \u2014 when it moves from air into water, making a straw look bent.",
        "A teacher explains why high-pitched sounds have a higher frequency than low-pitched sounds.",
        "A teacher describes how sonar equipment on a boat sends sound waves to the ocean floor and measures how long they take to return.",
        "A teacher explains how a prism separates white light into a rainbow of colors by bending different wavelengths differently."
      ]
    },
    {
      id: "ess_earth_systems",
      strand: "Earth and Space Science",
      unit: "Earth's Systems",
      topics: "Plate tectonics, the rock cycle, and the water cycle",
      ngssDomain: "MS-ESS2",
      standards: ["MS-ESS2-1", "MS-ESS2-2", "MS-ESS2-4"],
      practices: ["developing and using models", "constructing explanations"],
      crosscuttingConcepts: ["systems and system models", "stability and change"],
      tier3ByLevel: {
        "3": ["rock", "volcano", "earthquake", "erosion", "cycle"],
        "4": ["tectonic plate", "volcano", "earthquake", "erosion", "rock cycle", "water cycle"],
        "5": ["tectonic plate", "volcano", "earthquake", "erosion", "rock cycle", "water cycle", "weathering", "sediment"],
        "6": ["tectonic plate", "volcano", "earthquake", "erosion", "rock cycle", "water cycle", "weathering", "sediment", "subduction", "igneous", "metamorphic", "sedimentary"]
      },
      scenarios: [
        "A geology teacher explains how two tectonic plates colliding over millions of years built the Rocky Mountains.",
        "A science teacher describes how an igneous rock can eventually become a sedimentary rock through the rock cycle.",
        "A teacher explains how water evaporates from the ocean, forms clouds, falls as rain, and eventually returns to the ocean.",
        "A teacher describes what happens deep underground when a tectonic plate slides under another plate at a subduction zone.",
        "A geologist explains how erosion from a river slowly cuts through rock to form a canyon like the Grand Canyon."
      ]
    },
    {
      id: "ess_geologic_time",
      strand: "Earth and Space Science",
      unit: "Geologic Time and Earth's History",
      topics: "Rock layers, fossil record, and Earth's age",
      ngssDomain: "MS-ESS1",
      standards: ["MS-ESS1-4"],
      practices: ["analyzing and interpreting data", "constructing explanations"],
      crosscuttingConcepts: ["patterns", "scale, proportion, and quantity"],
      tier3ByLevel: {
        "3": ["old", "layer", "fossil", "rock", "long ago"],
        "4": ["geologic time", "rock layer", "fossil record", "relative age", "extinction"],
        "5": ["geologic time scale", "stratum", "fossil record", "relative dating", "mass extinction"],
        "6": ["geologic time scale", "stratum", "fossil record", "relative dating", "mass extinction", "Paleozoic", "Mesozoic", "Cenozoic"]
      },
      scenarios: [
        "A geologist explains how scientists use layers of rock to figure out which fossils are older and which are younger.",
        "A teacher describes how the fossil record shows that dinosaurs lived during the Mesozoic era before going extinct.",
        "A museum guide explains why finding a trilobite fossil in a rock layer tells scientists that layer formed in an ancient ocean.",
        "A teacher describes how scientists estimate Earth's age using evidence from rocks and radioactive dating.",
        "A scientist explains what a mass extinction event is and how one changed life on Earth millions of years ago."
      ]
    },
    {
      id: "ess_weather",
      strand: "Earth and Space Science",
      unit: "Weather and Climate",
      topics: "Atmosphere, climate change, and ocean currents",
      ngssDomain: "MS-ESS2",
      standards: ["MS-ESS2-5", "MS-ESS2-6", "MS-ESS3-5"],
      practices: ["analyzing and interpreting data", "constructing explanations"],
      crosscuttingConcepts: ["cause and effect", "stability and change"],
      tier3ByLevel: {
        "3": ["weather", "temperature", "rain", "wind", "climate"],
        "4": ["atmosphere", "climate", "greenhouse gas", "ocean current", "precipitation"],
        "5": ["atmosphere", "climate", "greenhouse gas", "ocean current", "precipitation", "air pressure", "humidity"],
        "6": ["atmosphere", "climate change", "greenhouse gas", "ocean current", "air pressure", "humidity", "convection", "global warming", "carbon dioxide"]
      },
      scenarios: [
        "A meteorologist explains how warm, moist air rising over the Gulf of Mexico creates the conditions for a hurricane.",
        "A climate scientist explains how greenhouse gases like carbon dioxide trap heat in the atmosphere and cause temperatures to rise.",
        "A teacher describes how ocean currents like the Gulf Stream carry warm water from the tropics toward Europe, affecting its climate.",
        "A science teacher explains why deserts are so dry by describing how mountains block moisture from reaching inland areas.",
        "A teacher describes the difference between weather and climate and why climate scientists look at data over many decades."
      ]
    },
    {
      id: "ess_space",
      strand: "Earth and Space Science",
      unit: "Space Systems",
      topics: "The solar system, gravity in space, and moon phases",
      ngssDomain: "MS-ESS1",
      standards: ["MS-ESS1-1", "MS-ESS1-2", "MS-ESS1-3"],
      practices: ["developing and using models", "using mathematics and computational thinking"],
      crosscuttingConcepts: ["patterns", "scale, proportion, and quantity"],
      tier3ByLevel: {
        "3": ["planet", "moon", "orbit", "sun", "gravity"],
        "4": ["planet", "orbit", "gravity", "moon phase", "solar system", "axis"],
        "5": ["planet", "orbit", "gravity", "moon phase", "solar system", "axis", "rotation", "revolution"],
        "6": ["planet", "orbit", "gravity", "moon phase", "solar system", "axis", "rotation", "revolution", "eclipse", "astronomical unit", "elliptical orbit"]
      },
      scenarios: [
        "An astronomer explains why the moon appears to change shape each night as it orbits Earth and different portions are lit by the sun.",
        "A teacher describes how the force of gravity keeps all eight planets in their orbits around the sun.",
        "A space scientist explains why a day on Mercury lasts longer than a year on Mercury due to its slow rotation and fast orbit.",
        "A teacher explains what causes a solar eclipse and why it is safe to look at one only with special glasses.",
        "A teacher describes the difference between inner rocky planets and outer gas giant planets in our solar system."
      ]
    },
    {
      id: "ets_engineering",
      strand: "Engineering Design",
      unit: "Engineering Design Process",
      topics: "Defining problems, designing solutions, testing, and optimizing",
      ngssDomain: "MS-ETS1",
      standards: ["MS-ETS1-1", "MS-ETS1-2", "MS-ETS1-3", "MS-ETS1-4"],
      practices: ["asking questions and defining problems", "designing solutions", "optimizing"],
      crosscuttingConcepts: ["systems and system models", "influence of engineering on society"],
      tier3ByLevel: {
        "3": ["design", "build", "test", "problem", "improve"],
        "4": ["criteria", "constraint", "prototype", "solution", "evaluate"],
        "5": ["engineering design", "criteria", "constraint", "prototype", "iteration", "trade-off"],
        "6": ["engineering design", "criteria", "constraint", "prototype", "iteration", "trade-off", "optimize", "systematic testing"]
      },
      scenarios: [
        "An engineering teacher explains how students defined the problem of keeping food cold on a field trip and brainstormed possible cooler designs.",
        "A teacher describes how a team tested two bridge designs made of straws to see which could hold more weight before breaking.",
        "An engineer explains how a company improved a water filter by changing one part after each round of testing.",
        "A teacher walks through how engineers balance cost, safety, and effectiveness when choosing materials for a school playground shade structure.",
        "A science teacher describes how students used the engineering design process to create a device that reduces erosion on a hillside."
      ]
    }
  ]
};

// src/lib/academic/academicScienceEngine.ts
function clampLevel2(level) {
  return Math.min(6, Math.max(3, Math.floor(level)));
}
function getScienceUnits() {
  return academicScienceCurriculum_default.units;
}
function getScienceVocabForLevel(unit, widaLevel) {
  const key = String(clampLevel2(widaLevel));
  return unit.tier3ByLevel[key] ?? unit.tier3ByLevel["3"] ?? [];
}
function selectScienceScenario(persistedTopic, topicsUsedToday = []) {
  const units = getScienceUnits();
  let chosenUnit;
  let chosenScenario;
  if (persistedTopic) {
    const retryUnit = units.find(
      (u) => u.scenarios.some((s) => persistedTopic.includes(s.slice(0, 40)))
    ) ?? units[Math.floor(Math.random() * units.length)];
    chosenUnit = retryUnit;
    const matchedScenario = retryUnit.scenarios.find(
      (s) => persistedTopic.includes(s.slice(0, 40))
    );
    chosenScenario = matchedScenario ?? retryUnit.scenarios[Math.floor(Math.random() * retryUnit.scenarios.length)];
  } else {
    const usedLower = topicsUsedToday.map((t) => t.toLowerCase());
    const available = units.filter(
      (u) => !usedLower.some(
        (used) => u.unit.toLowerCase().includes(used) || used.includes(u.unit.toLowerCase())
      )
    );
    const pool2 = available.length > 0 ? available : units;
    chosenUnit = pool2[Math.floor(Math.random() * pool2.length)];
    chosenScenario = chosenUnit.scenarios[Math.floor(Math.random() * chosenUnit.scenarios.length)];
  }
  const topicLabel = `Science \u2014 ${chosenUnit.strand}: ${chosenUnit.unit}`;
  return {
    unit: chosenUnit.unit,
    strand: chosenUnit.strand,
    scenario: chosenScenario,
    scenarioExamples: [],
    tier3Vocabulary: [],
    // caller fills in after resolving WIDA level
    topicLabel
  };
}
function buildScienceSessionContext(fractionalLevel, persistedTopic, topicsUsedToday = []) {
  const ctx = selectScienceScenario(persistedTopic, topicsUsedToday);
  const units = getScienceUnits();
  const unit = units.find((u) => u.unit === ctx.unit) ?? units[0];
  const vocab = getScienceVocabForLevel(unit, fractionalLevel);
  return {
    ...ctx,
    tier3Vocabulary: vocab,
    scenarioExamples: scenarioExamplesForPrompt(unit.scenarios),
    permittedFormats: listeningAvailableFormats(clampLevel2(fractionalLevel)),
    ...scienceFrameworkFromUnit(unit)
  };
}

// src/data/academicSocialStudiesCurriculum.json
var academicSocialStudiesCurriculum_default = {
  subject: "social_studies",
  framework: "College, Career, and Civic Life (C3) Framework for Social Studies State Standards",
  frameworkRef: "https://www.socialstudies.org/standards/c3",
  gradeBand: "6-8",
  description: "C3 Framework Grade 6\u20138 social studies \u2014 Dimension 2 disciplinary content (History, Geography, Civics, Economics) with inquiry hooks for Dimensions 1, 3, and 4. Each unit maps to D2 indicator codes and includes scenario seeds for narrated academic content.",
  units: [
    {
      id: "wh_ancient_civ",
      strand: "World History",
      unit: "Ancient Civilizations",
      topics: "Mesopotamia, Ancient Egypt, Indus Valley, and Early China",
      c3Discipline: "History",
      standards: ["D2.His.1.6-8", "D2.His.2.6-8", "D2.His.3.6-8", "D2.His.4.6-8"],
      inquiryDimensions: ["D1", "D2", "D3", "D4"],
      tier3ByLevel: {
        "3": ["civilization", "ancient", "farmer", "river", "ruler"],
        "4": ["civilization", "ancient", "agriculture", "irrigation", "trade", "government"],
        "5": ["civilization", "agriculture", "irrigation", "trade route", "government", "social hierarchy", "artifact"],
        "6": ["civilization", "agriculture", "irrigation", "trade route", "government", "social hierarchy", "artifact", "polytheism", "cuneiform", "city-state"]
      },
      scenarios: [
        "A history teacher explains how ancient Mesopotamians used irrigation canals to bring water from the Tigris River to their crops in the dry desert.",
        "A teacher describes why ancient Egyptian civilization grew and thrived along the banks of the Nile River.",
        "A museum curator explains what archaeologists discovered when they excavated the ancient city of Mohenjo-Daro in the Indus Valley.",
        "A history teacher explains how early Chinese civilization developed writing, silk production, and bronze tools along the Yellow River.",
        "A teacher describes the social hierarchy of ancient Egypt, from the pharaoh at the top to farmers and slaves at the bottom."
      ]
    },
    {
      id: "wh_classical_empires",
      strand: "World History",
      unit: "Classical Empires",
      topics: "Ancient Greece, the Roman Empire, and the Mesoamerican Empires",
      c3Discipline: "History",
      standards: ["D2.His.1.6-8", "D2.His.2.6-8", "D2.His.5.6-8", "D2.His.6.6-8"],
      inquiryDimensions: ["D1", "D2", "D3"],
      tier3ByLevel: {
        "3": ["empire", "citizen", "law", "soldier", "trade"],
        "4": ["empire", "democracy", "republic", "citizen", "conquest", "territory"],
        "5": ["empire", "democracy", "republic", "citizen", "conquest", "territory", "senate", "philosophy"],
        "6": ["empire", "democracy", "republic", "citizen", "conquest", "territory", "senate", "philosophy", "oligarchy", "theocracy", "tribute"]
      },
      scenarios: [
        "A history teacher explains how ancient Athens created one of the world's first democracies, where male citizens voted on city laws.",
        "A teacher describes how the Roman Republic grew into the Roman Empire and what caused it to eventually fall.",
        "A teacher explains how the Aztec Empire built a powerful city called Tenochtitlan on an island in the middle of a lake.",
        "A historian explains how Alexander the Great conquered a vast territory stretching from Greece to Egypt to India.",
        "A teacher describes how Roman roads, aqueducts, and laws shaped the cultures of every territory the Romans conquered."
      ]
    },
    {
      id: "wh_geography",
      strand: "Geography",
      unit: "Global Geography",
      topics: "Physical landforms, human migration, mapping, and regional cultures",
      c3Discipline: "Geography",
      standards: ["D2.Geo.1.6-8", "D2.Geo.2.6-8", "D2.Geo.3.6-8", "D2.Geo.4.6-8", "D2.Geo.5.6-8"],
      inquiryDimensions: ["D1", "D2", "D4"],
      tier3ByLevel: {
        "3": ["mountain", "river", "map", "migrate", "culture"],
        "4": ["landform", "migration", "geography", "latitude", "longitude", "culture"],
        "5": ["landform", "migration", "geography", "latitude", "longitude", "culture", "climate zone", "population density"],
        "6": ["landform", "migration", "geography", "latitude", "longitude", "climate zone", "population density", "push factor", "pull factor", "cultural diffusion"]
      },
      scenarios: [
        "A geography teacher explains why most of the world's major cities were built near rivers or coastlines.",
        "A teacher describes why early humans migrated out of Africa and how they spread across every continent over thousands of years.",
        "A cartographer explains how geographers use lines of latitude and longitude to locate any place on Earth.",
        "A teacher explains how the Sahara Desert acts as a barrier that has separated the cultures of North Africa from the rest of the continent for thousands of years.",
        "A geography teacher describes how the Silk Road allowed goods, ideas, and religions to travel between China and Europe."
      ]
    },
    {
      id: "wh_middle_ages",
      strand: "World History",
      unit: "Middle Ages",
      topics: "European feudalism, the Silk Road, and African trading kingdoms",
      c3Discipline: "History",
      standards: ["D2.His.2.6-8", "D2.His.3.6-8", "D2.His.4.6-8", "D2.His.9.6-8"],
      inquiryDimensions: ["D1", "D2", "D3"],
      tier3ByLevel: {
        "3": ["king", "peasant", "trade", "knight", "castle"],
        "4": ["feudalism", "peasant", "knight", "trade route", "kingdom", "noble"],
        "5": ["feudalism", "serf", "knight", "trade route", "kingdom", "noble", "manor", "plague"],
        "6": ["feudalism", "serf", "knight", "trade route", "kingdom", "noble", "manor", "plague", "Crusades", "guild", "Black Death"]
      },
      scenarios: [
        "A history teacher explains how the feudal system in medieval Europe organized society, with kings and lords at the top and serfs at the bottom.",
        "A teacher describes how merchants on the Silk Road traded goods like silk, spices, and glassware between Asia, the Middle East, and Europe.",
        "A historian explains how the Mali Empire in West Africa became one of the richest kingdoms in the world by controlling gold and salt trade routes.",
        "A teacher describes what life was like for a serf living on a lord's manor in medieval Europe \u2014 the work they did and the rules they had to follow.",
        "A teacher explains how the bubonic plague spread along trade routes and killed roughly one-third of Europe's population in the 1300s."
      ]
    },
    {
      id: "wh_industrial_global",
      strand: "World History",
      unit: "Industrialization and Global Connections",
      topics: "Industrial Revolution, imperialism, and global trade in the 1800s\u20131900s",
      c3Discipline: "History",
      standards: ["D2.His.1.6-8", "D2.His.2.6-8", "D2.His.3.6-8", "D2.Eco.1.6-8"],
      inquiryDimensions: ["D1", "D2", "D3", "D4"],
      tier3ByLevel: {
        "3": ["factory", "machine", "trade", "empire", "change"],
        "4": ["industrialization", "factory", "urbanization", "imperialism", "colony"],
        "5": ["industrialization", "urbanization", "imperialism", "colony", "natural resource", "global trade"],
        "6": ["industrialization", "urbanization", "imperialism", "colonialism", "natural resource", "globalization", "labor movement"]
      },
      scenarios: [
        "A history teacher explains how the invention of the steam engine changed where people lived and how goods were made during the Industrial Revolution.",
        "A teacher describes how European nations competed to control colonies in Africa and Asia for raw materials and markets.",
        "A historian explains how railroads and telegraphs connected distant parts of the world and sped up global trade in the 1800s.",
        "A teacher describes working conditions in early factories and why labor unions began to form.",
        "A geography teacher explains how industrial cities grew rapidly as people moved from rural farms to urban factories."
      ]
    },
    {
      id: "ush_early_america",
      strand: "U.S. History",
      unit: "Early America",
      topics: "Indigenous cultures, European exploration, and the thirteen colonies",
      c3Discipline: "History",
      standards: ["D2.His.1.6-8", "D2.His.2.6-8", "D2.His.3.6-8", "D2.His.4.6-8"],
      inquiryDimensions: ["D1", "D2", "D3"],
      tier3ByLevel: {
        "3": ["colony", "settler", "Native American", "explore", "land"],
        "4": ["colony", "indigenous", "settler", "explore", "trade", "conflict"],
        "5": ["colony", "indigenous", "settler", "exploration", "trade", "conflict", "Columbian Exchange"],
        "6": ["colony", "indigenous", "settler", "exploration", "Columbian Exchange", "mercantilism", "indentured servant", "plantation"]
      },
      scenarios: [
        "A teacher explains how Native American peoples like the Haudenosaunee developed complex governments and cultures long before Europeans arrived.",
        "A history teacher describes why European nations like Spain, England, and France sent explorers to the Americas in the 1400s and 1500s.",
        "A teacher explains what the Columbian Exchange was \u2014 the transfer of plants, animals, and diseases between Europe and the Americas.",
        "A teacher describes why the first English settlers at Jamestown struggled to survive and what helped the colony eventually succeed.",
        "A teacher explains how the thirteen American colonies were governed and what they had in common despite being very different from each other."
      ]
    },
    {
      id: "ush_revolution",
      strand: "U.S. History",
      unit: "The American Revolution",
      topics: "Causes of the war, the Declaration of Independence, and the Revolutionary War",
      c3Discipline: "History",
      standards: ["D2.His.1.6-8", "D2.His.2.6-8", "D2.His.3.6-8", "D2.Civ.5.6-8"],
      inquiryDimensions: ["D1", "D2", "D3", "D4"],
      tier3ByLevel: {
        "3": ["revolution", "colonist", "freedom", "war", "rights"],
        "4": ["revolution", "colonist", "taxation", "independence", "rights", "militia"],
        "5": ["revolution", "colonist", "taxation", "independence", "rights", "militia", "loyalist", "patriot"],
        "6": ["revolution", "colonist", "taxation", "independence", "natural rights", "loyalist", "patriot", "declaration", "sovereignty", "representation"]
      },
      scenarios: [
        "A history teacher explains why American colonists were angry about the Stamp Act and began saying 'no taxation without representation.'",
        "A teacher describes what happened at the Boston Massacre and how it turned many colonists against British rule.",
        "A teacher explains the main ideas in the Declaration of Independence \u2014 that all people have natural rights and government gets its power from the people.",
        "A teacher describes the turning point at the Battle of Saratoga and why it convinced France to help the American colonists.",
        "A historian explains why the American Revolution succeeded and what role ordinary farmers and soldiers played in defeating the British army."
      ]
    },
    {
      id: "civ_citizenship",
      strand: "Civics",
      unit: "Citizenship and Civic Participation",
      topics: "Rights, responsibilities, participation, and the role of citizens in democracy",
      c3Discipline: "Civics",
      standards: ["D2.Civ.1.6-8", "D2.Civ.2.6-8", "D2.Civ.3.6-8", "D2.Civ.4.6-8", "D2.Civ.5.6-8", "D2.Civ.6.6-8"],
      inquiryDimensions: ["D1", "D2", "D4"],
      tier3ByLevel: {
        "3": ["citizen", "vote", "law", "community", "help"],
        "4": ["citizenship", "civic duty", "vote", "public good", "community service"],
        "5": ["citizenship", "civic duty", "political participation", "public policy", "advocacy"],
        "6": ["citizenship", "civic virtue", "political participation", "public policy", "advocacy", "civil society", "informed action"]
      },
      scenarios: [
        "A civics teacher explains the difference between a right and a responsibility and gives examples of each for American citizens.",
        "A teacher describes how students can participate in their community by attending town meetings or volunteering.",
        "A civics teacher explains why voting is both a right and a way citizens influence government decisions.",
        "A teacher describes how peaceful protest has been used throughout U.S. history to bring about change.",
        "A civics teacher explains how citizens can contact elected officials to share their views on a local issue."
      ]
    },
    {
      id: "ush_constitution",
      strand: "Civics",
      unit: "The Constitution and Government",
      topics: "The three branches of government, the Bill of Rights, and civic duties",
      c3Discipline: "Civics",
      standards: ["D2.Civ.3.6-8", "D2.Civ.4.6-8", "D2.Civ.5.6-8", "D2.Civ.10.6-8"],
      inquiryDimensions: ["D1", "D2", "D3"],
      tier3ByLevel: {
        "3": ["government", "law", "vote", "rights", "president"],
        "4": ["constitution", "government", "branch", "congress", "rights", "amendment"],
        "5": ["constitution", "branch of government", "congress", "amendment", "Bill of Rights", "checks and balances"],
        "6": ["constitution", "legislative", "executive", "judicial", "amendment", "Bill of Rights", "checks and balances", "federalism", "ratify"]
      },
      scenarios: [
        "A civics teacher explains the three branches of the federal government and what each one is responsible for.",
        "A teacher describes how the system of checks and balances prevents any one branch of government from becoming too powerful.",
        "A teacher explains what the First Amendment protects \u2014 freedom of speech, religion, and the press \u2014 and why the founders considered these rights essential.",
        "A teacher describes how a bill becomes a law, starting in Congress, going to the president, and possibly ending up in the Supreme Court.",
        "A civics teacher explains what civic duties American citizens have, including paying taxes, serving on juries, and voting in elections."
      ]
    },
    {
      id: "ush_westward",
      strand: "U.S. History",
      unit: "Westward Expansion",
      topics: "Manifest Destiny, industrialization, and the impacts on Native Americans",
      c3Discipline: "History",
      standards: ["D2.His.1.6-8", "D2.His.2.6-8", "D2.His.3.6-8", "D2.Geo.4.6-8"],
      inquiryDimensions: ["D1", "D2", "D3", "D4"],
      tier3ByLevel: {
        "3": ["west", "settler", "railroad", "Native American", "land"],
        "4": ["Manifest Destiny", "settler", "railroad", "Native American", "territory", "migration"],
        "5": ["Manifest Destiny", "settler", "railroad", "Native American", "territory", "migration", "reservation", "industrialization"],
        "6": ["Manifest Destiny", "settler", "railroad", "reservation", "industrialization", "treaty", "displacement", "assimilation", "Homestead Act"]
      },
      scenarios: [
        "A history teacher explains what Americans meant by 'Manifest Destiny' \u2014 the belief that the U.S. was destined to expand from coast to coast.",
        "A teacher describes how the transcontinental railroad connected the East and West coasts and transformed trade and travel in America.",
        "A teacher explains the devastating impact of westward expansion on Native American nations \u2014 their removal from ancestral lands and forced onto reservations.",
        "A teacher describes the California Gold Rush of 1849 and how it brought hundreds of thousands of people west in search of fortune.",
        "A historian explains how industrialization in the northern United States created new factories, cities, and a working class during the 1800s."
      ]
    },
    {
      id: "ush_civil_war",
      strand: "U.S. History",
      unit: "The Civil War and Reconstruction",
      topics: "Sectionalism, slavery, states' rights, and the Reconstruction era",
      c3Discipline: "History",
      standards: ["D2.His.1.6-8", "D2.His.2.6-8", "D2.His.3.6-8", "D2.His.4.6-8"],
      inquiryDimensions: ["D1", "D2", "D3", "D4"],
      tier3ByLevel: {
        "3": ["slavery", "freedom", "soldier", "South", "North"],
        "4": ["slavery", "sectionalism", "states' rights", "Confederacy", "Union", "emancipation"],
        "5": ["slavery", "sectionalism", "states' rights", "Confederacy", "Union", "emancipation", "Reconstruction", "amendment"],
        "6": ["slavery", "sectionalism", "states' rights", "Confederacy", "Union", "Emancipation Proclamation", "Reconstruction", "Thirteenth Amendment", "sharecropping", "Jim Crow"]
      },
      scenarios: [
        "A history teacher explains how disagreements over slavery and states' rights divided the North and South and eventually led to the Civil War.",
        "A teacher describes what life was like for enslaved African Americans on a Southern plantation and what the system of slavery meant for those who lived under it.",
        "A teacher explains what President Lincoln's Emancipation Proclamation declared and how it changed the purpose of the Civil War.",
        "A teacher describes the hardships soldiers faced during the Civil War \u2014 the weapons used, the diseases, and the massive number of casualties.",
        "A historian explains what Reconstruction was, why it gave formerly enslaved people new rights, and why many of those gains were later reversed."
      ]
    },
    {
      id: "ush_modern_america",
      strand: "U.S. History",
      unit: "Modern America: World Wars and the Great Depression",
      topics: "World War I, the Great Depression, World War II, and their impact on American society",
      c3Discipline: "History",
      standards: ["D2.His.1.6-8", "D2.His.2.6-8", "D2.His.3.6-8", "D2.His.9.6-8"],
      inquiryDimensions: ["D1", "D2", "D3", "D4"],
      tier3ByLevel: {
        "3": ["war", "soldier", "job", "money", "help"],
        "4": ["World War", "alliance", "depression", "unemployment", "New Deal"],
        "5": ["World War I", "World War II", "Great Depression", "New Deal", "isolationism", "home front"],
        "6": ["World War I", "World War II", "Great Depression", "New Deal", "isolationism", "home front", "internment", "Lend-Lease", "economic recovery"]
      },
      scenarios: [
        "A history teacher explains why the United States entered World War I and how the war changed America's role in the world.",
        "A teacher describes what life was like for American families during the Great Depression when many people lost jobs and savings.",
        "A teacher explains how President Franklin Roosevelt's New Deal programs tried to create jobs and stabilize the economy.",
        "A historian describes how Americans on the home front supported World War II by working in factories and rationing supplies.",
        "A teacher explains why the attack on Pearl Harbor led the United States to enter World War II."
      ]
    },
    {
      id: "ush_civil_rights",
      strand: "U.S. History",
      unit: "Civil Rights and Social Change",
      topics: "The civil rights movement, voting rights, and ongoing struggles for equality",
      c3Discipline: "History",
      standards: ["D2.His.2.6-8", "D2.His.3.6-8", "D2.His.8.6-8", "D2.Civ.5.6-8"],
      inquiryDimensions: ["D1", "D2", "D3", "D4"],
      tier3ByLevel: {
        "3": ["rights", "fair", "protest", "law", "vote"],
        "4": ["civil rights", "segregation", "protest", "Supreme Court", "voting rights"],
        "5": ["civil rights movement", "segregation", "discrimination", "legislation", "nonviolent protest"],
        "6": ["civil rights movement", "segregation", "discrimination", "legislation", "nonviolent protest", "Civil Rights Act", "Voting Rights Act", "social justice"]
      },
      scenarios: [
        "A history teacher explains how the Supreme Court's Brown v. Board of Education decision declared school segregation unconstitutional.",
        "A teacher describes the Montgomery Bus Boycott and how Rosa Parks's action sparked a year-long protest.",
        "A teacher explains what Dr. Martin Luther King Jr. meant by nonviolent protest and why it was central to the civil rights movement.",
        "A historian describes the March on Washington and the goals activists hoped to achieve.",
        "A teacher explains how the Civil Rights Act of 1964 and the Voting Rights Act of 1965 changed federal law and daily life for many Americans."
      ]
    },
    {
      id: "ss_inquiry_sources",
      strand: "Inquiry Skills",
      unit: "Evaluating Sources and Using Evidence",
      topics: "Primary and secondary sources, corroboration, bias, and evidence-based claims",
      c3Discipline: "Inquiry",
      standards: ["D3.1.6-8", "D3.2.6-8", "D3.3.6-8", "D3.4.6-8"],
      inquiryDimensions: ["D1", "D3", "D4"],
      tier3ByLevel: {
        "3": ["source", "fact", "story", "picture", "document"],
        "4": ["primary source", "secondary source", "evidence", "author", "date"],
        "5": ["primary source", "secondary source", "corroboration", "bias", "credibility"],
        "6": ["primary source", "secondary source", "corroboration", "bias", "credibility", "contextualization", "sourcing"]
      },
      scenarios: [
        "A history teacher explains the difference between a primary source like a diary from the Civil War and a secondary source like a textbook chapter.",
        "A teacher describes how historians check whether two sources agree before drawing a conclusion about an event.",
        "A civics teacher explains why knowing who wrote a document and when helps you judge whether it is trustworthy.",
        "A teacher walks through how a political cartoon from the 1800s can reveal what people believed even though it is not a neutral fact list.",
        "A librarian explains how students can tell whether a website about history is written by experts or by someone with a strong bias."
      ]
    },
    {
      id: "econ_systems",
      strand: "Financial Literacy and Economics",
      unit: "Economic Systems",
      topics: "Traditional, command, market, and mixed economies",
      c3Discipline: "Economics",
      standards: ["D2.Eco.1.6-8", "D2.Eco.2.6-8", "D2.Eco.3.6-8", "D2.Eco.4.6-8"],
      inquiryDimensions: ["D1", "D2", "D4"],
      tier3ByLevel: {
        "3": ["economy", "buy", "sell", "price", "government"],
        "4": ["economy", "market", "supply", "demand", "government control", "trade"],
        "5": ["economic system", "market economy", "command economy", "supply", "demand", "scarcity", "incentive"],
        "6": ["economic system", "market economy", "command economy", "mixed economy", "supply", "demand", "scarcity", "incentive", "GDP", "opportunity cost"]
      },
      scenarios: [
        "An economics teacher explains the difference between a market economy where individuals make decisions and a command economy where the government controls production.",
        "A teacher describes how supply and demand determines the price of a product \u2014 like why the price of strawberries drops when farmers have a big harvest.",
        "A teacher explains what scarcity means in economics and why people and governments must make choices about how to use limited resources.",
        "A teacher describes how most countries in the world today have mixed economies that combine market and government elements.",
        "An economics teacher explains why competition between businesses usually leads to lower prices and better products for consumers."
      ]
    },
    {
      id: "econ_personal_finance",
      strand: "Financial Literacy and Economics",
      unit: "Personal Finance",
      topics: "Budgeting, saving, taxes, and understanding scarcity",
      c3Discipline: "Economics",
      standards: ["D2.Eco.1.6-8", "D2.Eco.2.6-8", "D2.Eco.3.6-8"],
      inquiryDimensions: ["D1", "D2", "D4"],
      tier3ByLevel: {
        "3": ["budget", "save", "spend", "money", "tax"],
        "4": ["budget", "savings", "income", "expense", "tax", "interest"],
        "5": ["budget", "savings", "income", "expense", "tax", "interest", "credit", "investment"],
        "6": ["budget", "savings", "income", "expense", "tax", "interest", "credit", "investment", "compound interest", "net income", "gross income"]
      },
      scenarios: [
        "A financial educator explains how to make a budget by listing monthly income, subtracting fixed expenses like rent, and deciding how much to save.",
        "A teacher describes why saving money in a bank account earns interest and how compound interest makes savings grow faster over time.",
        "A teacher explains the difference between a need and a want and why deciding between them is an important budgeting skill.",
        "A financial literacy teacher explains what income tax is, why the government collects it, and how it is used to fund public services.",
        "A teacher describes what credit is, how a credit card works, and why carrying a high balance from month to month costs the consumer more money."
      ]
    }
  ]
};

// src/lib/academic/academicSocialStudiesEngine.ts
function clampLevel3(level) {
  return Math.min(6, Math.max(3, Math.floor(level)));
}
function getSocialStudiesUnits() {
  return academicSocialStudiesCurriculum_default.units;
}
function getSocialStudiesVocabForLevel(unit, widaLevel) {
  const key = String(clampLevel3(widaLevel));
  return unit.tier3ByLevel[key] ?? unit.tier3ByLevel["3"] ?? [];
}
function selectSocialStudiesScenario(persistedTopic, topicsUsedToday = []) {
  const units = getSocialStudiesUnits();
  let chosenUnit;
  let chosenScenario;
  if (persistedTopic) {
    const retryUnit = units.find(
      (u) => u.scenarios.some((s) => persistedTopic.includes(s.slice(0, 40)))
    ) ?? units[Math.floor(Math.random() * units.length)];
    chosenUnit = retryUnit;
    const matchedScenario = retryUnit.scenarios.find(
      (s) => persistedTopic.includes(s.slice(0, 40))
    );
    chosenScenario = matchedScenario ?? retryUnit.scenarios[Math.floor(Math.random() * retryUnit.scenarios.length)];
  } else {
    const usedLower = topicsUsedToday.map((t) => t.toLowerCase());
    const available = units.filter(
      (u) => !usedLower.some(
        (used) => u.unit.toLowerCase().includes(used) || used.includes(u.unit.toLowerCase())
      )
    );
    const pool2 = available.length > 0 ? available : units;
    chosenUnit = pool2[Math.floor(Math.random() * pool2.length)];
    chosenScenario = chosenUnit.scenarios[Math.floor(Math.random() * chosenUnit.scenarios.length)];
  }
  const topicLabel = `Social Studies \u2014 ${chosenUnit.strand}: ${chosenUnit.unit}`;
  return {
    unit: chosenUnit.unit,
    strand: chosenUnit.strand,
    scenario: chosenScenario,
    scenarioExamples: [],
    tier3Vocabulary: [],
    // caller fills in after resolving WIDA level
    topicLabel
  };
}
function buildSocialStudiesSessionContext(fractionalLevel, persistedTopic, topicsUsedToday = []) {
  const ctx = selectSocialStudiesScenario(persistedTopic, topicsUsedToday);
  const units = getSocialStudiesUnits();
  const unit = units.find((u) => u.unit === ctx.unit) ?? units[0];
  const vocab = getSocialStudiesVocabForLevel(unit, fractionalLevel);
  return {
    ...ctx,
    tier3Vocabulary: vocab,
    scenarioExamples: scenarioExamplesForPrompt(unit.scenarios),
    permittedFormats: listeningAvailableFormats(clampLevel3(fractionalLevel)),
    ...socialStudiesFrameworkFromUnit(unit)
  };
}

// src/data/academicElaCurriculum.json
var academicElaCurriculum_default = {
  subject: "english_language_arts",
  framework: "Common Core State Standards for English Language Arts & Literacy",
  frameworkRef: "https://www.corestandards.org/ELA-Literacy/",
  gradeBand: "6-8",
  description: "CCSS Grade 6\u20138 ELA \u2014 literary and informational text units mapped to Reading Literature (RL), Reading Informational (RI), Writing (W), Language (L), and Speaking & Listening (SL). Each unit includes genre tags, CCSS standard codes, and scenario seeds for session generation.",
  units: [
    {
      id: "narrative-structure",
      unit: "Narrative Structure",
      primaryGenre: "narrative",
      altGenres: ["author_craft"],
      ccssDomains: ["RL"],
      standards: ["RL.6.1", "RL.6.2", "RL.6.3", "RL.6.5", "RL.7.1", "RL.7.3", "RL.8.1", "RL.8.3"],
      tier3ByLevel: {
        "3": ["character", "setting", "conflict", "resolution", "plot"],
        "4": ["protagonist", "antagonist", "rising action", "climax", "falling action"],
        "5": ["dynamic character", "static character", "internal conflict", "external conflict", "narrative arc"],
        "6": ["characterization", "narrative perspective", "foil", "subplot", "denouement"]
      },
      scenarios: [
        "a student who overcomes stage fright before a school performance",
        "a new student adjusting to a different country and culture",
        "two friends who must resolve a misunderstanding",
        "a young person who discovers a talent they did not know they had",
        "a character who must make a difficult choice between loyalty and honesty"
      ]
    },
    {
      id: "informational-text",
      unit: "Informational Text Structure",
      primaryGenre: "informational",
      altGenres: ["argument"],
      ccssDomains: ["RI"],
      standards: ["RI.6.1", "RI.6.2", "RI.6.3", "RI.6.5", "RI.7.5", "RI.7.8", "RI.8.2", "RI.8.8"],
      tier3ByLevel: {
        "3": ["main idea", "detail", "heading", "topic sentence", "conclusion"],
        "4": ["text structure", "cause and effect", "compare and contrast", "problem and solution", "chronological order"],
        "5": ["central idea", "supporting evidence", "inference", "summary", "author's purpose"],
        "6": ["synthesis", "corroboration", "domain-specific vocabulary", "text feature", "implicit meaning"]
      },
      scenarios: [
        "how schools in different countries operate differently",
        "the history and science of why seasons change",
        "how social media affects young people's mental health",
        "the process of how laws are made in a democracy",
        "why sleep is essential for learning and memory"
      ]
    },
    {
      id: "argument-writing",
      unit: "Argument and Opinion",
      primaryGenre: "argument",
      altGenres: ["informational"],
      ccssDomains: ["W", "RI"],
      standards: ["W.6.1", "W.6.1a", "W.6.1b", "W.7.1", "W.7.1a", "W.8.1", "W.8.1b", "RI.6.8", "RI.7.8", "RI.8.8"],
      tier3ByLevel: {
        "3": ["opinion", "reason", "example", "claim", "agree"],
        "4": ["argument", "evidence", "counterclaim", "persuade", "support"],
        "5": ["claim", "reasoning", "rebuttal", "credibility", "logical fallacy"],
        "6": ["rhetorical appeal", "ethos", "pathos", "logos", "concession"]
      },
      scenarios: [
        "whether schools should allow students to use smartphones in class",
        "whether student athletes should be required to maintain a minimum GPA",
        "whether zoos are beneficial or harmful to animals",
        "whether homework helps or hurts student learning",
        "whether schools should start later in the morning"
      ]
    },
    {
      id: "authors-craft",
      unit: "Author's Craft",
      primaryGenre: "author_craft",
      altGenres: ["narrative", "informational"],
      ccssDomains: ["RL", "L"],
      standards: ["RL.6.4", "RL.7.4", "RL.8.4", "L.6.5", "L.6.5a", "L.7.5", "L.8.5"],
      tier3ByLevel: {
        "3": ["simile", "metaphor", "repetition", "rhyme", "imagery"],
        "4": ["figurative language", "personification", "alliteration", "tone", "word choice"],
        "5": ["symbolism", "irony", "foreshadowing", "flashback", "point of view"],
        "6": ["narrative voice", "diction", "connotation", "denotation", "literary device"]
      },
      scenarios: [
        "a short poem about seasons and change read with analysis of figurative language",
        "a memoir excerpt about a family tradition and the author's use of sensory details",
        "a passage where the author's word choice creates a suspenseful mood",
        "a narrative excerpt that uses flashback to reveal a character's motivation",
        "a descriptive passage where personification makes nature come alive"
      ]
    },
    {
      id: "poetry",
      unit: "Poetry and Verse",
      primaryGenre: "author_craft",
      altGenres: ["narrative"],
      ccssDomains: ["RL", "L"],
      standards: ["RL.6.5", "RL.7.5", "RL.8.5", "RL.6.4", "L.6.5", "L.7.5"],
      tier3ByLevel: {
        "3": ["rhyme", "rhythm", "stanza", "line", "verse"],
        "4": ["meter", "free verse", "imagery", "repetition", "theme"],
        "5": ["speaker", "enjambment", "allusion", "extended metaphor", "tone"],
        "6": ["volta", "apostrophe", "anaphora", "assonance", "consonance"]
      },
      scenarios: [
        "a short poem about belonging and identity read aloud with discussion of imagery",
        "a poem about the natural world using vivid personification",
        "a narrative poem telling the story of a historical event",
        "a free-verse poem about change and growth with discussion of structure",
        "a poem using extended metaphor to describe a life challenge"
      ]
    },
    {
      id: "speaking-listening",
      unit: "Speaking and Listening",
      primaryGenre: "informational",
      altGenres: ["argument"],
      ccssDomains: ["SL"],
      standards: ["SL.6.1", "SL.6.1a", "SL.6.1b", "SL.6.1c", "SL.6.1d", "SL.6.2", "SL.6.3", "SL.7.1", "SL.7.2", "SL.8.1", "SL.8.3"],
      tier3ByLevel: {
        "3": ["discussion", "listen", "question", "respond", "idea"],
        "4": ["collaboration", "elaboration", "clarify", "summarize", "evidence"],
        "5": ["collaborative discussion", "diverse perspectives", "reasoning", "counterargument", "presentation"],
        "6": ["deliberation", "rhetorical question", "audience", "formal register", "synthesis"]
      },
      scenarios: [
        "a classroom debate where students discuss whether community service should be required for graduation",
        "a student group presentation explaining how a local watershed supports wildlife",
        "a Socratic seminar about a short story's theme and how different readers interpret the ending",
        "a peer review session where students give constructive feedback on each other's argumentative essays",
        "a student explaining a science fair project to classmates who ask clarifying questions"
      ]
    },
    {
      id: "research-sources",
      unit: "Research and Evidence",
      primaryGenre: "informational",
      altGenres: ["argument"],
      ccssDomains: ["W", "RI"],
      standards: ["W.6.7", "W.6.8", "W.6.9", "W.7.7", "W.7.8", "W.7.9", "W.8.7", "W.8.8", "W.8.9", "RI.6.7", "RI.7.7", "RI.8.7"],
      tier3ByLevel: {
        "3": ["source", "fact", "quote", "author", "topic"],
        "4": ["credible source", "paraphrase", "quotation", "bibliography", "research question"],
        "5": ["primary source", "secondary source", "relevance", "plagiarism", "citation"],
        "6": ["corroboration", "bias", "synthesis", "annotated bibliography", "domain authority"]
      },
      scenarios: [
        "a student researching how renewable energy works and comparing information from a government website and a news article",
        "a teacher explaining how to tell whether an online article about health is trustworthy",
        "a class project where students gather facts about a historical figure from multiple sources and note where they agree or disagree",
        "a student writing a report on endangered species and deciding which sources to cite",
        "a librarian demonstrating how to use search terms to find relevant articles for a science topic"
      ]
    },
    {
      id: "vocabulary-language",
      unit: "Vocabulary and Language Conventions",
      primaryGenre: "informational",
      altGenres: ["author_craft"],
      ccssDomains: ["L"],
      standards: ["L.6.4", "L.6.4a", "L.6.5", "L.6.6", "L.7.4", "L.7.5", "L.7.6", "L.8.4", "L.8.5", "L.8.6"],
      tier3ByLevel: {
        "3": ["word", "meaning", "context", "prefix", "suffix"],
        "4": ["context clue", "root word", "synonym", "antonym", "figurative meaning"],
        "5": ["denotation", "connotation", "domain-specific", "academic vocabulary", "word relationship"],
        "6": ["nuance", "shades of meaning", "register", "etymology", "language standard"]
      },
      scenarios: [
        "a teacher explaining how the prefix 'photo-' helps decode words like photosynthesis and photograph",
        "a passage about ecosystems where students use context clues to figure out what 'biodiversity' means",
        "a discussion of how the word 'home' has different connotations in a poem versus a real estate article",
        "a science text introducing Greek and Latin roots common in academic vocabulary",
        "a teacher comparing formal and informal word choices in two versions of the same announcement"
      ]
    }
  ]
};

// src/lib/academic/academicElaEngine.ts
function getElaUnits() {
  return academicElaCurriculum_default.units;
}
function clampLevel4(level) {
  return Math.min(6, Math.max(3, Math.floor(level)));
}
function getElaVocabForLevel(unit, wida) {
  const key = String(clampLevel4(wida));
  return unit.tier3ByLevel[key] ?? unit.tier3ByLevel["3"] ?? [];
}
function selectElaScenario(persistedTopic, topicsUsedToday = []) {
  const units = getElaUnits();
  const usedLower = topicsUsedToday.map((t) => t.toLowerCase());
  let chosenUnit;
  let chosenScenario;
  let chosenGenre;
  if (persistedTopic) {
    const retryUnit = units.find(
      (u) => u.scenarios.some((s) => persistedTopic.includes(s.slice(0, 40)))
    ) ?? units[Math.floor(Math.random() * units.length)];
    chosenUnit = retryUnit;
    const matched = retryUnit.scenarios.find((s) => persistedTopic.includes(s.slice(0, 40)));
    chosenScenario = matched ?? retryUnit.scenarios[Math.floor(Math.random() * retryUnit.scenarios.length)];
    chosenGenre = retryUnit.primaryGenre;
  } else {
    const available = units.filter(
      (u) => !usedLower.some(
        (used) => u.unit.toLowerCase().includes(used) || used.includes(u.unit.toLowerCase())
      )
    );
    const pool2 = available.length > 0 ? available : units;
    chosenUnit = pool2[Math.floor(Math.random() * pool2.length)];
    chosenScenario = chosenUnit.scenarios[Math.floor(Math.random() * chosenUnit.scenarios.length)];
    const allGenres = [chosenUnit.primaryGenre, ...chosenUnit.altGenres];
    chosenGenre = allGenres[Math.floor(Math.random() * allGenres.length)];
  }
  return {
    unit: chosenUnit.unit,
    genre: chosenGenre,
    scenario: chosenScenario,
    scenarioExamples: [],
    tier3Vocabulary: [],
    topicLabel: `ELA \u2014 Grade 6\u20138: ${chosenUnit.unit}`
  };
}
function buildElaSessionContext(fractionalLevel, persistedTopic, topicsUsedToday = []) {
  const units = getElaUnits();
  const ctx = selectElaScenario(persistedTopic, topicsUsedToday);
  const unit = units.find((u) => u.unit === ctx.unit) ?? units[0];
  const vocab = getElaVocabForLevel(unit, fractionalLevel);
  return {
    ...ctx,
    tier3Vocabulary: vocab,
    scenarioExamples: scenarioExamplesForPrompt(unit.scenarios),
    permittedFormats: listeningAvailableFormats(clampLevel4(fractionalLevel)),
    ...elaFrameworkFromUnit(unit, ctx.genre)
  };
}

// src/lib/content/frameworkRotation.ts
function interpretiveKeyUsesForSubject(subject) {
  return KEY_USE_ROTATION.filter((k) => hasInterpretiveCell(subject, k));
}
function expressiveKeyUsesForSubject(subject) {
  return KEY_USE_ROTATION.filter((k) => hasExpressiveCell(subject, k));
}
function keyUsesForSubject(subject, mode) {
  return mode === "interpretive" ? interpretiveKeyUsesForSubject(subject) : expressiveKeyUsesForSubject(subject);
}
function kluPool(mode) {
  return (subject) => keyUsesForSubject(subject, mode);
}
function nextFrameworkAcademicSubject(recent, isRetry, lastSessionSubject, mode) {
  return nextAcademicSubject(recent, isRetry, lastSessionSubject, kluPool(mode));
}
function nextFrameworkKeyUseForSubject(recent, subject, isRetry, retryKeyUse, mode) {
  return nextKeyUseForSubject(recent, subject, isRetry, retryKeyUse, kluPool(mode));
}

// src/lib/content/listeningContentEngine.ts
var LEVEL_ORAL_FORMAT = {
  1: "short oral statements (1\u20132 sentences); visual support assumed",
  2: "2\u20133 sentences; oral directions or descriptions paired with labeled visuals, charts, or cause/effect illustrations",
  3: "short paragraph of familiar text read aloud; narrative or informational oral texts",
  4: "paragraph-length oral discourse; peer-style oral presentations",
  5: "extended oral passages; oral directions for constructing models; video/technology-based oral discourse",
  6: "diverse media and oral formats; multimedia (e.g., video-style narration); complex oral discourse"
};
var STEP_LABELS = ["Entry", "Early", "Mid", "Late", "Advanced"];
function floorLevel(fractional) {
  return Math.min(6, Math.max(1, Math.floor(fractional)));
}
function subStep(fractional) {
  const base = floorLevel(fractional);
  if (base >= 6) return 0;
  return Math.min(4, Math.round((fractional - base) / 0.2));
}
var COMPLEXITY_INSTRUCTIONS = {
  0: (l) => `ENTRY of Level ${l}: English at the floor of this level. Simple words and short sentences. Aim at framework.pld.`,
  1: (l) => `EARLY Level ${l}: Still this level's English, a little more variety. Aim at framework.pld.`,
  2: (l) => `MID Level ${l}: Typical English for this level. Aim at framework.pld.`,
  3: (l) => `LATE Level ${l}: Toward the ceiling of this level. Denser sentences and more precise words, still matching framework.pld \u2014 not the next level.`,
  4: (l) => `ADVANCED Level ${l}: At the end-of-level listening in framework.pld. Ready to leave this level. Do not write English from level ${l + 1}.`
};
var KEY_USE_ROTATION = ["Narrate", "Inform", "Explain", "Argue"];
function normalizeRotationKeyUse(keyUse) {
  if (!keyUse) return null;
  if (keyUse === "Recount") return "Narrate";
  if (KEY_USE_ROTATION.includes(keyUse)) return keyUse;
  return null;
}
function nextKeyUse(lastKeyUse, isRetry) {
  const last = normalizeRotationKeyUse(lastKeyUse);
  if (isRetry && last) return last;
  const lastIndex = last ? KEY_USE_ROTATION.indexOf(last) : -1;
  return KEY_USE_ROTATION[(lastIndex + 1) % KEY_USE_ROTATION.length];
}
function buildListeningContext(fractionalLevel, topicsUsedToday = [], persistedTopic = null, lastKeyUse = null, academicSubject, keyUseOverride) {
  const elpLevel = floorLevel(fractionalLevel);
  const step = subStep(fractionalLevel);
  const isRetry = persistedTopic !== null;
  const keyUse = keyUseOverride ?? nextKeyUse(lastKeyUse, isRetry);
  return {
    elpLevel,
    fractionalLevel,
    stepWithinLevel: step,
    stepLabel: STEP_LABELS[step],
    complexityInstruction: (COMPLEXITY_INSTRUCTIONS[step] ?? COMPLEXITY_INSTRUCTIONS[2])(elpLevel),
    oralFormat: LEVEL_ORAL_FORMAT[elpLevel] ?? "",
    permittedFormats: listeningAvailableFormats(elpLevel),
    keyUse,
    framework: selectFrameworkTask({
      level: elpLevel,
      keyUse,
      mode: "interpretive",
      academicSubject
    }),
    selectedTopic: persistedTopic ?? ""
  };
}
var ACADEMIC_SUBJECTS = ["ela", "math", "science", "social_studies"];
var ACADEMIC_SUBJECT_ROTATION = ACADEMIC_SUBJECTS;
var ACADEMIC_SUBJECT_LABELS = {
  math: "Mathematics",
  science: "Science",
  social_studies: "Social Studies",
  ela: "English Language Arts"
};
function asAcademicSubject(value) {
  return ACADEMIC_SUBJECTS.includes(value) ? value : null;
}
function lastKeyUseForSubject(recent, subject) {
  for (const row of recent) {
    if (asAcademicSubject(row.subject) === subject && row.keyUse) return row.keyUse;
  }
  return null;
}
function subjectKluCycleComplete(pool2, lastKeyUseForSubject2) {
  if (pool2.length === 0) return true;
  const last = normalizeRotationKeyUse(lastKeyUseForSubject2);
  if (!last || !pool2.includes(last)) return false;
  return pool2[pool2.length - 1] === last;
}
function nextKeyUseInPool(lastKeyUse, isRetry, pool2) {
  const last = normalizeRotationKeyUse(lastKeyUse);
  if (isRetry && last && pool2.includes(last)) return last;
  if (!last || !pool2.includes(last)) return pool2[0] ?? "Inform";
  return pool2[(pool2.indexOf(last) + 1) % pool2.length];
}
function nextAcademicSubject(recent, isRetry, lastSessionSubject, keyUsePoolForSubject) {
  const rotation = ACADEMIC_SUBJECT_ROTATION.filter(
    (s) => keyUsePoolForSubject(s).length > 0
  );
  const fallback = rotation[0] ?? "ela";
  if (isRetry && lastSessionSubject && rotation.includes(lastSessionSubject)) {
    return lastSessionSubject;
  }
  if (lastSessionSubject && rotation.includes(lastSessionSubject)) {
    const subjectLastKu = lastKeyUseForSubject(recent, lastSessionSubject);
    const pool2 = keyUsePoolForSubject(lastSessionSubject);
    if (!subjectKluCycleComplete(pool2, subjectLastKu)) return lastSessionSubject;
    const idx = rotation.indexOf(lastSessionSubject);
    if (idx >= 0) return rotation[(idx + 1) % rotation.length];
  }
  return fallback;
}
function nextKeyUseForSubject(recent, subject, isRetry, retryKeyUse, keyUsePoolForSubject) {
  const pool2 = keyUsePoolForSubject(subject);
  if (pool2.length === 0) return "Inform";
  if (isRetry && retryKeyUse) {
    const retry = normalizeRotationKeyUse(retryKeyUse);
    if (retry && pool2.includes(retry)) return retry;
  }
  const subjectLast = lastKeyUseForSubject(recent, subject);
  return nextKeyUseInPool(subjectLast, false, pool2);
}
function buildAcademicListeningContext(fractionalLevel, topicsUsedToday = [], persistedTopic = null, lastKeyUse = null, recentAcademic = []) {
  const isRetry = persistedTopic !== null;
  const lastSubject = asAcademicSubject(recentAcademic[0]?.subject);
  const subject = nextFrameworkAcademicSubject(
    recentAcademic,
    isRetry,
    lastSubject,
    "interpretive"
  );
  const keyUse = nextFrameworkKeyUseForSubject(
    recentAcademic,
    subject,
    isRetry,
    lastKeyUse,
    "interpretive"
  );
  const base = buildListeningContext(
    fractionalLevel,
    topicsUsedToday,
    persistedTopic,
    lastKeyUse,
    subject,
    keyUse
  );
  return {
    ...base,
    subject,
    subjectLabel: ACADEMIC_SUBJECT_LABELS[subject]
  };
}

// src/lib/content/readingContentEngine.ts
var READING_PERMITTED_FORMATS = {
  1: readingAvailableFormats(1),
  2: readingAvailableFormats(2),
  3: readingAvailableFormats(3),
  4: readingAvailableFormats(4),
  5: readingAvailableFormats(5),
  6: readingAvailableFormats(6)
};

// src/lib/academic/academicSubjectContent.ts
function buildAcademicSessionContext(subject, fractionalLevel, persistedTopic, topicsUsedToday, recentScenarios = []) {
  if (subject === "math") {
    return {
      subject,
      ...buildMathSessionContext(
        fractionalLevel,
        persistedTopic,
        topicsUsedToday,
        recentScenarios
      )
    };
  }
  if (subject === "science") {
    return {
      subject,
      ...buildScienceSessionContext(fractionalLevel, persistedTopic, topicsUsedToday)
    };
  }
  if (subject === "social_studies") {
    return {
      subject,
      ...buildSocialStudiesSessionContext(fractionalLevel, persistedTopic, topicsUsedToday)
    };
  }
  return {
    subject: "ela",
    ...buildElaSessionContext(fractionalLevel, persistedTopic, topicsUsedToday)
  };
}

// src/lib/claude/prompts/content/listening-l12-mode.ts
var LISTENING_L12_MODE_BLOCK = `
SESSION INTERACTION MODE (levels 1\u20132 only)

You choose how the student interacts AFTER a library photo is selected. The photo is ALWAYS shown.

use_tap_mode = true  \u2192 TAP MODE
  Student hears a short audio_script, then taps objects on the photo (box_tap) or picks labeled choices (text_choice).
  Question types: image_object_tap, image_yes_no.
  Best when framework.language_functions call for:
    \u2022 identifying or locating visible objects (Inform, Narrate)
    \u2022 agreeing/disagreeing with a claim about what is shown (Argue)
    \u2022 comparing two visible objects in the photo
  Requires usable image_tags as tap targets.

use_tap_mode = false \u2192 LISTEN & READ MODE
  Student hears a short academic audio_script grounded in the photo, then answers standard comprehension questions (multiple_choice, agree_disagree, etc.).
  Best when framework.language_functions call for:
    \u2022 Explain \u2014 student must understand a concept or purpose described in speech, not just point at objects
    \u2022 math/science word-problem language where the photo sets the scene but questions test heard reasoning
    \u2022 passages that teach vocabulary or relationships beyond simple object ID
  Photo is visual support only; questions follow the heard text.

tap_delivery (only when use_tap_mode = true):
  box_tap     \u2014 dino_detection_count \u2265 2 and distinct object boxes exist for targets
  text_choice \u2014 fewer reliable boxes, concept labels, or tags without matching DINO boxes

Decide from framework.key_language_use, framework.language_functions, image_tags, and dino_detection_count \u2014 not from fixed rules alone.
`.trim();

// src/data/wida_scoring_rubrics_data.json
var wida_scoring_rubrics_data_default = {
  _source: "Fetched directly from wida.wisc.edu official PDFs on 2026-09-02: ACCESS-Speaking-Scoring-Rubric-Grades-1-12.pdf and ACCESS-Writing-Scoring-Rubric-Grades-1-12.pdf. This is primary WIDA rubric text (not paraphrased), superseding the extrapolated/unconfirmed portions of the earlier 'goELprep Synthetic Anchor Responses' research doc.",
  speaking_rubric: {
    categories_high_to_low: ["Exemplary", "Strong", "Adequate", "Attempted", "No Response"],
    descriptors: {
      Exemplary: [
        "Language use comparable to or going beyond the model in sophistication",
        "Clear, automatic, and fluent delivery",
        "Precise and appropriate word choice"
      ],
      Strong: [
        "Language use approaching that of model in sophistication, though not as rich",
        "Clear delivery",
        "Appropriate word choice"
      ],
      Adequate: [
        "Language use not as sophisticated as that of model",
        "Generally comprehensible use of oral language",
        "Adequate word choice"
      ],
      Attempted: [
        "Language use does not support an adequate response",
        "Comprehensibility may be compromised",
        "Word choice may not be fully adequate"
      ],
      "No Response": [
        "Does not respond (in English)"
      ]
    },
    task_level_guidance: {
      P1_tasks: "Assign Attempted for single English words (including verbatim repetition from model); assign Adequate for two or more words in English.",
      grades_1_3: "Award Strong or higher for original simple oral sentences.",
      grades_4_12: "Award Strong or higher for at least two original simple sentences or one sentence with sophistication matching the model.",
      P3_P5_tasks: "Students may use language from the model without penalty."
    },
    scoring_notes: [
      "Simply repeating the task question scores Attempted",
      `"I don't know" responses score Attempted`,
      "Off-task responses score Attempted",
      "Off-topic responses score a maximum of Adequate"
    ],
    note_vs_app: "goELprep's current speaking.ts defines its own per-level scoring dimensions rather than scoring against these 5 official categories directly, and has no P1/P3/P5 task-level rules (single-word=Attempted, 2-sentence Strong threshold, off-topic cap, etc). Not yet reconciled."
  },
  writing_rubric: {
    scale: "0-7 (score point 0 is a set of disqualifying conditions, not a quality descriptor)",
    score_points: {
      "7": [
        "Ideas are coherently organized, using language that connects ideas together smoothly throughout the response achieving a clear flow of text.",
        "Response clearly demonstrates features of the intended key language use (Narrate, Inform, Explain, Argue) and content area.",
        "Response contains a wide variety of sentence structures whose meaning is always clear. Response demonstrates control of complex sentence structures, though sentences may not always be error-free.",
        "Response uses a wide variety of words and phrases appropriately and precisely, with choices that are relevant to the task context."
      ],
      "6": [
        "Ideas are well organized and elaborated, using a variety of connectors to create some cohesion.",
        "Response demonstrates some features of the intended key language use (Narrate, Inform, Explain, Argue).",
        "Response contains a variety of sentence structures with consistently clear meaning, though occasional errors may be present.",
        "Response uses a variety of words and phrases with some precision that are usually appropriate to the task context."
      ],
      "5": [
        "Response has a clear organizational pattern with some elaboration. Response uses connectors that join ideas together and these are usually used appropriately.",
        "Response contains some compound or complex sentence structures with generally clear meaning, though they may include some errors.",
        "Response uses a range of words and phrases that are generally appropriate and show emerging precision, including some words and phrases related to the task context."
      ],
      "4": [
        "Response uses connectors and may have some evidence of an organizational pattern, though longer responses in particular may lack coherence.",
        "Response contains some compound or complex sentences, though errors may obscure meaning.",
        "Response uses a range of words and phrases from beyond the stimulus that generally convey the intended meaning."
      ],
      "3": [
        "Response shows connected text, which may include some simple connectors (e.g., and, then, but), though they may be used repetitively and may not always be used accurately.",
        "Response contains some complete sentences, though frequent errors may obscure meaning.",
        "Response uses some original words and phrases, in addition to language drawn from the stimulus."
      ],
      "2": [
        "Response includes at least one clear, complete sentence, but does not include connected text.",
        "Response uses a small number of original words and phrases, in addition to language drawn from the stimulus."
      ],
      "1": [
        "Response includes at least one recognizable word in English, and may contain attempts at phrases or sentences, but does not include any clear, complete sentences."
      ],
      "0": [
        "Multiple conditions warrant a score of 0, including: no discernible English words, entirely off-task content, entirely in non-English language, verbatim copying without reformulation, blank responses, and plagiarized content."
      ]
    },
    confirms_current_klu_taxonomy: "Score points 6 and 7 explicitly name 'the intended key language use (Narrate, Inform, Explain, Argue)' verbatim from the official rubric \u2014 confirms the CURRENT (2020 Edition) WIDA Key Language Use taxonomy used in actual ACCESS scoring is Narrate/Inform/Explain/Argue, not Recount/Explain/Argue/Discuss.",
    note_vs_app: "goELprep's current writing.ts rubric is an independently-invented weighted point system (Can-Do alignment 30pts / task completion 25pts / language production 25pts / length-format 20pts), which does not map onto WIDA's actual 0-7 score-point scale or its descriptor language at all \u2014 not just a different weighting, a structurally different rubric. Not yet reconciled. Score point 0's disqualifying conditions (off-task, non-English, copied, blank, plagiarized) also don't appear to have an equivalent in the app's current scoring logic."
  },
  klu_taxonomy_note: {
    current_2020_edition: ["Narrate", "Inform", "Explain", "Argue"],
    superseded_2016_can_do_key_uses_edition: ["Recount", "Explain", "Argue", "Discuss"],
    relationship: "Per WIDA's own Key Language Uses FAQ: 'Recount (2016) was divided into Narrate and Inform (2020) to better differentiate among the characteristics of the wide varieties of texts that were found under Recount.' 'Discuss (2016) is technically not a genre family' and was embedded across all four current uses rather than retained standalone. WIDA's own FAQ also states: 'The Can Do Descriptors have not yet been updated to reflect the 2020 Edition; however, they remain available as a valuable tool' \u2014 meaning there is no official Narrate/Inform-edition Can Do Descriptors document to swap in; splitting Recount into Narrate vs Inform per Can Do item would be original content-authoring work, not a data swap.",
    correction_to_earlier_claim: "An earlier pass in this project incorrectly stated 'Recount isn't a WIDA Key Language Use at all.' That was wrong \u2014 Recount is a real, WIDA-published Key Use, just from the superseded 2016 Can Do Descriptors Key Uses Edition. The app's KEY_USE_ROTATION (Recount/Explain/Argue) is outdated relative to current ACCESS scoring terminology (Narrate/Inform/Explain/Argue), not simply incorrect."
  }
};

// src/lib/wida-access-rubric.ts
var SPEAKING_CATEGORIES_HIGH_TO_LOW = wida_scoring_rubrics_data_default.speaking_rubric.categories_high_to_low;
var ACCESS_LANGUAGE_FORMS = ["discourse", "sentence", "word_phrase"];

// src/lib/claude/speaking.ts
var ACCESS_SCORING_DIMENSIONS = [...ACCESS_LANGUAGE_FORMS];

// src/lib/claude/prompts/wida-feedback-guide.ts
var FEEDBACK_KERNEL = `
You are a WIDA ACCESS practice coach for Grade 6\u20138 English learners.
This is practice coaching using ACCESS speaking/writing scoring language, not an official ACCESS score. Do not print score labels or 0\u20137 numbers to the student.
Judge only THIS item, THIS prompt, THIS level. Do not punish accent.
Use only facts in the user message (picture, task on screen, student answer). Do not invent objects, places, starters, or extra tasks.
Do not grade science/math facts the student was never given.
Return ONLY valid JSON with every key in OUTPUT SCHEMA. No preamble, no markdown, no code fences.
Mark 1\u20132 key words with *asterisks* for spoken stress.
No emojis.

If this item is listening or reading selected-response: YOU set meets_task from the student answer vs the correct option/target in the user message.
meets_task true (or judgment agree) means they can go Next. Otherwise they should Try again or Skip.
If answer_correct / meets_task is true on other domains: warm praise. Name what they got right. Never "not yet."
If false on other domains: follow THIS domain's slice. Do not copy another domain.
`.trim();
var LISTENING_1_2 = `
DOMAIN: LISTENING  |  BAND: levels 1\u20132  |  picture + short audio
Evidence is the AUDIO and the picture on screen. Never world knowledge.
Wrong: ONLY the clue (see pacing). Do not say what they chose. Do not quote the audio. Do not retell the passage.
Right: one short sentence. Name the object they found.
Do not coach speaking or writing.
`.trim();
var LISTENING_3_6 = `
DOMAIN: LISTENING  |  BAND: levels 3\u20136  |  longer audio, selected response
Evidence is THIS listening (and on-screen picture if any). Never world knowledge.
Wrong: up to 4 short sentences. Point to the phrase in the audio that supports the right option.
L3: short familiar paragraph; main idea vs detail.
L4: paragraph-length talk; main idea vs detail, not "guess."
L5: gist, sequence, speaker purpose.
L6: inference only if the audio supports it.
Right: name what they understood. Do not retell the whole passage.
Do not coach oral production or writing frames.
`.trim();
var READING_1_2 = `
DOMAIN: READING  |  BAND: levels 1\u20132  |  very short text
Evidence is THIS passage only. Multiple choice has 3 options (1 correct + 2 distractors).
Wrong: one short sentence. Quote or paraphrase the line that has the answer. The right one is *Y*.
Right: you found the word/detail. Proud, short.
Do not use listening-audio language. Do not coach speaking.
`.trim();
var READING_3_6 = `
DOMAIN: READING  |  BAND: levels 3\u20136  |  paragraph and extended text
Evidence is THIS passage only.
Wrong: up to 4 short sentences. Point to the evidence in the text.
L3: main idea and supporting detail.
L4: compare or infer from evidence in the text.
L5\u20136: author's purpose or relationships between ideas \u2014 still only from this passage.
Right: name the skill they used. Do not retell the whole passage.
Do not coach speaking or writing length.
`.trim();
var SPEAKING_1_2 = `
DOMAIN: SPEAKING  |  BAND: levels 1\u20132  |  ACCESS practice for Grade 6\u20138

Two checks, in this order:
1. ACCESS speaking rubric (5 categories in the user message).
2. Did THIS RESPONSE do WHAT WAS ASKED, at THIS level (pld)? You also get LAST RESPONSE and LAST TIP on a retry.

Evidence: on-screen task, picture, transcript. Do not punish accent. STT may be messy. Use only those facts.

PASS: the asked job is done AND there is no clear teachable language slip. spoken_text = praise only.

NOT YET: the job is missing, OR there is a teachable language slip \u2014 follow LANGUAGE FORMS \u2014 CORRECT GRAMMAR below.
spoken_text NOT YET: use " || " between (1) brief praise (2) "Listen." + mistake with *wrong word* (3) simple rule (4) short try-step \u2014 so TTS pauses between mistake and instruction.
model_response: at most ONE short phrase they can say aloud \u2014 never a full answer to recite.
On retry: PASS only if they revised in their own words and fixed the coached gap \u2014 not if they copied coaching.

Coach in Discourse, Sentence, Word-Phrase. Do not say category names. Do not say "Tap Next" or "Tap Try again".
meets_task is true only for agree.
`.trim();
var SPEAKING_3_6 = `
DOMAIN: SPEAKING  |  BAND: levels 3\u20136  |  longer oral discourse

Two checks, in this order:
1. Score holistically on ACCESS speaking rubric (official categories in the user message). Do not show category names to the student.
2. Compatible with THIS task? If the response does not do the prompt's job, or is weaker than end-of-level pld, it is NOT YET.

PASS: they did this task in English that matches this level with no teachable language slip. Praise only.
NOT YET: the job is missing or there is a teachable language slip \u2014 follow LANGUAGE FORMS \u2014 CORRECT GRAMMAR below.
spoken_text NOT YET: use " || " between praise, "Listen."+mistake, rule, and try-step.

L3: 3\u20135 sentences with a sequence word. L4: short organized paragraph. L5\u20136: extended organized talk.
On retry: PASS only if they fixed the last tip in their own words \u2014 not if they recited coaching.
meets_task = true only for agree.
`.trim();
var WRITING_1_2 = `
DOMAIN: WRITING  |  BAND: levels 1\u20132

Two checks, in this order:
1. ACCESS writing rubric 0\u20137 (in the user message).
2. Did THIS SUBMIT do WHAT WAS ASKED, at THIS level (pld)? You also get LAST SUBMIT and LAST TIP on a retry.

PASS: the asked job is done AND there is no clear teachable language slip. spoken_text = praise only.

NOT YET: the job is missing, OR there is a teachable language slip \u2014 follow LANGUAGE FORMS \u2014 CORRECT GRAMMAR below.
Never give "You can write:" or full example sentences. model_response must be "".
spoken_text NOT YET: use " || " between (1) brief praise (2) "Listen." + mistake with *wrong word* (3) simple rule (4) short try-step \u2014 so TTS pauses between mistake and instruction.
On retry: PASS only if they revised in their own words and fixed the coached gap \u2014 not if they pasted coaching.

Coach in Discourse, Sentence, Word-Phrase. Do not say 0\u20137 numbers. Do not coach pronunciation.
`.trim();
var WRITING_3_6 = `
DOMAIN: WRITING  |  BAND: levels 3\u20136  |  connected and organized text

Two checks, in this order:
1. Score holistically on ACCESS writing rubric 0\u20137 (in the user message). Do not show 0\u20137 numbers to the student.
2. Compatible with THIS task? If the writing does not do the prompt's job, or is weaker than end_of_level_writing in the user JSON, it is NOT YET. Coach the gap (organization, how ideas stick, detail, sentences, words). Do not ask for the next English level.

PASS: they did this task in English that matches this level with no teachable language slip. Praise only. The app says Tap Next.
NOT YET: the job is missing or there is a teachable language slip \u2014 follow LANGUAGE FORMS \u2014 CORRECT GRAMMAR below. The app says Tap Try again. Do not praise as finished.

L3: one short paragraph, main idea + details (4+ sentences); simple connectors.
L4: two paragraphs, topic sentence + support.
L5\u20136: multi-paragraph with intro/body/conclusion; explain or argue with reasons.
Coach in Discourse, Sentence, Word-Phrase. Do not coach oral pronunciation. Do not retell a listening passage.
`.trim();
var PICTURE_LOOKS_1_2 = `
WHEN A PICTURE IS ON SCREEN (levels 1-2, every domain):
Wrong answer: object_clue = spoken_text = ONE clue. Same words. No second sentence that repeats it.
Do not quote the audio. Do not say "when you hear the sentence again". Do not list tags.
If the object is NOT in the photo: one short line (it is not here / you will not find it).
`.trim();

// src/lib/claude/item-feedback.ts
var SPEAKING_COACH_ALOUD = `
SPEAKING COACHING \u2014 TEACHER VOICE (same classroom style as writing)
\u2022 spoken_text NOT YET: use " || " between blocks so TTS pauses \u2014 praise | "Listen." + mistake with *wrong word* | simple rule | short try-step.
\u2022 Example: "You named the place well. || Listen. You said *students* but the picture shows one student. || One person takes *student*, not *students*. || Say that part again with *student*."
\u2022 model_response: at most ONE short corrected phrase they can say aloud \u2014 never a full paragraph to recite as their answer.
\u2022 On retry: meets_task false if they mostly copy prior coaching instead of revising in their own words.
\u2022 PASS: praise only in spoken_text; try_again_tip empty; model_response empty.
\u2022 Follow LANGUAGE FORMS \u2014 CORRECT GRAMMAR. One gap per try. Do not punish accent or STT noise.
`.trim();
var WRITING_COACH_NO_MODEL = `
WRITING COACHING \u2014 NO PASTE-READY ANSWERS
\u2022 model_response must always be "" for writing.
\u2022 spoken_text and try_again_tip: what is wrong, why (simple), one revision hint only.
\u2022 Never "You can write:", "Try writing:", "Example response:", or full sentences they could copy.
\u2022 On retry: meets_task false if they pasted or lightly edited prior coaching instead of revising in their own words.

SPOKEN ALOUD \u2014 separate blocks with " || " (pause between each; student must hear mistake vs rule vs try)
1. Optional brief praise
2. Mistake block \u2014 start with "Listen." Point to the error; wrap the wrong word in *asterisks* (e.g. You wrote *is*.)
3. Rule block \u2014 one simple why (e.g. Two things take *are*, not *is*.)
4. Try block \u2014 one short action (change that word, reread)
Example shape: "You gave a good reason. || Listen. You wrote *is* \u2014 line breaks and stanzas are two things. || When you have two things, use *are*. || Change that one word and reread."
`.trim();
var ITEM_OUTPUT_SCHEMA = `
OUTPUT SCHEMA \u2014 return every key. Never omit a field. Use "" or [] only when that field does not apply to THIS domain. Do not drop coaching into a missing key.
{
  "judgment": "agree | partial | rejected",
  "spoken_text": "<required: what the student hears \u2014 praise if done; how to meet THIS framework job if not>",
  "headline": "<required short title>",
  "why_wrong": "<levels 3\u20136: what missed; levels 1\u20132: empty string>",
  "correct_answer": "<selected-response label or empty>",
  "object_clue": "<listening picture: same words as spoken_text when they missed; else empty>",
  "model_response": "<speaking not yet: one short phrase they can try; writing: always empty string>",
  "how_to_say_it": "<speaking: pronunciation/frame hint if needed; else empty>",
  "keep_in_mind": ["<optional short reminder; [] if none>"],
  "strengths": [],
  "next_steps": [],
  "try_again_tip": "<not yet: one next-try line; empty on agree>",
  "meets_task": true,
  "access_category": "Exemplary | Strong | Adequate | Attempted | No Response",
  "score_point": 0
}
SCHEMA ENFORCEMENT
\u2022 Always set judgment, spoken_text, headline, meets_task. spoken_text must never be missing.
\u2022 Speaking: always set access_category. judgment and meets_task stay in the JSON (code may recompute them).
\u2022 Writing: always set score_point 0\u20137 AND judgment and meets_task.
\u2022 Listening/reading/picture: still set judgment, spoken_text, meets_task, headline, correct_answer. access_category and score_point may be unused but keep the keys (use "" / 0).
\u2022 Speaking not yet: model_response may hold one short phrase; spoken_text coaches aloud.
\u2022 Writing not yet: model_response must be ""; coach only in spoken_text / try_again_tip (hint-only, no full answer).
\u2022 strengths and next_steps: [] for item coaching (end-of-session uses those keys). keep_in_mind: fill if useful, else [].
\u2022 meets_task is true only when judgment is agree.
\u2022 Do not name ACCESS categories or 0\u20137 numbers in student-facing strings.
`.trim();

// scripts/listening-passage-question-audit.ts
var __dirname = path4.dirname(fileURLToPath2(import.meta.url));
var REPORTS = path4.join(__dirname, "../reports");
var SAMPLES = Number(process.env.ALIGNMENT_SAMPLES ?? "10");
var SLEEP_MS = Number(process.env.ALIGNMENT_SLEEP_MS ?? "400");
var SUBJECTS = ["ela", "math", "science", "social_studies"];
function sleep2(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function questionsInScript(script) {
  const out = [];
  for (const part of script.split(/(?<=[.!?])\s+/)) {
    const t = part.trim();
    if (t.includes("?")) out.push(t);
  }
  return out;
}
function normalize(s) {
  return s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}
function wordSet(s) {
  const stop = /* @__PURE__ */ new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "of",
    "in",
    "on",
    "for",
    "is",
    "are",
    "was",
    "were",
    "what",
    "why",
    "how",
    "when",
    "where",
    "who",
    "which",
    "do",
    "does",
    "did",
    "can",
    "could",
    "this",
    "that",
    "these",
    "those",
    "it",
    "they",
    "we",
    "you",
    "your",
    "from",
    "with",
    "about"
  ]);
  return new Set(
    normalize(s).split(" ").filter((w) => w.length > 2 && !stop.has(w))
  );
}
function overlapRatio(a, b) {
  const A = wordSet(a);
  const B = wordSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit += 1;
  return hit / Math.min(A.size, B.size);
}
function analyzeAlignment(sample) {
  const flags = [];
  const scriptQs = questionsInScript(sample.audioScript);
  const studentQs = sample.questions.map((q) => q.question.trim()).filter(Boolean);
  if (scriptQs.length > 0 && studentQs.length > 0) {
    for (const sq of scriptQs) {
      let best = 0;
      let bestStudent = "";
      for (const uq of studentQs) {
        const r = overlapRatio(sq, uq);
        if (r > best) {
          best = r;
          bestStudent = uq;
        }
      }
      if (best < 0.15) {
        flags.push(
          `passage_asks_unmatched: script contains "${sq.slice(0, 80)}${sq.length > 80 ? "\u2026" : ""}" but no student question overlaps (best=${(best * 100).toFixed(0)}% vs "${bestStudent.slice(0, 60)}\u2026")`
        );
      } else if (best < 0.35 && !normalize(bestStudent).includes(normalize(sq).slice(0, 20))) {
        flags.push(
          `passage_question_weak_match: script question may not match assessed item (overlap ${(best * 100).toFixed(0)}%)`
        );
      }
    }
  }
  for (let i = 0; i < sample.questions.length; i += 1) {
    const q = sample.questions[i];
    const stem = q.question ?? "";
    const pool2 = [
      stem,
      ...q.options ?? [],
      ...q.items ?? []
    ].join(" ");
    const r = overlapRatio(sample.audioScript, pool2);
    if (r < 0.12) {
      flags.push(
        `Q${i + 1}_low_passage_overlap: stem/options share few words with audio_script (${(r * 100).toFixed(0)}%) \u2014 "${stem.slice(0, 70)}\u2026"`
      );
    }
  }
  const topicNorm = normalize(sample.topic);
  if (topicNorm.length > 4) {
    const scriptHasTopic = normalize(sample.audioScript).includes(topicNorm.split(" ")[0] ?? "");
    if (!scriptHasTopic && overlapRatio(sample.topic, sample.audioScript) < 0.1) {
      flags.push(`topic_drift: topic "${sample.topic}" weakly reflected in audio_script`);
    }
  }
  return [...new Set(flags)];
}
async function runSample(index4) {
  const level = 1 + index4 % 6;
  const subject = SUBJECTS[index4 % SUBJECTS.length];
  const keyUse = ["Narrate", "Inform", "Explain", "Argue"][index4 % 4];
  const recent = [{ subject, keyUse }];
  const acadCtx = buildAcademicListeningContext(level + index4 * 0.2, [], null, null, recent);
  const sessionCtx = buildAcademicSessionContext(subject, level + index4 * 0.2, null, []);
  const topic = sessionCtx.topicLabel ?? `Audit listening ${subject} L${level}`;
  const useGeneral = level >= 3 && index4 % 2 === 0;
  const common = {
    level: acadCtx.elpLevel,
    fractionalLevel: acadCtx.fractionalLevel,
    stepWithinLevel: acadCtx.stepWithinLevel,
    complexityInstruction: acadCtx.complexityInstruction,
    oralFormat: acadCtx.oralFormat,
    permittedFormats: acadCtx.permittedFormats,
    framework: acadCtx.framework,
    topic,
    libraryCandidates: [],
    varietySeed: index4
  };
  let content;
  let generator;
  if (useGeneral) {
    content = await generateListeningContent({ ...common, topic });
    generator = "general_listening";
  } else if (subject === "math") {
    content = await generateAcademicMathListeningContent({
      ...common,
      mathUnit: sessionCtx.unit ?? "Number sense",
      mathScenario: sessionCtx.scenarioExamples?.[0] ?? "classroom",
      tier3Vocabulary: sessionCtx.tier3Vocabulary ?? [],
      frameworkContext: sessionCtx
    });
    generator = "academic_math";
  } else if (subject === "science") {
    content = await generateAcademicScienceListeningContent({
      ...common,
      scienceUnit: sessionCtx.unit ?? "Life Science",
      scienceStrand: sessionCtx.strand ?? "Ecosystems",
      scenarioExamples: sessionCtx.scenarioExamples ?? [],
      tier3Vocabulary: sessionCtx.tier3Vocabulary ?? [],
      frameworkContext: sessionCtx
    });
    generator = "academic_science";
  } else if (subject === "social_studies") {
    content = await generateAcademicSocialStudiesListeningContent({
      ...common,
      ssUnit: sessionCtx.unit ?? "Civics",
      ssStrand: sessionCtx.strand ?? "Government",
      scenarioExamples: sessionCtx.scenarioExamples ?? [],
      tier3Vocabulary: sessionCtx.tier3Vocabulary ?? [],
      frameworkContext: sessionCtx
    });
    generator = "academic_social_studies";
  } else {
    content = await generateAcademicElaListeningContent({
      ...common,
      elaUnit: sessionCtx.unit ?? "Reading literature",
      elaGenre: sessionCtx.genre ?? "informational",
      scenarioExamples: sessionCtx.scenarioExamples ?? [],
      tier3Vocabulary: sessionCtx.tier3Vocabulary ?? [],
      frameworkContext: sessionCtx
    });
    generator = "academic_ela";
  }
  const base = {
    id: index4 + 1,
    generator,
    level: acadCtx.elpLevel,
    subject,
    keyUse: acadCtx.keyUse,
    topic: content.topic,
    context: content.context,
    audioScript: content.audioScript,
    questions: (content.questions ?? []).map((q) => ({
      type: q.type,
      question: q.question,
      options: q.options,
      items: q.items
    }))
  };
  return { ...base, flags: analyzeAlignment(base) };
}
function toMarkdown(samples, started) {
  const flagged = samples.filter((s) => s.flags.length > 0);
  const lines = [
    "# Listening passage \u2194 question alignment sample",
    "",
    `Generated: ${(/* @__PURE__ */ new Date()).toISOString()}`,
    `Started: ${started}`,
    `Samples: ${samples.length}`,
    "",
    "## Summary",
    "",
    `| Metric | Value |`,
    `|--------|------:|`,
    `| Sessions with heuristic flags | **${flagged.length}** / ${samples.length} |`,
    `| Total flags | **${samples.reduce((n, s) => n + s.flags.length, 0)}** |`,
    "",
    "Heuristics: rhetorical `?` in audio_script vs student question overlap; word overlap between script and each question stem/options.",
    ""
  ];
  for (const s of samples) {
    lines.push(`---`, "");
    lines.push(`## Sample ${s.id} \u2014 L${s.level} ${s.subject} / ${s.keyUse} (${s.generator})`);
    lines.push("");
    lines.push(`**Topic:** ${s.topic}`);
    lines.push(`**Context:** ${s.context}`);
    if (s.flags.length > 0) {
      lines.push("");
      lines.push("**Flags:**");
      for (const f of s.flags) lines.push(`- ${f}`);
    } else {
      lines.push("");
      lines.push("**Flags:** none (heuristic)");
    }
    lines.push("");
    lines.push("### Audio script");
    lines.push("");
    lines.push(s.audioScript);
    lines.push("");
    lines.push("### Student questions");
    lines.push("");
    s.questions.forEach((q, i) => {
      lines.push(`${i + 1}. **(${q.type})** ${q.question}`);
      if (q.options?.length) lines.push(`   - Options: ${q.options.join(" | ")}`);
      if (q.items?.length) lines.push(`   - Items: ${q.items.join(" | ")}`);
      lines.push("");
    });
  }
  return lines.join("\n");
}
async function main() {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error("ANTHROPIC_API_KEY required");
    process.exit(1);
  }
  fs2.mkdirSync(REPORTS, { recursive: true });
  const started = (/* @__PURE__ */ new Date()).toISOString();
  const samples = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    process.stdout.write(`[${i + 1}/${SAMPLES}] listening alignment\u2026 `);
    try {
      const s = await runSample(i);
      samples.push(s);
      console.log(s.flags.length ? `flags=${s.flags.length}` : "ok");
    } catch (err) {
      console.log(`FAIL ${err instanceof Error ? err.message : String(err)}`);
    }
    if (i + 1 < SAMPLES && SLEEP_MS > 0) await sleep2(SLEEP_MS);
  }
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const md = path4.join(REPORTS, `listening-passage-question-alignment-${stamp}.md`);
  fs2.writeFileSync(md, toMarkdown(samples, started), "utf8");
  console.log(`
Wrote ${md}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
