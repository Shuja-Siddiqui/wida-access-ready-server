/**
 * Fix Unified Demo School students: session tier + extra sessions + ai_usage_daily
 * (does not reset org hierarchy). Safe to re-run.
 *
 * Usage: node scripts/backfill-unified-demo-progress-dev.mjs
 */
import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const SCHOOL_NAME = "Unified Demo School";
const DOMAINS = ["listening", "speaking", "reading", "writing"];

const conn = process.env.DATABASE_URL ?? process.env.LOCAL_DATABASE_URL;
const client = new pg.Client({ connectionString: conn });
await client.connect();

const school = await client.query(`SELECT id FROM schools WHERE name = $1 LIMIT 1`, [SCHOOL_NAME]);
if (!school.rows[0]) {
  console.error("School not found:", SCHOOL_NAME, "— run seed-local-unified-hierarchy-dev.mjs first");
  process.exit(1);
}
const schoolId = school.rows[0].id;

const students = await client.query(
  `SELECT id, email FROM students WHERE school_id = $1 ORDER BY email`,
  [schoolId],
);

await client.query("BEGIN");
try {
  for (const [idx, row] of students.rows.entries()) {
    const studentId = row.id;

    await client.query(
      `UPDATE sessions SET tier = 'academic' WHERE student_id = $1 AND tier = 'general'`,
      [studentId],
    );

    const levels = await client.query(
      `SELECT domain, current_level::text FROM student_levels WHERE student_id = $1 AND tier = 'academic'`,
      [studentId],
    );
    const byDomain = Object.fromEntries(levels.rows.map((l) => [l.domain, parseFloat(l.current_level)]));

    const existing = await client.query(
      `SELECT count(*)::int AS n FROM sessions WHERE student_id = $1 AND completed = true`,
      [studentId],
    );
    if (existing.rows[0].n < 8) {
      await client.query(`DELETE FROM session_answers WHERE session_id IN (SELECT id FROM sessions WHERE student_id = $1)`, [
        studentId,
      ]);
      await client.query(`DELETE FROM sessions WHERE student_id = $1`, [studentId]);

      for (const domain of DOMAINS) {
        const base = byDomain[domain] ?? 2.0;
        for (let n = 0; n < 3; n++) {
          const start = (base - 0.35 + n * 0.12).toFixed(2);
          const end = (base - 0.2 + n * 0.15).toFixed(2);
          const daysAgo = 12 - (DOMAINS.indexOf(domain) * 2 + n * 2 + (idx % 3));
          await client.query(
            `INSERT INTO sessions (
               student_id, domain, tier, session_type, level_start, level_end, score_pct, completed, duration_seconds, created_at
             ) VALUES ($1, $2, 'academic', 'practice', $3, $4, $5, true, 400, NOW() - ($6 || ' days')::interval)`,
            [studentId, domain, start, end, 75 + ((idx + n) % 18), String(Math.max(0, daysAgo))],
          );
        }
      }
    }

    await client.query(`DELETE FROM ai_usage_daily WHERE student_id = $1`, [studentId]);
    for (let day = 0; day < 14; day++) {
      if ((day + idx) % 3 === 0) continue;
      const totalCalls = 2 + (day % 3);
      await client.query(
        `INSERT INTO ai_usage_daily (
           student_id, usage_date, total_calls, generate_calls, coaching_calls, speech_calls,
           input_tokens, output_tokens, total_tokens
         ) VALUES ($1, (CURRENT_DATE - ($2 || ' days')::interval)::date, $3, $4, $5, 0, $6, $7, $8)`,
        [studentId, String(day), totalCalls, Math.ceil(totalCalls * 0.65), Math.floor(totalCalls * 0.35), 900, 220, 1120],
      );
    }
  }

  await client.query("COMMIT");
  console.log("Backfilled progress for", students.rows.length, "students in", SCHOOL_NAME);
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  await client.end();
}
