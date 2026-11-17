/**
 * Dev DB: students + seat allocation for dadmin@gmail.com (existing school LGS).
 * Password for new student accounts: 12345678 (matches seed-users.mjs).
 *
 * Usage: node scripts/seed-dadmin-dev-demo.mjs
 */
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import XLSX from "xlsx";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const DISTRICT_ADMIN_EMAIL = "dadmin@gmail.com";
const DEFAULT_PASSWORD = "12345678";
const BCRYPT_ROUNDS = 10;
const GRADE_BAND = "6-8";
const WIDA_SCORE = "1.0";
const STUDENT_COUNT = 20;

const NAMES = [
  "Maria Garcia",
  "Ahmed Hassan",
  "Linh Nguyen",
  "Fatou Diallo",
  "Sofia Martinez",
  "Chen Wei",
  "Amina Okonkwo",
  "Diego Ruiz",
  "Yuki Tanaka",
  "Olga Petrov",
  "James O'Brien",
  "Priya Sharma",
  "Lucas Silva",
  "Hana Kim",
  "Ibrahim Saleh",
  "Elena Popescu",
  "Noah Johnson",
  "Zara Ali",
  "Mateo Fernandez",
  "Anya Volkov",
];

function studentEmail(i) {
  const n = String(i + 1).padStart(2, "0");
  return `dadmin+demostudent${n}@gmail.com`;
}

const conn = process.env.DATABASE_URL ?? process.env.LOCAL_DATABASE_URL;
if (!conn) {
  console.error("DATABASE_URL or LOCAL_DATABASE_URL required");
  process.exit(1);
}

const client = new pg.Client({ connectionString: conn });
await client.connect();

const da = await client.query(
  `SELECT da.id AS district_admin_id, da.district_id
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

const schoolRow = (
  await client.query(
    `SELECT id, name, school_code FROM schools WHERE district_id = $1 ORDER BY created_at NULLS LAST, name LIMIT 1`,
    [districtId],
  )
).rows[0];

if (!schoolRow) {
  console.error("No school in district", districtId);
  process.exit(1);
}
const schoolId = schoolRow.id;
console.log("Using school:", schoolRow.name, schoolRow.id, schoolRow.school_code ?? "");

await client.query(
  `INSERT INTO district_seat_allocations (district_admin_id, school_id, seats_allocated)
   VALUES ($1, $2, 100)
   ON CONFLICT (district_admin_id, school_id)
   DO UPDATE SET seats_allocated = GREATEST(district_seat_allocations.seats_allocated, 100),
                 updated_at = now()`,
  [districtAdminId, schoolId],
);

const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

const teacherRow = await client.query(
  `SELECT p.id AS profile_id FROM profiles p
   JOIN users u ON u.id = p.user_id
   WHERE u.role = 'teacher' AND lower(u.email) = 'shuja0094@gmail.com'`,
);
const teacherProfileId = teacherRow.rows[0]?.profile_id ?? null;
if (teacherProfileId) {
  await client.query(`UPDATE profiles SET school_id = $1 WHERE id = $2 AND school_id IS NULL`, [
    schoolId,
    teacherProfileId,
  ]);
}

const excelRows = [];
const createdStudents = [];

for (let i = 0; i < STUDENT_COUNT; i++) {
  const name = NAMES[i];
  const email = studentEmail(i).toLowerCase();
  const homeLanguage = ["Spanish", "Arabic", "Vietnamese", "French", "English"][i % 5];

  excelRows.push({
    Name: name,
    Email: email,
    "Grade Band": GRADE_BAND,
    "State Assessment": "WIDA",
    "Home Language": homeLanguage,
    "Teacher ID": teacherProfileId ?? "",
    "School ID": schoolId,
    Listening: WIDA_SCORE,
    Speaking: WIDA_SCORE,
    Reading: WIDA_SCORE,
    Writing: WIDA_SCORE,
    "Email Verified": "yes",
    Password: DEFAULT_PASSWORD,
  });

  const existing = await client.query(`SELECT id, user_id FROM students WHERE lower(email) = $1`, [email]);
  const studentId = existing.rows[0]?.id ?? crypto.randomUUID();

  const userCheck = await client.query(`SELECT id FROM users WHERE lower(email) = $1 AND role = 'student'`, [email]);
  let finalUserId = userCheck.rows[0]?.id;
  if (!finalUserId) {
    finalUserId = crypto.randomUUID();
    await client.query(
      `INSERT INTO users (id, email, name, password_hash, role, email_verified)
       VALUES ($1, $2, $3, $4, 'student', true)`,
      [finalUserId, email, name, passwordHash],
    );
  } else {
    await client.query(
      `UPDATE users SET email_verified = true, password_hash = $1, name = $2 WHERE id = $3`,
      [passwordHash, name, finalUserId],
    );
  }

  if (existing.rows.length) {
    await client.query(
      `UPDATE students SET
         user_id = $1, name = $2, grade_band = $3, state_assessment = 'WIDA',
         home_language = $4, school_id = $5, district_id = $6, account_type = 'school_managed',
         email_verified = true, password_hash = $7, guardian_id = $8
       WHERE id = $9`,
      [
        finalUserId,
        name,
        GRADE_BAND,
        homeLanguage,
        schoolId,
        districtId,
        passwordHash,
        teacherProfileId,
        studentId,
      ],
    );
  } else {
    await client.query(
      `INSERT INTO students (
         id, user_id, name, grade_band, state_assessment, home_language, email,
         school_id, district_id, account_type, email_verified, password_hash, guardian_id, track
       ) VALUES ($1, $2, $3, $4, 'WIDA', $5, $6, $7, $8, 'school_managed', true, $9, $10, 'academic')`,
      [
        studentId,
        finalUserId,
        name,
        GRADE_BAND,
        homeLanguage,
        email,
        schoolId,
        districtId,
        passwordHash,
        teacherProfileId,
      ],
    );
  }

  for (const domain of ["listening", "speaking", "reading", "writing"]) {
    await client.query(
      `INSERT INTO student_levels (student_id, domain, tier, current_level, exit_threshold, source)
       SELECT $1, $2, 'academic', $3, '4.70', 'practice'
       WHERE NOT EXISTS (
         SELECT 1 FROM student_levels WHERE student_id = $1 AND domain = $2 AND tier = 'academic'
       )`,
      [studentId, domain, WIDA_SCORE],
    );
    await client.query(
      `UPDATE student_levels SET current_level = $1, updated_at = now()
       WHERE student_id = $2 AND domain = $3 AND tier = 'academic'`,
      [WIDA_SCORE, studentId, domain],
    );
  }

  createdStudents.push({ name, email, studentId, status: existing.rows.length ? "updated" : "created" });
}

const outDir = path.join(repoRoot, "docs");
fs.mkdirSync(outDir, { recursive: true });
const xlsxPath = path.join(outDir, "dadmin-dev-student-import.xlsx");
const headers = [
  "Name",
  "Email",
  "Grade Band",
  "State Assessment",
  "Home Language",
  "Teacher ID",
  "School ID",
  "Listening",
  "Speaking",
  "Reading",
  "Writing",
  "Email Verified",
  "Password",
];
const ws = XLSX.utils.json_to_sheet(excelRows, { header: headers });
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Students");
XLSX.writeFile(wb, xlsxPath);

const count = await client.query(`SELECT count(*)::int AS n FROM students WHERE school_id = $1`, [schoolId]);

console.log("\n=== dadmin dev demo seed ===");
console.log({
  districtAdmin: DISTRICT_ADMIN_EMAIL,
  districtId,
  school: schoolRow.name,
  schoolId,
  teacherLinked: teacherProfileId,
  studentsInSchool: count.rows[0].n,
});
console.log("Seeded/updated:", createdStudents.length, "students; password:", DEFAULT_PASSWORD);
console.log("Wrote:", xlsxPath);

await client.end();
