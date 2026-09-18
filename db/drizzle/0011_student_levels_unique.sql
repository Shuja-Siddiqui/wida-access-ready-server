-- One adaptive level row per (student, domain, tier). Required for session-complete upserts.
DELETE FROM student_levels sl
USING student_levels sl2
WHERE sl.student_id = sl2.student_id
  AND sl.domain = sl2.domain
  AND sl.tier = sl2.tier
  AND (
    sl.updated_at < sl2.updated_at
    OR (sl.updated_at = sl2.updated_at AND sl.id::text > sl2.id::text)
  );
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_levels_student_id_domain_tier_unique" ON "student_levels" USING btree ("student_id","domain","tier");
