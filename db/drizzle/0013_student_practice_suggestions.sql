CREATE TABLE IF NOT EXISTS "student_practice_suggestions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "domain" text NOT NULL,
  "message" text NOT NULL,
  "source_session_id" uuid REFERENCES "sessions"("id") ON DELETE SET NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_practice_suggestions_student_domain_unique"
  ON "student_practice_suggestions" ("student_id", "domain");
