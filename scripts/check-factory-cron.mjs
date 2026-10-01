import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env"), override: true });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const jobs = await pool.query(`
  SELECT id, status, subject, level, created_at, library_image_id
  FROM image_generation_jobs
  ORDER BY created_at DESC
  LIMIT 10
`);

const lib = await pool.query(`
  SELECT id, ingest_source, generation_backend, created_at
  FROM library
  WHERE ingest_source = 'image_factory'
  ORDER BY created_at DESC
  LIMIT 10
`);

console.log("IMAGE_FACTORY_CRON_ENABLED:", process.env.IMAGE_FACTORY_CRON_ENABLED);
console.log("\nRecent image_generation_jobs:");
for (const row of jobs.rows) {
  console.log(`  ${row.created_at} | ${row.status} | ${row.subject} L${row.level} | lib=${row.library_image_id ?? "—"}`);
}
console.log("\nRecent image_factory library rows:", lib.rows.length);
for (const row of lib.rows) {
  console.log(`  ${row.created_at} | ${row.generation_backend} | ${row.id}`);
}

await pool.end();
