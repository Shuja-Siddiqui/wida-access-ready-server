-- Admin / image-factory Claude calls (no student session).
ALTER TABLE ai_token_calls
  ALTER COLUMN student_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE ai_token_calls
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ai_token_calls
  ADD COLUMN IF NOT EXISTS image_job_id UUID REFERENCES image_generation_jobs(id) ON DELETE SET NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_token_calls_actor_check'
  ) THEN
    ALTER TABLE ai_token_calls
      ADD CONSTRAINT ai_token_calls_actor_check
      CHECK (student_id IS NOT NULL OR user_id IS NOT NULL);
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_token_calls_user_created_idx
  ON ai_token_calls (user_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_token_calls_image_job_idx
  ON ai_token_calls (image_job_id);
