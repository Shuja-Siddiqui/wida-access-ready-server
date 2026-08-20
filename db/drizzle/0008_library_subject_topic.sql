-- Migration 0008: Library image concept label
-- Adds image_concept (e.g. "Chromosomes", "Westward Expansion") to library rows
-- so the AI content generator has the specific concept the image depicts when
-- writing passages and questions.  Subject categorisation is handled by themes.
ALTER TABLE library ADD COLUMN IF NOT EXISTS image_concept TEXT;
