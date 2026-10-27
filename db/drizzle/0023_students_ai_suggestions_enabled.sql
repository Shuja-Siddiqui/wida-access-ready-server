ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "ai_suggestions_enabled" boolean NOT NULL DEFAULT true;
