/**
 * Create or reset a solo student on AWS RDS.
 * Usage: node scripts/seed-student-aws.mjs [email] [password] [name]
 */
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { loadRdsConfigFromEnv, createClient } from "./apply-migrations.mjs";

const email = (process.argv[2] ?? "student@gmail.com").trim().toLowerCase();
const plainPassword = process.argv[3] ?? "12345678";
const name = process.argv[4] ?? "Test Student";
const DOMAINS = ["listening", "speaking", "reading", "writing"];

const client = createClient(loadRdsConfigFromEnv());
await client.connect();

const passwordHash = await bcrypt.hash(plainPassword, 12);

const existingUser = await client.query(
  `SELECT id FROM users WHERE lower(email) = $1 AND role = 'student'`,
  [email],
);

let userId = existingUser.rows[0]?.id;
if (!userId) {
  userId = randomUUID();
  await client.query(
    `INSERT INTO users (id, email, name, password_hash, role, email_verified, is_active)
     VALUES ($1, $2, $3, $4, 'student', true, true)`,
    [userId, email, name, passwordHash],
  );
  console.log("Created user");
} else {
  await client.query(
    `UPDATE users SET name = $1, password_hash = $2, email_verified = true, is_active = true WHERE id = $3`,
    [name, passwordHash, userId],
  );
  console.log("Updated user password");
}

const existingStudent = await client.query(`SELECT id FROM students WHERE user_id = $1`, [userId]);
let studentId = existingStudent.rows[0]?.id;
if (!studentId) {
  studentId = randomUUID();
  await client.query(
    `INSERT INTO students (
       id, user_id, name, grade_band, state_assessment, account_type,
       email, email_verified, password_hash, track, is_active
     ) VALUES ($1, $2, $3, '6-8', 'WIDA', 'solo', $4, true, $5, 'academic', true)`,
    [studentId, userId, name, email, passwordHash],
  );
  console.log("Created student row");
} else {
  await client.query(
    `UPDATE students SET name = $1, email = $2, email_verified = true, password_hash = $3, is_active = true WHERE id = $4`,
    [name, email, passwordHash, studentId],
  );
}

for (const domain of DOMAINS) {
  await client.query(
    `INSERT INTO student_levels (id, student_id, domain, current_level, exit_threshold, at_exit)
     VALUES ($1, $2, $3, 1.00, 4.00, false)
     ON CONFLICT DO NOTHING`,
    [randomUUID(), studentId, domain],
  );
}

await client.end();
console.log(`Student ready — email: ${email}, password: ${plainPassword}`);
