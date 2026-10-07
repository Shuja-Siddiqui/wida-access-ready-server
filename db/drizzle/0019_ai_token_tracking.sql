CREATE TABLE IF NOT EXISTS ai_token_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  call_kind TEXT NOT NULL,
  domain TEXT,
  model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_token_calls_student_created_idx
  ON ai_token_calls (student_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_token_calls_session_idx
  ON ai_token_calls (session_id);
--> statement-breakpoint
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS ai_input_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_output_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_total_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_call_count INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE ai_usage_daily
  ADD COLUMN IF NOT EXISTS input_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens INTEGER NOT NULL DEFAULT 0;
