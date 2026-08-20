-- Allow level 0 (Pre-Entry) as the minimum starting level.
-- The default is updated from 1.00 to 0.00 so new students start at Pre-Entry
-- when no official score has been entered by a teacher.
ALTER TABLE student_levels ALTER COLUMN current_level SET DEFAULT '0.00';
