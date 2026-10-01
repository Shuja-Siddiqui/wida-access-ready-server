import { pgTable, uuid, text, integer, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { topicsTable } from "./topics";
import { libraryTable } from "./library";

/** Standard Framework / pool subject for image generation. */
export const IMAGE_FACTORY_SUBJECTS = [
  "ela",
  "math",
  "science",
  "social_studies",
] as const;
export type ImageFactorySubject = typeof IMAGE_FACTORY_SUBJECTS[number];

export const IMAGE_GENERATION_JOB_STATUSES = [
  "prompt_ready",
  "generated",
  "ingested",
  "failed",
] as const;
export type ImageGenerationJobStatus = typeof IMAGE_GENERATION_JOB_STATUSES[number];

/** Academic context frozen at prompt time (unit, scenario, tier-3) for ingest. */
export type ImageJobContextSnapshot = {
  academicUnit?: string | null;
  academicScenario?: string | null;
  tier3Vocabulary?: string[];
  topicLabel?: string | null;
};

/**
 * Tracks visual complexity progression per Standard Framework × ELP level pool.
 * Each successful ingest bumps lastComplexityStep (0–4).
 */
export const imageGenerationPoolsTable = pgTable(
  "image_generation_pools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subject: text("subject").notNull(),
    level: integer("level").notNull(),
    lastComplexityStep: integer("last_complexity_step").notNull().default(0),
    lastGeneratedAt: timestamp("last_generated_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("image_generation_pools_subject_level_idx").on(t.subject, t.level),
  ],
);

/**
 * Audit trail for super-admin image factory runs (prompt → HF → library ingest).
 */
export const imageGenerationJobsTable = pgTable("image_generation_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  level: integer("level").notNull(),
  complexityStep: integer("complexity_step").notNull(),
  topicId: uuid("topic_id").references(() => topicsTable.id, { onDelete: "set null" }),
  keyUse: text("key_use"),
  focus: text("focus"),
  claudeRationale: text("claude_rationale"),
  contextSnapshot: jsonb("context_snapshot").$type<ImageJobContextSnapshot | null>(),
  hfPrompt: text("hf_prompt").notNull(),
  suggestedObjects: jsonb("suggested_objects").$type<string[]>().notNull().default([]),
  imageConcept: text("image_concept"),
  status: text("status").notNull().default("prompt_ready"),
  libraryImageId: uuid("library_image_id").references(() => libraryTable.id, { onDelete: "set null" }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ImageGenerationPool = typeof imageGenerationPoolsTable.$inferSelect;
export type InsertImageGenerationPool = typeof imageGenerationPoolsTable.$inferInsert;
export type ImageGenerationJob = typeof imageGenerationJobsTable.$inferSelect;
export type InsertImageGenerationJob = typeof imageGenerationJobsTable.$inferInsert;
