/**
 * Link a district_admin user to a district (district_admins row + districts.admin_id).
 * Usage:
 *   node --env-file=.env scripts/repair-district-admin-link.mjs <email> <districtId>
 */
import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const email = process.argv[2]?.trim().toLowerCase();
const districtId = process.argv[3]?.trim();
const useAws = process.argv.includes("--aws");

if (!email || !districtId) {
  console.error("Usage: node scripts/repair-district-admin-link.mjs <email> <districtId> [--aws]");
  process.exit(1);
}

const client = useAws
  ? new pg.Client({
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DATABASE ?? "postgres",
      ssl: { rejectUnauthorized: false },
    })
  : new pg.Client({ connectionString: process.env.DATABASE_URL });

await client.connect();

const { rows: users } = await client.query(
  `SELECT id, role FROM users WHERE lower(email) = $1 AND role = 'district_admin'`,
  [email],
);
if (users.length !== 1) {
  console.error("Expected exactly one district_admin user; found", users.length);
  process.exit(1);
}
const userId = users[0].id;

const { rows: districts } = await client.query(`SELECT id, name, admin_id FROM districts WHERE id = $1`, [
  districtId,
]);
if (districts.length !== 1) {
  console.error("District not found:", districtId);
  process.exit(1);
}
if (districts[0].admin_id && districts[0].admin_id !== userId) {
  console.error("District already has a different admin_id:", districts[0].admin_id);
  process.exit(1);
}

const { rows: existing } = await client.query(`SELECT id FROM district_admins WHERE user_id = $1`, [userId]);
if (existing.length) {
  console.log("district_admins row already exists:", existing[0].id);
} else {
  const ins = await client.query(
    `INSERT INTO district_admins (user_id, district_id) VALUES ($1, $2) RETURNING id`,
    [userId, districtId],
  );
  console.log("Created district_admins:", ins.rows[0].id);
}

await client.query(`UPDATE districts SET admin_id = $1 WHERE id = $2 AND (admin_id IS NULL OR admin_id = $1)`, [
  userId,
  districtId,
]);
console.log("Updated districts.admin_id for", districts[0].name);

await client.end();
console.log("Done. User can log in as Administrator with email/password.");
