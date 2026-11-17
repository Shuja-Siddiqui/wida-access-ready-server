CREATE TABLE IF NOT EXISTS "student_teacher_assignments" (
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "teacher_profile_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("student_id", "teacher_profile_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_teacher_assignments_teacher_idx"
  ON "student_teacher_assignments" ("teacher_profile_id");
--> statement-breakpoint
INSERT INTO "student_teacher_assignments" ("student_id", "teacher_profile_id")
SELECT "id", "guardian_id"
FROM "students"
WHERE "guardian_id" IS NOT NULL
ON CONFLICT DO NOTHING;