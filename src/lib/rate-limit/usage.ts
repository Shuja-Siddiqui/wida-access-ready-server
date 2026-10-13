import { pool } from "../../../db";
import { logger } from "../../config/logger";

let tableReady: Promise<void> | null = null;

function ensureUsageTable(): Promise<void> {
  if (!tableReady) {
    tableReady = pool
      .query(`
        CREATE TABLE IF NOT EXISTS ai_usage_daily (
          student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
          usage_date DATE NOT NULL,
          total_calls INTEGER NOT NULL DEFAULT 0,
          generate_calls INTEGER NOT NULL DEFAULT 0,
          coaching_calls INTEGER NOT NULL DEFAULT 0,
          speech_calls INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (student_id, usage_date)
        )
      `)
      .then(() => undefined);
  }
  return tableReady;
}

export type AiUsageKind = "generate" | "coaching" | "speech";

export function usageKindFromPath(path: string): AiUsageKind {
  const p = path.toLowerCase();
  if (p.includes("speech-to-text") || p.includes("text-to-speech")) return "speech";
  if (p.includes("item-feedback") || p.includes("writing/feedback")) return "coaching";
  return "generate";
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fire-and-forget daily increment. Safe to call after a rate-limit allow. */
export function recordAiUsage(studentId: string, kind: AiUsageKind): void {
  if (!UUID_RE.test(studentId)) return;
  const g = kind === "generate" ? 1 : 0;
  const c = kind === "coaching" ? 1 : 0;
  const s = kind === "speech" ? 1 : 0;
  void (async () => {
    try {
      await ensureUsageTable();
      await pool.query(
        `INSERT INTO ai_usage_daily
           (student_id, usage_date, total_calls, generate_calls, coaching_calls, speech_calls)
         VALUES ($1, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, 1, $2, $3, $4)
         ON CONFLICT (student_id, usage_date) DO UPDATE SET
           total_calls = ai_usage_daily.total_calls + 1,
           generate_calls = ai_usage_daily.generate_calls + $2,
           coaching_calls = ai_usage_daily.coaching_calls + $3,
           speech_calls = ai_usage_daily.speech_calls + $4`,
        [studentId, g, c, s],
      );
    } catch (err) {
      logger.warn({ err, studentId }, "ai_usage_daily increment failed");
    }
  })();
}

export async function getStudentAiUsage(studentId: string, days: number) {
  await ensureUsageTable();
  const span = Math.min(90, Math.max(7, days));
  const result = await pool.query<{
    usage_date: string;
    total_calls: number;
    generate_calls: number;
    coaching_calls: number;
    speech_calls: number;
  }>(
    `SELECT usage_date::text, total_calls, generate_calls, coaching_calls, speech_calls
     FROM ai_usage_daily
     WHERE student_id = $1
       AND usage_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date - ($2::int - 1)
     ORDER BY usage_date ASC`,
    [studentId, span],
  );
  const byDate = new Map(result.rows.map((r) => [r.usage_date.slice(0, 10), r]));
  const series: {
    date: string;
    total: number;
    generate: number;
    coaching: number;
    speech: number;
  }[] = [];
  const today = new Date();
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const key = d.toISOString().slice(0, 10);
    const row = byDate.get(key);
    series.push({
      date: key,
      total: Number(row?.total_calls ?? 0),
      generate: Number(row?.generate_calls ?? 0),
      coaching: Number(row?.coaching_calls ?? 0),
      speech: Number(row?.speech_calls ?? 0),
    });
  }
  const total = series.reduce((sum, d) => sum + d.total, 0);
  return { days: span, total, series };
}
