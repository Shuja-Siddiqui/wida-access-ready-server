-- Migration 0006: object mastery tracking + image-session columns on sessions
-- ---------------------------------------------------------------------------
-- 1. Add image-context columns to sessions so we know which image and labels
--    were used in each image-library session (levels 0–2). This is the anchor
--    for mastery lookups at complete-time.
--
-- 2. Create student_object_mastery table with a unique constraint on
--    (student_id, image_id, label) so upserts are safe and idempotent.

-- Sessions: image context (nullable — only populated for image-library sessions)
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS library_image_id UUID,
  ADD COLUMN IF NOT EXISTS image_tags       JSONB;

-- Object mastery table
CREATE TABLE IF NOT EXISTS student_object_mastery (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  image_id        UUID        NOT NULL REFERENCES library(id)  ON DELETE CASCADE,
  label           TEXT        NOT NULL,
  correct_count   INTEGER     NOT NULL DEFAULT 1,
  last_correct_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- suppressUntil is recomputed on every upsert.
  -- Schedule: 1 correct → +7 days, 2 → +14 days, 3+ → +30 days.
  suppress_until  TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT student_object_mastery_unique UNIQUE (student_id, image_id, label)
);

CREATE INDEX IF NOT EXISTS idx_som_student_image
  ON student_object_mastery (student_id, image_id);

CREATE INDEX IF NOT EXISTS idx_som_suppress_until
  ON student_object_mastery (suppress_until);
