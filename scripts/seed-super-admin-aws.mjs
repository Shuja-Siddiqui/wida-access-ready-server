/**
 * Create or reset super_admin on AWS RDS.
 * Usage: node scripts/seed-super-admin-aws.mjs [email] [password]
 */
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { loadRdsConfigFromEnv, createClient } from "./apply-migrations.mjs";

const email = (process.argv[2] ?? "superadmin@accessready.com").trim().toLowerCase();
const plainPassword = process.argv[3] ?? "12345678";
const name = "Super Admin";

const config = loadRdsConfigFromEnv();
if (!config?.host) {
  console.error("POSTGRES_HOST not configured");
  process.exit(1);
}

const passwordHash = await bcrypt.hash(plainPassword, 12);
const client = createClient(config);
await client.connect();
console.log("Connected to RDS:", config.host);

const existing = await client.query(
  `SELECT id FROM users WHERE lower(email) = $1 AND role = 'super_admin'`,
  [email],
);

let userId = existing.rows[0]?.id;
if (!userId) {
  userId = randomUUID();
  await client.query(
    `INSERT INTO users (id, email, name, password_hash, role, email_verified, is_active)
     VALUES ($1, $2, $3, $4, 'super_admin', true, true)`,
    [userId, email, name, passwordHash],
  );
  console.log("Created super_admin user:", email);
} else {
  await client.query(
    `UPDATE users SET password_hash = $1, email_verified = true, is_active = true, name = $2 WHERE id = $3`,
    [passwordHash, name, userId],
  );
  console.log("Updated password for existing super_admin:", email);
}

const prof = await client.query(`SELECT id FROM profiles WHERE user_id = $1`, [userId]);
if (!prof.rows.length) {
  await client.query(`INSERT INTO profiles (id, user_id) VALUES ($1, $2)`, [randomUUID(), userId]);
  console.log("Created profiles row for admin login.");
}

await client.end();
console.log("Super admin ready. Use admin portal login with this email and your password.");
