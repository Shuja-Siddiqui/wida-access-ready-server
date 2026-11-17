/**
 * Set bcrypt password_hash on AWS RDS for a user role.
 * Usage: node --env-file=.env scripts/set-user-password-aws.mjs <email> <role> <password>
 */
import bcrypt from "bcryptjs";
import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const email = process.argv[2]?.trim().toLowerCase();
const role = process.argv[3]?.trim();
const plainPassword = process.argv[4];

if (!email || !role || !plainPassword) {
  console.error("Usage: node scripts/set-user-password-aws.mjs <email> <role> <password>");
  process.exit(1);
}

const BCRYPT_ROUNDS = 12;
const passwordHash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);

const client = new pg.Client({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DATABASE ?? "postgres",
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const result = await client.query(
  `UPDATE users SET password_hash = $1 WHERE lower(email) = $2 AND role = $3 RETURNING id, email, role`,
  [passwordHash, email, role],
);

if (!result.rowCount) {
  console.error("No user updated for", email, role);
  process.exit(1);
}

console.log("Updated password_hash for", result.rows[0].email, "role", result.rows[0].role);
console.log("Hash stored (bcrypt", BCRYPT_ROUNDS + " rounds), not plaintext.");

await client.end();
