/**
 * Seed script — creates all required test/admin users in the Replit dev DB.
 * Password for every account: 12345678
 *
 * Hierarchy:
 *   super_admin  → users + profiles
 *   teacher      → users + profiles
 *   principal    → users + profiles
 *   district_admin → users + profiles + district + district_admins
 *   parent       → users + profiles
 *   student      → users + students + student_levels (4 domains)
 *
 * Run: node api-server/scripts/seed-users.mjs
 */

import bcrypt from "bcryptjs";
import pg from "pg";
import { randomUUID } from "crypto";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const HASH = await bcrypt.hash("12345678", 10);
const DOMAINS = ["listening", "speaking", "reading", "writing"];

// ── Helpers ───────────────────────────────────────────────────────────────────
async function upsertUser(client, { email, name, role }) {
  const id = randomUUID();
  const res = await client.query(
    `INSERT INTO users (id, email, name, password_hash, role, email_verified)
     VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role          = EXCLUDED.role,
           email_verified = true
     RETURNING id`,
    [id, email.toLowerCase(), name, HASH, role]
  );
  return res.rows[0].id;
}

async function upsertProfile(client, userId) {
  await client.query(
    `INSERT INTO profiles (id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [randomUUID(), userId]
  );
  const { rows } = await client.query(
    `SELECT id FROM profiles WHERE user_id = $1`,
    [userId]
  );
  return rows[0].id;
}

async function upsertStudent(client, userId, { name, teacherId }) {
  const id = randomUUID();
  await client.query(
    `INSERT INTO students (id, user_id, name, grade_band, state_assessment, account_type, guardian_id, email, email_verified)
     VALUES ($1, $2, $3, 'K-2', 'WIDA', 'solo', $4, (SELECT email FROM users WHERE id=$2), true)
     ON CONFLICT (user_id) DO UPDATE
       SET name        = EXCLUDED.name,
           guardian_id = EXCLUDED.guardian_id
     RETURNING id`,
    [id, userId, name, teacherId ?? null]
  );
  const { rows } = await client.query(
    `SELECT id FROM students WHERE user_id = $1`,
    [userId]
  );
  return rows[0].id;
}

async function ensureStudentLevels(client, studentId) {
  for (const domain of DOMAINS) {
    await client.query(
      `INSERT INTO student_levels (id, student_id, domain, current_level, exit_threshold, at_exit)
       VALUES ($1, $2, $3, 1.00, 4.00, false)
       ON CONFLICT DO NOTHING`,
      [randomUUID(), studentId, domain]
    );
  }
}

async function upsertDistrict(client, adminUserId) {
  // Re-use existing district or create one
  const existing = await client.query(`SELECT id FROM districts WHERE name='ACCESS Ready District' LIMIT 1`);
  if (existing.rows.length) return existing.rows[0].id;
  const id = randomUUID();
  await client.query(
    `INSERT INTO districts (id, name, state, district_code, admin_id)
     VALUES ($1, 'ACCESS Ready District', 'TX', 'ARD-001', $2)`,
    [id, adminUserId]
  );
  return id;
}

async function upsertDistrictAdmin(client, userId, districtId) {
  await client.query(
    `INSERT INTO district_admins (id, user_id, district_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET district_id = EXCLUDED.district_id`,
    [randomUUID(), userId, districtId]
  );
}

// ── Seed ─────────────────────────────────────────────────────────────────────
const client = await pool.connect();
try {
  await client.query("BEGIN");

  // 1. super_admin
  const saId = await upsertUser(client, { email: "superadmin@accessready.com", name: "Super Admin", role: "super_admin" });
  await upsertProfile(client, saId);
  console.log("✅ super_admin        superadmin@accessready.com");

  // 2. teacher
  const teacherId = await upsertUser(client, { email: "shuja0094@gmail.com", name: "Shuja Teacher", role: "teacher" });
  const teacherProfileId = await upsertProfile(client, teacherId);
  console.log("✅ teacher             shuja0094@gmail.com");

  // 3. principal × 3
  for (const { email, name } of [
    { email: "shuja.consoledot@gmail.com", name: "Shuja Principal" },
    { email: "lincon.principle@gmail.com", name: "Lincoln Principal" },
    { email: "principal@gmail.com",        name: "Principal User" },
  ]) {
    const uid = await upsertUser(client, { email, name, role: "principal" });
    await upsertProfile(client, uid);
    console.log(`✅ principal           ${email}`);
  }

  // 4. district_admin
  const daUserId = await upsertUser(client, { email: "dadmin@gmail.com", name: "District Admin", role: "district_admin" });
  await upsertProfile(client, daUserId);
  const districtId = await upsertDistrict(client, daUserId);
  await upsertDistrictAdmin(client, daUserId, districtId);
  console.log("✅ district_admin      dadmin@gmail.com");

  // 5. parent
  const parentId = await upsertUser(client, { email: "gardian@gmail.com", name: "Guardian Parent", role: "parent" });
  await upsertProfile(client, parentId);
  console.log("✅ parent              gardian@gmail.com");

  // 6. students (linked to the teacher above)
  for (const { email, name } of [
    { email: "student@gmail.com",              name: "Test Student" },
    { email: "shuja.ur.rehman0094@gmail.com",  name: "Shuja Student" },
  ]) {
    const uid = await upsertUser(client, { email, name, role: "student" });
    const sid = await upsertStudent(client, uid, { name, teacherId: teacherProfileId });
    await ensureStudentLevels(client, sid);
    console.log(`✅ student             ${email}  → teacher: shuja0094@gmail.com`);
  }

  await client.query("COMMIT");
  console.log("\n🎉  All users seeded. Password for every account: 12345678");
} catch (err) {
  await client.query("ROLLBACK");
  console.error("❌ Seed failed — rolled back:", err.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
