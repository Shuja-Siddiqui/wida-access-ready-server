import { pgTable, uuid, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const libraryTable = pgTable("library", {
  id:               uuid("id").primaryKey().defaultRandom(),
  s3Key:            text("s3_key").notNull(),
  /** S3 key for 200 px-wide JPEG thumbnail generated on upload */
  thumbnailKey:     text("thumbnail_key"),
  /** S3 key for 600 px-wide JPEG medium image generated on upload */
  mediumKey:        text("medium_key"),
  contentType:      text("content_type").notNull().default("image/jpeg"),
  sizeBytes:        integer("size_bytes"),
  /** Confirmed labels that OWL-ViT / Grounding DINO found in the image */
  tags:             jsonb("tags").$type<string[]>().notNull().default([]),
  /** Raw candidate nouns Claude described from the image */
  description:      text("description"),
  /** Full detection payload from the last /detect call on this image */
  detectionResults: jsonb("detection_results").$type<Record<string, unknown>>(),
  /**
   * Intended usage contexts for this image. Controls which session types can use it.
   * Values: "general" | "academic:math" | "academic:science" | "academic:social_studies" | "academic:ela"
   * An image can belong to multiple contexts (e.g. a library photo → ["general","academic:ela"]).
   * Empty array = uncategorised; treated as general for backward compat in image queries.
   */
  contexts:         text("contexts").array().notNull().default([]),
  /** The user who uploaded this image (super_admin, district_admin, principal). Null = anonymous. */
  uploaderId:       uuid("uploader_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /**
   * Specific academic concept depicted in the image, e.g. "Chromosomes",
   * "Cell Membrane", "Westward Expansion", "Ancient Rome".
   * Passed directly to the AI so the passage + questions are concept-accurate.
   * Null = not yet labelled.
   */
  imageConcept:     text("image_concept"),
  /**
   * Per-subject academic vision analysis produced by Claude Vision at upload/processing time.
   * Key = AcademicSubject ("math" | "science" | "social_studies" | "ela").
   * Value = { concept, description, tags } — used by academic image-tap content generator
   * instead of the sparse Grounding DINO object labels.
   */
  academicVision:   jsonb("academic_vision").$type<Record<string, AcademicVisionResult>>().notNull().default({}),
});

/** Shape of one subject's vision analysis result. Stored in academicVision keyed by subject. */
export type AcademicVisionResult = {
  /** One-sentence summary of the academic concept depicted. */
  concept: string;
  /**
   * 2–3 sentences describing what this image teaches from an educational perspective.
   * Used as imageDescription for the passage generator so the passage is concept-accurate
   * rather than describing generic objects. Bounding boxes come from Grounding DINO separately.
   */
  description: string;
  /** Short 1–4 word topic label, e.g. "Chromosomes". Used to fill library.image_concept. */
  topic?: string;
};

export type LibraryItem       = typeof libraryTable.$inferSelect;
export type InsertLibraryItem = typeof libraryTable.$inferInsert;
