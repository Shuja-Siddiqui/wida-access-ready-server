-- WIDA practice exit is 4.7 on every domain (not 6.0 Reaching).
ALTER TABLE student_levels ALTER COLUMN exit_threshold SET DEFAULT '4.70';

UPDATE student_levels sl
SET
  exit_threshold = '4.70',
  at_exit = (sl.current_level::numeric >= 4.70)
FROM students s
WHERE sl.student_id = s.id
  AND s.state_assessment = 'WIDA';
