/**
 * Reset all practice sessions, levels, XP, streaks, and related progress.
 *
 * Usage:
 *   node scripts/reset-practice-progress.mjs          # local / DATABASE_URL
 *   node scripts/reset-practice-progress.mjs --live   # AWS RDS (POSTGRES_*)
 */
import dotenv from "dotenv";
import { createClient, loadRdsConfigFromEnv } from "./apply-migrations.mjs";

dotenv.config();

const useLive = process.argv.includes("--live");

function createTargetClient() {
  if (useLive) {
    const rds = loadRdsConfigFromEnv();
    if (!rds?.host || !rds?.password) {
      console.error("RDS not configured. Set POSTGRES_HOST and POSTGRES_PASSWORD in api-server/.env");
      process.exit(1);
    }
    return {
      client: createClient(rds),
      label: `RDS (${rds.host})`,
    };
  }

  const url = process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("Set LOCAL_DATABASE_URL or DATABASE_URL in api-server/.env");
    process.exit(1);
  }

  return {
    client: createClient({ connectionString: url }),
    label: "local",
  };
}

const { client, label } = createTargetClient();
await client.connect();
console.log(`Connected to ${label}.`);

async function count(table) {
  try {
    const r = await client.query(`SELECT COUNT(*)::int AS c FROM ${table}`);
    return r.rows[0].c;
  } catch {
    return null;
  }
}

const before = {
  sessions: await count("sessions"),
  sessionAnswers: await count("session_answers"),
  studentLevels: await count("student_levels"),
  students: await count("students"),
  objectMastery: await count("student_object_mastery"),
  suggestions: await count("student_practice_suggestions"),
};

await client.query("BEGIN");
try {
  if (before.sessionAnswers !== null) {
    await client.query("DELETE FROM session_answers");
  }
  if (before.suggestions !== null) {
    await client.query("DELETE FROM student_practice_suggestions");
  }
  if (before.objectMastery !== null) {
    await client.query("DELETE FROM student_object_mastery");
  }
  await client.query("DELETE FROM sessions");

  const levels = await client.query(`
    UPDATE student_levels SET
      current_level = 1.00,
      at_exit = false,
      source = 'practice',
      consecutive_pass_count = 0,
      consecutive_fail_count = 0,
      updated_at = NOW()
  `);

  const students = await client.query(`
    UPDATE students SET
      total_xp = 0,
      current_streak = 0,
      longest_streak = 0,
      streak_shield_available = true,
      last_session_date = NULL
  `);

  await client.query("COMMIT");

  const after = {
    sessions: await count("sessions"),
    sessionAnswers: await count("session_answers"),
    studentLevels: await count("student_levels"),
  };

  console.log("Practice progress reset complete.");
  console.log(JSON.stringify({ target: label, before, updated: { studentLevels: levels.rowCount, students: students.rowCount }, after }, null, 2));
} catch (err) {
  await client.query("ROLLBACK");
  console.error("Reset failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
