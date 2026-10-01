ALTER TABLE "library"
  ADD COLUMN IF NOT EXISTS "ingest_source" text DEFAULT 'admin_upload' NOT NULL;

ALTER TABLE "library"
  ADD COLUMN IF NOT EXISTS "generation_backend" text;
