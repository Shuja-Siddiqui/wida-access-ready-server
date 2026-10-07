-- Auth session context + indexes for single-device student login enforcement.
ALTER TABLE "user_sessions" ADD COLUMN IF NOT EXISTS "user_agent" text;
--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN IF NOT EXISTS "ip_address" text;
--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN IF NOT EXISTS "last_active_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_sessions_user_id_user_type_idx" ON "user_sessions" ("user_id", "user_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_user_id_user_type_idx" ON "refresh_tokens" ("user_id", "user_type");
