/**
 * Production (AWS RDS): delete all users except one keep email; wipe their org data.
 *
 * Usage:
 *   node scripts/purge-aws-keep-user.mjs --confirm-aws [email]
 */
import { loadRdsConfigFromEnv, createClient } from "./apply-migrations.mjs";

const KEEP_EMAIL = (
  process.argv.find((a) => a.includes("@")) ?? "kristi.costellow@gmail.com"
)
  .trim()
  .toLowerCase();

if (!process.argv.includes("--confirm-aws")) {
  console.error("Refusing to run without --confirm-aws.");
  process.exit(1);
}

const config = loadRdsConfigFromEnv();
if (!config?.host || !config?.password) {
  console.error("RDS not configured (POSTGRES_HOST, POSTGRES_PASSWORD).");
  process.exit(1);
}

const client = createClient(config);
await client.connect();
console.log("Connected to RDS:", config.host);
console.log("Keeping user:", KEEP_EMAIL);

async function deleteStudentsByIds(studentIds, studentUserIds) {
  if (!studentIds.length) return;
  await client.query(`DELETE FROM ai_token_calls WHERE student_id = ANY($1::uuid[])`, [studentIds]);
  await client.query(`DELETE FROM student_practice_suggestions WHERE student_id = ANY($1::uuid[])`, [
    studentIds,
  ]);
  await client.query(`DELETE FROM student_object_mastery WHERE student_id = ANY($1::uuid[])`, [
    studentIds,
  ]);
  await client.query(`DELETE FROM ai_usage_daily WHERE student_id = ANY($1::uuid[])`, [studentIds]);
  await client.query(
    `DELETE FROM session_answers WHERE session_id IN (SELECT id FROM sessions WHERE student_id = ANY($1::uuid[]))`,
    [studentIds],
  );
  await client.query(`DELETE FROM sessions WHERE student_id = ANY($1::uuid[])`, [studentIds]);
  await client.query(`DELETE FROM student_levels WHERE student_id = ANY($1::uuid[])`, [studentIds]);
  await client.query(`DELETE FROM students WHERE id = ANY($1::uuid[])`, [studentIds]);
  if (studentUserIds.length) {
    await client.query(
      `DELETE FROM user_sessions WHERE user_id = ANY($1::uuid[]) AND user_type = 'student'`,
      [studentUserIds],
    );
    await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[]) AND role = 'student'`, [
      studentUserIds,
    ]);
  }
}

async function deleteAllStudentsInDistrict(districtId) {
  const schools = await client.query(`SELECT id FROM schools WHERE district_id = $1`, [districtId]);
  const schoolIds = schools.rows.map((r) => r.id);
  const studentRows =
    schoolIds.length > 0
      ? await client.query(
          `SELECT id, user_id FROM students WHERE district_id = $1 OR school_id = ANY($2::uuid[])`,
          [districtId, schoolIds],
        )
      : await client.query(`SELECT id, user_id FROM students WHERE district_id = $1`, [districtId]);
  await deleteStudentsByIds(
    studentRows.rows.map((r) => r.id),
    studentRows.rows.map((r) => r.user_id).filter(Boolean),
  );
}

async function deleteStaffAtSchools(schoolIds, exceptUserId) {
  if (!schoolIds.length) return 0;
  const staff = await client.query(
    `SELECT p.id, p.user_id FROM profiles p
     JOIN users u ON u.id = p.user_id
     WHERE p.school_id = ANY($1::uuid[]) AND u.id != $2`,
    [schoolIds, exceptUserId],
  );
  const profileIds = staff.rows.map((r) => r.id);
  const staffUserIds = staff.rows.map((r) => r.user_id);
  if (profileIds.length) {
    await client.query(`UPDATE students SET guardian_id = NULL WHERE guardian_id = ANY($1::uuid[])`, [
      profileIds,
    ]);
    await client.query(`DELETE FROM profiles WHERE id = ANY($1::uuid[])`, [profileIds]);
    await client.query(`DELETE FROM user_sessions WHERE user_id = ANY($1::uuid[])`, [profileIds]);
  }
  for (const uid of staffUserIds) {
    await client.query(`DELETE FROM ai_token_calls WHERE user_id = $1`, [uid]);
    await client.query(`DELETE FROM users WHERE id = $1`, [uid]);
  }
  return staffUserIds.length;
}

async function removeDistrictCompletely(districtAdminId, districtId, adminUserId) {
  await deleteAllStudentsInDistrict(districtId);
  const schools = await client.query(`SELECT id FROM schools WHERE district_id = $1`, [districtId]);
  const schoolIds = schools.rows.map((r) => r.id);
  await deleteStaffAtSchools(schoolIds, adminUserId);
  await client.query(`DELETE FROM district_seat_allocations WHERE district_admin_id = $1`, [
    districtAdminId,
  ]);
  if (schoolIds.length) {
    await client.query(`DELETE FROM schools WHERE id = ANY($1::uuid[])`, [schoolIds]);
  }
  await client.query(`DELETE FROM owner_stripe_customers WHERE owner_id = $1 AND owner_type = 'organization'`, [
    districtAdminId,
  ]);
  await client.query(`DELETE FROM district_admins WHERE id = $1`, [districtAdminId]);
  await client.query(`DELETE FROM districts WHERE id = $1`, [districtId]);
  const adminProfiles = await client.query(`SELECT id FROM profiles WHERE user_id = $1`, [adminUserId]);
  for (const p of adminProfiles.rows) {
    await client.query(`UPDATE students SET guardian_id = NULL WHERE guardian_id = $1`, [p.id]);
    await client.query(`DELETE FROM profiles WHERE id = $1`, [p.id]);
  }
  await client.query(`DELETE FROM ai_token_calls WHERE user_id = $1`, [adminUserId]);
  await client.query(`DELETE FROM user_sessions WHERE user_id = $1`, [adminUserId]);
  await client.query(`DELETE FROM users WHERE id = $1`, [adminUserId]);
}

await client.query("BEGIN");
try {
  const keepUser = await client.query(`SELECT id, email, role FROM users WHERE lower(email) = $1`, [
    KEEP_EMAIL,
  ]);
  if (!keepUser.rows.length) {
    throw new Error(`Keep user not found on RDS: ${KEEP_EMAIL}`);
  }
  const keepUserId = keepUser.rows[0].id;
  console.log("Keep user:", keepUser.rows[0].email, keepUserId);

  const otherDas = await client.query(
    `SELECT da.id, da.district_id, da.user_id, u.email
     FROM district_admins da
     JOIN users u ON u.id = da.user_id
     WHERE da.user_id != $1`,
    [keepUserId],
  );
  for (const row of otherDas.rows) {
    console.log("Removing district org for", row.email);
    await removeDistrictCompletely(row.id, row.district_id, row.user_id);
  }

  const keepDa = await client.query(
    `SELECT id, district_id FROM district_admins WHERE user_id = $1`,
    [keepUserId],
  );
  if (keepDa.rows.length) {
    const { id: daId, district_id: districtId } = keepDa.rows[0];
    await deleteAllStudentsInDistrict(districtId);
    const schools = await client.query(`SELECT id FROM schools WHERE district_id = $1`, [districtId]);
    const n = await deleteStaffAtSchools(
      schools.rows.map((r) => r.id),
      keepUserId,
    );
    console.log("Keep district:", districtId, "— removed students and", n, "staff (schools kept)");
  }

  await client.query(`DELETE FROM invitations WHERE lower(invitee_email) != $1`, [KEEP_EMAIL]);

  const leftovers = await client.query(
    `SELECT id, email, role FROM users WHERE id != $1 ORDER BY email`,
    [keepUserId],
  );
  for (const row of leftovers.rows) {
    console.log("Removing user:", row.email, row.role);
    if (row.role === "student") {
      const s = await client.query(`SELECT id FROM students WHERE user_id = $1`, [row.id]);
      if (s.rows[0]) await deleteStudentsByIds([s.rows[0].id], [row.id]);
      else {
        await client.query(`DELETE FROM ai_token_calls WHERE user_id = $1`, [row.id]);
        await client.query(`DELETE FROM users WHERE id = $1`, [row.id]);
      }
      continue;
    }
    const profiles = await client.query(`SELECT id FROM profiles WHERE user_id = $1`, [row.id]);
    for (const p of profiles.rows) {
      await client.query(`UPDATE students SET guardian_id = NULL WHERE guardian_id = $1`, [p.id]);
      await client.query(`DELETE FROM profiles WHERE id = $1`, [p.id]);
    }
    const da = await client.query(`SELECT id, district_id FROM district_admins WHERE user_id = $1`, [row.id]);
    if (da.rows[0]) {
      await removeDistrictCompletely(da.rows[0].id, da.rows[0].district_id, row.id);
      continue;
    }
    await client.query(`DELETE FROM ai_token_calls WHERE user_id = $1`, [row.id]);
    await client.query(`DELETE FROM user_sessions WHERE user_id = $1`, [row.id]);
    await client.query(`DELETE FROM users WHERE id = $1`, [row.id]);
  }

  const remaining = await client.query(`SELECT email, role FROM users ORDER BY email`);
  console.log("Users remaining:", remaining.rows);

  await client.query("COMMIT");
  console.log("Purge complete.");
} catch (e) {
  await client.query("ROLLBACK");
  console.error(e);
  process.exit(1);
} finally {
  await client.end();
}
