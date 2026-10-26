/**
 * Dev: remove schools/students/principals/teachers in dadmin's district (keeps dadmin + district row).
 * Usage: node scripts/reset-dadmin-district-dev.mjs
 */
import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const DISTRICT_ADMIN_EMAIL = "dadmin@gmail.com";

const conn = process.env.DATABASE_URL ?? process.env.LOCAL_DATABASE_URL;
if (!conn) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const client = new pg.Client({ connectionString: conn });
await client.connect();

const da = await client.query(
  `SELECT da.id AS district_admin_id, da.district_id, da.user_id
   FROM district_admins da
   JOIN users u ON u.id = da.user_id
   WHERE lower(u.email) = $1`,
  [DISTRICT_ADMIN_EMAIL.toLowerCase()],
);
if (!da.rows.length) {
  console.error("District admin not found:", DISTRICT_ADMIN_EMAIL);
  process.exit(1);
}
const { district_admin_id: districtAdminId, district_id: districtId } = da.rows[0];

const schools = await client.query(`SELECT id, name FROM schools WHERE district_id = $1`, [districtId]);
console.log("District", districtId, "schools to remove:", schools.rows);

await client.query("BEGIN");

try {
  const schoolIds = schools.rows.map((r) => r.id);

  if (schoolIds.length) {
    // Students in district schools (and teacher-roster students in district)
    const studentRows = await client.query(
      `SELECT id, user_id, email FROM students
       WHERE district_id = $1 OR school_id = ANY($2::uuid[])`,
      [districtId, schoolIds],
    );
    const studentIds = studentRows.rows.map((r) => r.id);
    const studentUserIds = studentRows.rows.map((r) => r.user_id).filter(Boolean);

    if (studentIds.length) {
      await client.query(`DELETE FROM ai_token_calls WHERE student_id = ANY($1::uuid[])`, [studentIds]);
      await client.query(`DELETE FROM student_practice_suggestions WHERE student_id = ANY($1::uuid[])`, [studentIds]);
      await client.query(`DELETE FROM student_object_mastery WHERE student_id = ANY($1::uuid[])`, [studentIds]);
      await client.query(`DELETE FROM ai_usage_daily WHERE student_id = ANY($1::uuid[])`, [studentIds]);
      await client.query(`DELETE FROM session_answers WHERE session_id IN (SELECT id FROM sessions WHERE student_id = ANY($1::uuid[]))`, [studentIds]);
      await client.query(`DELETE FROM sessions WHERE student_id = ANY($1::uuid[])`, [studentIds]);
      await client.query(`DELETE FROM student_levels WHERE student_id = ANY($1::uuid[])`, [studentIds]);
      await client.query(`DELETE FROM students WHERE id = ANY($1::uuid[])`, [studentIds]);
    }

    for (const email of studentRows.rows.map((r) => r.email).filter(Boolean)) {
      await client.query(`DELETE FROM invitations WHERE lower(invitee_email) = lower($1)`, [email]);
    }
    if (studentIds.length) {
      await client.query(`DELETE FROM user_sessions WHERE user_id = ANY($1::uuid[]) AND user_type = 'student'`, [
        studentIds,
      ]);
    }
    if (studentUserIds.length) {
      await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[]) AND role = 'student'`, [studentUserIds]);
    }
    // Demo student emails
    await client.query(`DELETE FROM users WHERE role = 'student' AND email LIKE 'dadmin+demostudent%'`);
    await client.query(`DELETE FROM invitations WHERE invitee_email LIKE 'dadmin+demostudent%'`);

    // Profiles at these schools (teachers, principals) — delete users after
    const profileRows = await client.query(
      `SELECT p.id, p.user_id, u.email, u.role FROM profiles p
       JOIN users u ON u.id = p.user_id
       WHERE p.school_id = ANY($1::uuid[])`,
      [schoolIds],
    );
    const profileIds = profileRows.rows.map((r) => r.id);
    const staffUserIds = profileRows.rows.map((r) => r.user_id);

    if (profileIds.length) {
      await client.query(
        `UPDATE students SET guardian_id = NULL WHERE guardian_id = ANY($1::uuid[])`,
        [profileIds],
      );
      await client.query(`DELETE FROM profiles WHERE id = ANY($1::uuid[])`, [profileIds]);
    }

    for (const row of profileRows.rows) {
      await client.query(`DELETE FROM invitations WHERE lower(invitee_email) = lower($1)`, [row.email]);
    }

    if (profileIds.length) {
      await client.query(
        `DELETE FROM user_sessions WHERE user_id = ANY($1::uuid[]) AND user_type IN ('teacher', 'principal')`,
        [profileIds],
      );
    }
    if (staffUserIds.length) {
      await client.query(
        `DELETE FROM users WHERE id = ANY($1::uuid[]) AND role IN ('teacher', 'principal')`,
        [staffUserIds],
      );
    }

    // Prior demo accounts (emails from seed-dadmin-full-flow-dev.mjs)
    const lgsStudents = await client.query(
      `SELECT id, user_id FROM students WHERE email LIKE 'lgs.%@accessready.test'`,
    );
    if (lgsStudents.rows.length) {
      const ids = lgsStudents.rows.map((r) => r.id);
      await client.query(`DELETE FROM sessions WHERE student_id = ANY($1::uuid[])`, [ids]);
      await client.query(`DELETE FROM student_levels WHERE student_id = ANY($1::uuid[])`, [ids]);
      await client.query(`DELETE FROM students WHERE id = ANY($1::uuid[])`, [ids]);
      await client.query(`DELETE FROM user_sessions WHERE user_id = ANY($1::uuid[])`, [ids]);
    }
    await client.query(`DELETE FROM users WHERE email LIKE 'lgs.%@accessready.test'`);

    await client.query(`DELETE FROM district_seat_allocations WHERE district_admin_id = $1`, [districtAdminId]);
    await client.query(`DELETE FROM schools WHERE id = ANY($1::uuid[])`, [schoolIds]);
  }

  await client.query("COMMIT");
  console.log("Reset complete. District admin preserved:", DISTRICT_ADMIN_EMAIL);
  console.log("Removed", schools.rows.length, "school(s) and related org users/students.");
} catch (e) {
  await client.query("ROLLBACK");
  console.error(e);
  process.exit(1);
} finally {
  await client.end();
}
