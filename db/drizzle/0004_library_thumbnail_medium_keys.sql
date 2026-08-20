-- Add thumbnail and medium S3 key columns to library table
ALTER TABLE library ADD COLUMN IF NOT EXISTS thumbnail_key text;
ALTER TABLE library ADD COLUMN IF NOT EXISTS medium_key text;
