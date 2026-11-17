/**
 * AWS demo: school + active principal + 20 active student accounts for Kristi's district.
 * Writes docs/kristi-demo-student-import.xlsx for bulk-import template testing.
 *
 * Usage: node --env-file=.env scripts/seed-kristi-demo-school-aws.mjs
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

const DISTRICT_ADMIN_EMAIL = "kristi.costellow@gmail.com";
const DEFAULT_PASSWORD = "hEllo@911.";
const BCRYPT_ROUNDS = 12;
const SCHOOL_NAME = "Kristi Demo Elementary";
const SCHOOL_CODE = "KDE-001";
const PRINCIPAL_EMAIL = "kristi.costellow+demoprincipal@gmail.com";
const PRINCIPAL_NAME = "Demo Principal";

const GRADE_BAND = "6-8";
const WIDA_SCORE = "1.0";
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
  return `kristi.costellow+demostudent${n}@gmail.com`;
}

const client = new pg.Client({
  host: process.env.POSTGRES_HOST,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DATABASE ?? "postgres",
  ssl: { rejectUnauthorized: false },
});

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

let schoolRow = (
  await client.query(
    `SELECT id, name FROM schools WHERE district_id = $1 AND school_code = $2`,
    [districtId, SCHOOL_CODE],
  )
).rows[0];

if (!schoolRow) {
  schoolRow = (
    await client.query(
      `INSERT INTO schools (district_id, name, state, school_code)
       VALUES ($1, $2, 'KY', $3) RETURNING id, name`,
      [districtId, SCHOOL_NAME, SCHOOL_CODE],
    )
  ).rows[0];
  console.log("Created school:", schoolRow.id, schoolRow.name);
} else {
  console.log("Using existing school:", schoolRow.id, schoolRow.name);
}

const schoolId = schoolRow.id;

await client.query(
  `INSERT INTO district_seat_allocations (district_admin_id, school_id, seats_allocated)
   VALUES ($1, $2, 100)
   ON CONFLICT (district_admin_id, school_id)
   DO UPDATE SET seats_allocated = GREATEST(district_seat_allocations.seats_allocated, 100),
                 updated_at = now()`,
  [districtAdminId, schoolId],
);

const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

let principalProfileId;
const existingPrincipal = await client.query(
  `SELECT u.id AS user_id, p.id AS profile_id
   FROM users u
   JOIN profiles p ON p.user_id = u.id
   WHERE lower(u.email) = $1 AND u.role = 'principal'`,
  [PRINCIPAL_EMAIL.toLowerCase()],
);

if (existingPrincipal.rows.length) {
  principalProfileId = existingPrincipal.rows[0].profile_id;
  await client.query(
    `UPDATE users SET email_verified = true, password_hash = $1 WHERE id = $2`,
    [passwordHash, existingPrincipal.rows[0].user_id],
  );
  await client.query(`UPDATE profiles SET school_id = $1 WHERE id = $2`, [schoolId, principalProfileId]);
  console.log("Updated principal:", PRINCIPAL_EMAIL);
} else {
  const userId = crypto.randomUUID();
  principalProfileId = crypto.randomUUID();
  await client.query(
    `INSERT INTO users (id, email, name, password_hash, role, email_verified)
     VALUES ($1, $2, $3, $4, 'principal', true)`,
    [userId, PRINCIPAL_EMAIL.toLowerCase(), PRINCIPAL_NAME, passwordHash],
  );
  await client.query(
    `INSERT INTO profiles (id, user_id, school_id) VALUES ($1, $2, $3)`,
    [principalProfileId, userId, schoolId],
  );
  console.log("Created principal:", PRINCIPAL_EMAIL, "profile", principalProfileId);
}

const excelRows = [];
const createdStudents = [];

for (let i = 0; i < 20; i++) {
  const name = NAMES[i];
  const email = studentEmail(i).toLowerCase();
  const gradeBand = GRADE_BAND;
  const listening = WIDA_SCORE;
  const speaking = WIDA_SCORE;
  const reading = WIDA_SCORE;
  const writing = WIDA_SCORE;

  excelRows.push({
    Name: name,
    Email: email,
    "Grade Band": gradeBand,
    "State Assessment": "WIDA",
    "Home Language": ["Spanish", "Arabic", "Vietnamese", "French", "English"][i % 5],
    "Teacher ID": "",
    "School ID": schoolId,
    Listening: listening,
    Speaking: speaking,
    Reading: reading,
    Writing: writing,
    "Email Verified": "yes",
    Password: DEFAULT_PASSWORD,
  });

  const existing = await client.query(`SELECT id, user_id FROM students WHERE lower(email) = $1`, [email]);
  if (existing.rows.length && existing.rows[0].user_id) {
    createdStudents.push({ name, email, studentId: existing.rows[0].id, status: "existing" });
    continue;
  }

  const userId = crypto.randomUUID();
  const studentId = existing.rows[0]?.id ?? crypto.randomUUID();

  const userCheck = await client.query(`SELECT id FROM users WHERE lower(email) = $1 AND role = 'student'`, [email]);
  let finalUserId = userCheck.rows[0]?.id;
  if (!finalUserId) {
    await client.query(
      `INSERT INTO users (id, email, name, password_hash, role, email_verified)
       VALUES ($1, $2, $3, $4, 'student', true)`,
      [userId, email, name, passwordHash],
    );
    finalUserId = userId;
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
         email_verified = true, password_hash = $7, guardian_id = NULL
       WHERE id = $8`,
      [
        finalUserId,
        name,
        gradeBand,
        excelRows[i]["Home Language"],
        schoolId,
        districtId,
        passwordHash,
        studentId,
      ],
    );
  } else {
    await client.query(
      `INSERT INTO students (
         id, user_id, name, grade_band, state_assessment, home_language, email,
         school_id, district_id, account_type, email_verified, password_hash, track
       ) VALUES ($1, $2, $3, $4, 'WIDA', $5, $6, $7, $8, 'school_managed', true, $9, 'academic')`,
      [
        studentId,
        finalUserId,
        name,
        gradeBand,
        excelRows[i]["Home Language"],
        email,
        schoolId,
        districtId,
        passwordHash,
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

  createdStudents.push({ name, email, studentId, status: "created" });
}

const outDir = path.join(repoRoot, "docs");
fs.mkdirSync(outDir, { recursive: true });
const xlsxPath = path.join(outDir, "kristi-demo-student-import.xlsx");

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
ws["!cols"] = [22, 36, 14, 18, 16, 38, 38, 12, 12, 12, 12, 16, 14].map((w) => ({ wch: w }));
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Students");
XLSX.writeFile(wb, xlsxPath);

const readmePath = path.join(outDir, "kristi-demo-seed-readme.txt");
fs.writeFileSync(
  readmePath,
  `Kristi demo seed (AWS) — ${new Date().toISOString()}

District admin: ${DISTRICT_ADMIN_EMAIL}
School: ${SCHOOL_NAME} (${SCHOOL_CODE})
School ID: ${schoolId}

Principal (Administrator login):
  Email: ${PRINCIPAL_EMAIL}
  Password: ${DEFAULT_PASSWORD}

Students (Student login) — all email verified, password:
  ${DEFAULT_PASSWORD}
  Emails: kristi.costellow+demostudent01@gmail.com … demostudent20@gmail.com
  (Gmail delivers +tags to kristi.costellow@gmail.com)

Excel template: kristi-demo-student-import.xlsx
Note: Students are already in AWS DB; re-importing the same emails will fail duplicate checks.
`,
  "utf8",
);

console.log("\n=== Summary ===");
console.log({ districtId, schoolId, principalEmail: PRINCIPAL_EMAIL, principalProfileId });
console.log("Students:", createdStudents.length);
console.log("Wrote:", xlsxPath);
console.log("Wrote:", readmePath);

await client.end();
