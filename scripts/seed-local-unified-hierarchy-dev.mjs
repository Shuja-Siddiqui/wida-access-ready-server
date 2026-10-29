/**
 * Local dev: one district (dadmin@gmail.com), one school, principal@gmail.com,
 * two teachers, ten active students with progress — password 12345678 for all.
 *
 * Usage:
 *   node scripts/seed-local-unified-hierarchy-dev.mjs
 *
 * Optional: pass --reset to run reset-dadmin-district-dev first (clears org data in district).
 */
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const DISTRICT_ADMIN_EMAIL = "dadmin@gmail.com";
const PRINCIPAL_EMAIL = "principal@gmail.com";
const TEACHER_EMAILS = ["teacher@gmail.com", "teacher2@gmail.com"];
const PASSWORD = "12345678";
const BCRYPT_ROUNDS = 10;
const SCHOOL_NAME = "Unified Demo School";
const SCHOOL_CODE = "UDS-001";

const STUDENT_SPECS = [
  { email: "student@gmail.com", name: "Test Student" },
  { email: "student2@gmail.com", name: "Alex Rivera" },
  { email: "student3@gmail.com", name: "Sam Chen" },
  { email: "student4@gmail.com", name: "Jordan Lee" },
  { email: "student5@gmail.com", name: "Taylor Kim" },
  { email: "student6@gmail.com", name: "Casey Morgan" },
  { email: "student7@gmail.com", name: "Maria Garcia" },
  { email: "student8@gmail.com", name: "Ahmed Hassan" },
  { email: "student9@gmail.com", name: "Linh Nguyen" },
  { email: "student10@gmail.com", name: "Fatou Diallo" },
];

const DOMAINS = ["listening", "speaking", "reading", "writing"];

if (process.argv.includes("--reset")) {
  const resetScript = path.join(__dirname, "reset-dadmin-district-dev.mjs");
  const r = spawnSync(process.execPath, [resetScript], { stdio: "inherit", cwd: path.join(__dirname, "..") });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const conn = process.env.DATABASE_URL ?? process.env.LOCAL_DATABASE_URL;
if (!conn) {
  console.error("DATABASE_URL or LOCAL_DATABASE_URL required");
  process.exit(1);
}

const client = new pg.Client({ connectionString: conn });
await client.connect();

const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);

const da = await client.query(
  `SELECT da.id AS district_admin_id, da.district_id, u.id AS user_id
   FROM district_admins da JOIN users u ON u.id = da.user_id
   WHERE lower(u.email) = $1`,
  [DISTRICT_ADMIN_EMAIL.toLowerCase()],
);
if (!da.rows.length) {
  console.error("District admin not found:", DISTRICT_ADMIN_EMAIL, "— run seed-users.mjs first");
  process.exit(1);
}
const { district_admin_id: districtAdminId, district_id: districtId, user_id: dadminUserId } = da.rows[0];

await client.query("BEGIN");
try {
  await client.query(
    `UPDATE users SET password_hash = $1, email_verified = true, name = COALESCE(NULLIF(name, ''), 'District Admin')
     WHERE id = $2`,
    [passwordHash, dadminUserId],
  );

  const [school] = (
    await client.query(
      `INSERT INTO schools (district_id, name, state, school_code)
       VALUES ($1, $2, 'TX', $3) RETURNING id`,
      [districtId, SCHOOL_NAME, SCHOOL_CODE],
    )
  ).rows;

  await client.query(
    `INSERT INTO district_seat_allocations (district_admin_id, school_id, seats_allocated)
     VALUES ($1, $2, 50)
     ON CONFLICT (district_admin_id, school_id) DO UPDATE SET seats_allocated = 50`,
    [districtAdminId, school.id],
  );

  async function upsertStaff(email, name, role) {
    let userId;
    const existing = await client.query(
      `SELECT id FROM users WHERE lower(email) = $1 AND role = $2`,
      [email.toLowerCase(), role],
    );
    if (existing.rows[0]) {
      userId = existing.rows[0].id;
      await client.query(
        `UPDATE users SET name = $1, password_hash = $2, email_verified = true WHERE id = $3`,
        [name, passwordHash, userId],
      );
    } else {
      userId = crypto.randomUUID();
      await client.query(
        `INSERT INTO users (id, email, name, password_hash, role, email_verified)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [userId, email.toLowerCase(), name, passwordHash, role],
      );
    }
    let profileId;
    const prof = await client.query(`SELECT id FROM profiles WHERE user_id = $1`, [userId]);
    if (prof.rows[0]) {
      profileId = prof.rows[0].id;
      await client.query(`UPDATE profiles SET school_id = $1 WHERE id = $2`, [school.id, profileId]);
    } else {
      profileId = crypto.randomUUID();
      await client.query(`INSERT INTO profiles (id, user_id, school_id) VALUES ($1, $2, $3)`, [
        profileId,
        userId,
        school.id,
      ]);
    }
    return { userId, profileId };
  }

  await upsertStaff(PRINCIPAL_EMAIL, "Principal User", "principal");
  const teachers = [];
  for (let i = 0; i < TEACHER_EMAILS.length; i++) {
    const email = TEACHER_EMAILS[i];
    const name = i === 0 ? "Demo Teacher One" : "Demo Teacher Two";
    teachers.push({ email, ...(await upsertStaff(email, name, "teacher")) });
  }

  const createdStudents = [];

  for (let idx = 0; idx < STUDENT_SPECS.length; idx++) {
    const spec = STUDENT_SPECS[idx];
    const teacher = teachers[idx % teachers.length];

    let finalUserId;
    const uCheck = await client.query(`SELECT id FROM users WHERE lower(email)=$1 AND role='student'`, [
      spec.email.toLowerCase(),
    ]);
    if (uCheck.rows[0]) {
      finalUserId = uCheck.rows[0].id;
      await client.query(
        `UPDATE users SET password_hash = $1, email_verified = true, name = $2 WHERE id = $3`,
        [passwordHash, spec.name, finalUserId],
      );
    } else {
      finalUserId = crypto.randomUUID();
      await client.query(
        `INSERT INTO users (id, email, name, password_hash, role, email_verified)
         VALUES ($1, $2, $3, $4, 'student', true)`,
        [finalUserId, spec.email.toLowerCase(), spec.name, passwordHash],
      );
    }

    const levelBase = 1.5 + (idx % 4) * 0.4;
    const domainLevels = {
      listening: (levelBase + 0.1).toFixed(2),
      speaking: (levelBase + 0.0).toFixed(2),
      reading: (levelBase + 0.3).toFixed(2),
      writing: (levelBase - 0.2).toFixed(2),
    };

    const existingStudent = await client.query(`SELECT id FROM students WHERE user_id = $1`, [finalUserId]);
    let studentId = existingStudent.rows[0]?.id;

    if (studentId) {
      await client.query(
        `DELETE FROM session_answers WHERE session_id IN (SELECT id FROM sessions WHERE student_id = $1)`,
        [studentId],
      );
      await client.query(`DELETE FROM sessions WHERE student_id = $1`, [studentId]);
      await client.query(`DELETE FROM student_levels WHERE student_id = $1`, [studentId]);
      await client.query(
        `UPDATE students SET
           guardian_id = $1, name = $2, grade_band = '6-8', state_assessment = 'WIDA', home_language = 'English',
           email = $3, school_id = $4, district_id = $5, account_type = 'school_managed',
           email_verified = true, password_hash = $6, is_active = true, track = 'academic',
           current_streak = $7, total_xp = $8, longest_streak = $9,
           last_session_date = NOW() - ($10 || ' days')::interval,
           last_login_at = NOW() - ($11 || ' hours')::interval
         WHERE id = $12`,
        [
          teacher.profileId,
          spec.name,
          spec.email.toLowerCase(),
          school.id,
          districtId,
          passwordHash,
          (idx % 5) + 1,
          120 + idx * 45,
          (idx % 5) + 2,
          String(idx % 3),
          String((idx % 12) + 1),
          studentId,
        ],
      );
    } else {
      studentId = crypto.randomUUID();
      await client.query(
        `INSERT INTO students (
           id, user_id, guardian_id, name, grade_band, state_assessment, home_language, email,
           school_id, district_id, account_type, email_verified, password_hash, track,
           is_active, current_streak, total_xp, longest_streak, last_session_date, last_login_at
         ) VALUES (
           $1,$2,$3,$4,'6-8','WIDA','English',$5,$6,$7,'school_managed',true,$8,'academic',
           true,$9,$10,$11, NOW() - ($12 || ' days')::interval, NOW() - ($13 || ' hours')::interval
         )`,
        [
          studentId,
          finalUserId,
          teacher.profileId,
          spec.name,
          spec.email.toLowerCase(),
          school.id,
          districtId,
          passwordHash,
          (idx % 5) + 1,
          120 + idx * 45,
          (idx % 5) + 2,
          String(idx % 3),
          String((idx % 12) + 1),
        ],
      );
    }

    for (const domain of DOMAINS) {
      await client.query(
        `INSERT INTO student_levels (student_id, domain, tier, current_level, exit_threshold, at_exit, source)
         VALUES ($1, $2, 'academic', $3, '4.70', false, 'guardian_entered')`,
        [studentId, domain, domainLevels[domain]],
      );
    }

    // Multiple completed sessions per domain (academic tier) for charts + exit projections
    for (const domain of DOMAINS) {
      const base = parseFloat(domainLevels[domain]);
      const sessionCount = 2 + (idx % 3);
      for (let n = 0; n < sessionCount; n++) {
        const start = (base - 0.3 + n * 0.1).toFixed(2);
        const end = (base - 0.2 + n * 0.12).toFixed(2);
        const score = 72 + ((idx + n) % 20);
        const daysAgo = 14 - (DOMAINS.indexOf(domain) * 2 + n * 3 + (idx % 4));
        await client.query(
          `INSERT INTO sessions (
             student_id, domain, tier, session_type, level_start, level_end, score_pct, completed, duration_seconds, created_at
           ) VALUES ($1, $2, 'academic', 'practice', $3, $4, $5, true, $6, NOW() - ($7 || ' days')::interval)`,
          [studentId, domain, start, end, Math.min(score, 99), 360 + n * 30, String(Math.max(0, daysAgo))],
        );
      }
    }

    // Practice activity chart (ai_usage_daily)
    for (let day = 0; day < 14; day++) {
      if ((day + idx) % 3 === 0) continue;
      const totalCalls = 2 + (day % 4);
      await client.query(
        `INSERT INTO ai_usage_daily (
           student_id, usage_date, total_calls, generate_calls, coaching_calls, speech_calls,
           input_tokens, output_tokens, total_tokens
         ) VALUES ($1, (CURRENT_DATE - ($2 || ' days')::interval)::date, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (student_id, usage_date) DO UPDATE SET
           total_calls = EXCLUDED.total_calls,
           generate_calls = EXCLUDED.generate_calls,
           coaching_calls = EXCLUDED.coaching_calls,
           speech_calls = EXCLUDED.speech_calls,
           total_tokens = EXCLUDED.total_tokens`,
        [
          studentId,
          String(day),
          totalCalls,
          Math.ceil(totalCalls * 0.6),
          Math.floor(totalCalls * 0.3),
          Math.max(0, totalCalls - Math.ceil(totalCalls * 0.6) - Math.floor(totalCalls * 0.3)),
          800 + day * 40,
          200 + day * 15,
          1000 + day * 55,
        ],
      );
    }

    createdStudents.push({ studentId, email: spec.email, teacher: teacher.email, levels: domainLevels });
  }

  await client.query("COMMIT");

  console.log("\n=== Unified local hierarchy seeded ===");
  console.log("Password for all accounts:", PASSWORD);
  console.log({
    districtAdmin: DISTRICT_ADMIN_EMAIL,
    districtId,
    schoolId: school.id,
    schoolName: SCHOOL_NAME,
    principal: PRINCIPAL_EMAIL,
    teachers: TEACHER_EMAILS,
  });
  console.log("\nStudents (5 per teacher):");
  for (const s of createdStudents) {
    console.log(`  ${s.email} → ${s.teacher}`, s.levels);
  }
} catch (e) {
  await client.query("ROLLBACK");
  console.error(e);
  process.exit(1);
} finally {
  await client.end();
}
