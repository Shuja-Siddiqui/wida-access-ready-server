/**
 * Remove all students in dadmin's district (keeps schools, staff, plan, seat allocations).
 * Usage: node scripts/clear-dadmin-students-dev.mjs [districtAdminEmail]
 */
import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const email = (process.argv[2] ?? "dadmin@gmail.com").trim().toLowerCase();
const conn = process.env.DATABASE_URL ?? process.env.LOCAL_DATABASE_URL;
if (!conn) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const client = new pg.Client({ connectionString: conn });
await client.connect();

const da = await client.query(
  `SELECT da.district_id FROM district_admins da
   JOIN users u ON u.id = da.user_id WHERE lower(u.email) = $1`,
  [email],
);
if (!da.rows.length) {
  console.error("District admin not found");
  process.exit(1);
}
const districtId = da.rows[0].district_id;

const schools = await client.query(`SELECT id FROM schools WHERE district_id = $1`, [districtId]);
const schoolIds = schools.rows.map((r) => r.id);

const studentRows =
  schoolIds.length > 0
    ? await client.query(
        `SELECT id, user_id, email FROM students
         WHERE district_id = $1 OR school_id = ANY($2::uuid[])`,
        [districtId, schoolIds],
      )
    : await client.query(`SELECT id, user_id, email FROM students WHERE district_id = $1`, [
        districtId,
      ]);

const studentIds = studentRows.rows.map((r) => r.id);
const studentUserIds = studentRows.rows.map((r) => r.user_id).filter(Boolean);

await client.query("BEGIN");
try {
  if (studentIds.length) {
    await client.query(`DELETE FROM ai_token_calls WHERE student_id = ANY($1::uuid[])`, [studentIds]);
    await client.query(`DELETE FROM student_practice_suggestions WHERE student_id = ANY($1::uuid[])`, [studentIds]);
    await client.query(`DELETE FROM student_object_mastery WHERE student_id = ANY($1::uuid[])`, [studentIds]);
    await client.query(`DELETE FROM ai_usage_daily WHERE student_id = ANY($1::uuid[])`, [studentIds]);
    await client.query(
      `DELETE FROM session_answers WHERE session_id IN (SELECT id FROM sessions WHERE student_id = ANY($1::uuid[]))`,
      [studentIds],
    );
    await client.query(`DELETE FROM sessions WHERE student_id = ANY($1::uuid[])`, [studentIds]);
    await client.query(`DELETE FROM student_levels WHERE student_id = ANY($1::uuid[])`, [studentIds]);
    await client.query(`DELETE FROM students WHERE id = ANY($1::uuid[])`, [studentIds]);
    await client.query(
      `DELETE FROM user_sessions WHERE user_id = ANY($1::uuid[]) AND user_type = 'student'`,
      [studentUserIds],
    );
  }
  for (const row of studentRows.rows) {
    if (row.email) {
      await client.query(`DELETE FROM invitations WHERE lower(invitee_email) = lower($1) AND invitee_role = 'student'`, [
        row.email,
      ]);
    }
  }
  if (studentUserIds.length) {
    await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[]) AND role = 'student'`, [studentUserIds]);
  }
  await client.query("COMMIT");
  console.log("Removed", studentIds.length, "student(s) for district", districtId, "(schools/plan kept).");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  await client.end();
}
