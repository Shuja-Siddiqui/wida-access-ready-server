CREATE TABLE IF NOT EXISTS "image_generation_pools" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "subject" text NOT NULL,
  "level" integer NOT NULL,
  "last_complexity_step" integer DEFAULT 0 NOT NULL,
  "last_generated_at" timestamptz,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "image_generation_pools_subject_level_idx"
  ON "image_generation_pools" ("subject", "level");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "image_generation_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "subject" text NOT NULL,
  "level" integer NOT NULL,
  "complexity_step" integer NOT NULL,
  "topic_id" uuid REFERENCES "topics"("id") ON DELETE SET NULL,
  "key_use" text,
  "focus" text,
  "claude_rationale" text,
  "hf_prompt" text NOT NULL,
  "suggested_objects" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "image_concept" text,
  "status" text DEFAULT 'prompt_ready' NOT NULL,
  "library_image_id" uuid REFERENCES "library"("id") ON DELETE SET NULL,
  "error" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "image_generation_jobs_created_by_idx"
  ON "image_generation_jobs" ("created_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "image_generation_jobs_status_created_at_idx"
  ON "image_generation_jobs" ("status", "created_at" DESC);
