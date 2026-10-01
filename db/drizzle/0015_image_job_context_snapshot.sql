ALTER TABLE "image_generation_jobs"
  ADD COLUMN IF NOT EXISTS "context_snapshot" jsonb;
