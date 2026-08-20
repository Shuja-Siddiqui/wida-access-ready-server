-- Migration 0007: Academic listening tier
-- Adds a subject column to sessions so academic sessions can carry
-- the subject area (math / science / social_studies / ela) that was
-- active for that session.  Null for general listening and all other domains.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS subject TEXT;
