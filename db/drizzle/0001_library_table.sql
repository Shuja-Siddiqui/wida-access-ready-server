-- Migration: create library table
-- Stores detect-page image uploads: S3 key, AI-confirmed tags, description, and detection results.
-- Applied to: Replit dev DB + AWS RDS production DB

CREATE TABLE IF NOT EXISTS "library" (
  "id"                uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "s3_key"            text        NOT NULL,
  "content_type"      text        NOT NULL DEFAULT 'image/jpeg',
  "size_bytes"        integer,
  "tags"              jsonb       NOT NULL DEFAULT '[]',
  "description"       text,
  "detection_results" jsonb,
  "uploaded_by"       uuid        REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_uploaded_by_idx" ON "library" ("uploaded_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_created_at_idx"  ON "library" ("created_at" DESC);
