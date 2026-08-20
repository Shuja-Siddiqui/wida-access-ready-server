-- Migration: rename uploaded_by → uploader_id on library table
-- Reflects that this column tracks who uploaded the image (super_admin / district_admin / principal),
-- not just any arbitrary owner.
-- Applied to: Replit dev DB + AWS RDS production DB

ALTER TABLE "library" RENAME COLUMN "uploaded_by" TO "uploader_id";
--> statement-breakpoint
DROP INDEX IF EXISTS "library_uploaded_by_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_uploader_id_idx" ON "library" ("uploader_id");
