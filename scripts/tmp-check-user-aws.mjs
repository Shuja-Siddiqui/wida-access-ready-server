import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/tmp-check-user-aws.mjs <email>");
  process.exit(1);
}

const client = new pg.Client({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "postgres",
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DATABASE ?? "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 60000,
});

await client.connect();
console.log("Connected to AWS RDS:", process.env.POSTGRES_HOST);

const users = await client.query(
  `SELECT id, email, role, email_verified, password_hash IS NOT NULL AS has_password,
          google_id IS NOT NULL AS has_google, name, created_at
   FROM users WHERE lower(email) = $1 ORDER BY role`,
  [email],
);
console.log("\n=== users ===");
console.log(JSON.stringify(users.rows, null, 2));

const da = await client.query(
  `SELECT da.id AS district_admin_id, da.district_id, da.user_id, d.name AS district_name, d.admin_id AS district_admin_user_id
   FROM district_admins da
   JOIN users u ON u.id = da.user_id
   LEFT JOIN districts d ON d.id = da.district_id
   WHERE lower(u.email) = $1`,
  [email],
);
console.log("\n=== district_admins ===");
console.log(JSON.stringify(da.rows, null, 2));

const districtsByAdmin = await client.query(
  `SELECT d.id, d.name, d.admin_id, u.email AS admin_user_email, u.role AS admin_user_role
   FROM districts d
   LEFT JOIN users u ON u.id = d.admin_id
   WHERE lower(u.email) = $1 OR d.admin_id IN (SELECT id FROM users WHERE lower(email) = $1)`,
  [email],
);
console.log("\n=== districts (admin link) ===");
console.log(JSON.stringify(districtsByAdmin.rows, null, 2));

const invites = await client.query(
  `SELECT id, invitee_role, invitee_name, accepted_at, expires_at, created_at,
          metadata
   FROM invitations WHERE lower(invitee_email) = $1 ORDER BY created_at DESC LIMIT 5`,
  [email],
);
console.log("\n=== invitations ===");
console.log(JSON.stringify(invites.rows, null, 2));

const profiles = await client.query(
  `SELECT p.id AS profile_id, p.user_id, u.role
   FROM profiles p JOIN users u ON u.id = p.user_id WHERE lower(u.email) = $1`,
  [email],
);
console.log("\n=== profiles (guardians) ===");
console.log(JSON.stringify(profiles.rows, null, 2));

await client.end();
