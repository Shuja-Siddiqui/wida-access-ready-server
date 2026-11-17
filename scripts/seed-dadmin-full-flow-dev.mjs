/**
 * Dev end-to-end demo after reset: school + principal + teacher + 5 students with progress.
 *
 * Logins (password 12345678 unless noted):
 *   dadmin@gmail.com — district admin
 *   lgs.principal@accessready.test — principal
 *   lgs.teacher@accessready.test — teacher
 *   lgs.student01@accessready.test … student05 — students
 *
 * Usage: node scripts/seed-dadmin-full-flow-dev.mjs
 */
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const DISTRICT_ADMIN_EMAIL = "dadmin@gmail.com";
const PASSWORD = "12345678";
const BCRYPT_ROUNDS = 10;
const SCHOOL_NAME = "LGS Demo School";
const SCHOOL_CODE = "LGS-001";

const conn = process.env.DATABASE_URL ?? process.env.LOCAL_DATABASE_URL;
const client = new pg.Client({ connectionString: conn });
await client.connect();

const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);

const da = await client.query(
  `SELECT da.id AS district_admin_id, da.district_id
   FROM district_admins da JOIN users u ON u.id = da.user_id
   WHERE lower(u.email) = $1`,
  [DISTRICT_ADMIN_EMAIL.toLowerCase()],
);
if (!da.rows.length) process.exit(1);
const { district_admin_id: districtAdminId, district_id: districtId } = da.rows[0];

await client.query("BEGIN");
try {
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

  const principal = await upsertStaff("lgs.principal@accessready.test", "LGS Principal", "principal");
  const teacher = await upsertStaff("lgs.teacher@accessready.test", "LGS Teacher", "teacher");

  const studentSpecs = [
    { email: "lgs.student01@accessready.test", name: "Alex Rivera" },
    { email: "lgs.student02@accessready.test", name: "Sam Chen" },
    { email: "lgs.student03@accessready.test", name: "Jordan Lee" },
    { email: "lgs.student04@accessready.test", name: "Taylor Kim" },
    { email: "lgs.student05@accessready.test", name: "Casey Morgan" },
  ];

  const createdStudents = [];
  for (const spec of studentSpecs) {
    const userId = crypto.randomUUID();
    const uCheck = await client.query(`SELECT id FROM users WHERE lower(email)=$1 AND role='student'`, [
      spec.email.toLowerCase(),
    ]);
    let finalUserId = uCheck.rows[0]?.id;
    if (!finalUserId) {
      await client.query(
        `INSERT INTO users (id, email, name, password_hash, role, email_verified)
         VALUES ($1, $2, $3, $4, 'student', true)`,
        [userId, spec.email.toLowerCase(), spec.name, passwordHash],
      );
      finalUserId = userId;
    } else {
      await client.query(
        `UPDATE users SET password_hash = $1, email_verified = true, name = $2 WHERE id = $3`,
        [passwordHash, spec.name, finalUserId],
      );
    }

    const studentId = crypto.randomUUID();
    await client.query(
      `INSERT INTO students (
         id, user_id, guardian_id, name, grade_band, state_assessment, home_language, email,
         school_id, district_id, account_type, email_verified, password_hash, track
       ) VALUES ($1,$2,$3,$4,'6-8','WIDA','English',$5,$6,$7,'school_managed',true,$8,'academic')`,
      [
        studentId,
        finalUserId,
        teacher.profileId,
        spec.name,
        spec.email.toLowerCase(),
        school.id,
        districtId,
        passwordHash,
      ],
    );

    for (const domain of ["listening", "speaking", "reading", "writing"]) {
      await client.query(
        `INSERT INTO student_levels (student_id, domain, tier, current_level, exit_threshold, source)
         VALUES ($1, $2, 'academic', '2.5', '4.70', 'guardian_entered')`,
        [studentId, domain],
      );
    }

    // One completed practice session per student for progress charts
    await client.query(
      `INSERT INTO sessions (student_id, domain, session_type, level_start, level_end, score_pct, completed, duration_seconds)
       VALUES ($1, 'listening', 'practice', '2.0', '2.5', 85, true, 420)`,
      [studentId],
    );

    createdStudents.push({ studentId, ...spec });
  }

  await client.query("COMMIT");

  console.log("\n=== LGS demo flow seeded ===");
  console.log({
    districtId,
    districtAdmin: DISTRICT_ADMIN_EMAIL,
    schoolId: school.id,
    schoolName: SCHOOL_NAME,
    principal: "lgs.principal@accessready.test",
    teacher: "lgs.teacher@accessready.test",
    password: PASSWORD,
  });
  console.log("Students:", createdStudents);
} catch (e) {
  await client.query("ROLLBACK");
  console.error(e);
  process.exit(1);
} finally {
  await client.end();
}
