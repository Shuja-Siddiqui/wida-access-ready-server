/**
 * Fix Kristi demo students on AWS: grade band 6-8, WIDA domain levels 1.0.
 * Regenerates docs/kristi-demo-student-import.xlsx to match.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import XLSX from "xlsx";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const EMAIL_PREFIX = "kristi.costellow+demostudent";
const GRADE_BAND = "6-8";
const SCORE = "1.0";

const client = new pg.Client({
  host: process.env.POSTGRES_HOST,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DATABASE ?? "postgres",
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const students = await client.query(
  `SELECT id, name, email, school_id FROM students
   WHERE lower(email) LIKE $1 ORDER BY email`,
  [`${EMAIL_PREFIX}%`],
);

const updated = await client.query(
  `UPDATE students SET grade_band = $1
   WHERE lower(email) LIKE $2
   RETURNING id, email, grade_band`,
  [GRADE_BAND, `${EMAIL_PREFIX}%`],
);

for (const row of students.rows) {
  await client.query(
    `UPDATE student_levels SET current_level = $1, updated_at = now()
     WHERE student_id = $2`,
    [SCORE, row.id],
  );
}

console.log("Updated students grade_band:", updated.rowCount);
console.log("Updated student_levels current_level to", SCORE, "for", students.rows.length, "students");

const excelRows = students.rows.map((s) => ({
  Name: s.name,
  Email: s.email,
  "Grade Band": GRADE_BAND,
  "State Assessment": "WIDA",
  "Home Language": "",
  "Teacher ID": "",
  "School ID": s.school_id ?? "",
  Listening: SCORE,
  Speaking: SCORE,
  Reading: SCORE,
  Writing: SCORE,
  "Email Verified": "yes",
  Password: process.env.KRISTI_DEMO_PASSWORD ?? "hEllo@911.",
}));

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
const xlsxPath = path.join(repoRoot, "docs", "kristi-demo-student-import.xlsx");
const xlsxAlt = path.join(repoRoot, "docs", "kristi-demo-student-import-v2.xlsx");
try {
  XLSX.writeFile(wb, xlsxPath);
  console.log("Wrote", xlsxPath);
} catch (err) {
  XLSX.writeFile(wb, xlsxAlt);
  console.log("Original xlsx locked — wrote", xlsxAlt);
  console.log("Close the open file and re-run to overwrite kristi-demo-student-import.xlsx");
}

await client.end();
