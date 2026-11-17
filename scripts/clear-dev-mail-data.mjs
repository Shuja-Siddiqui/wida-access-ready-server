/**
 * Clear invitation + pending email token rows on LOCAL dev Postgres only.
 * Usage: node --env-file=.env scripts/clear-dev-mail-data.mjs
 */
import pg from "pg";

const url = process.env.DATABASE_URL || process.env.LOCAL_DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

let host = "";
try {
  host = new URL(url.replace(/^postgresql:/, "postgres:")).hostname;
} catch {
  console.error("Invalid DATABASE_URL");
  process.exit(1);
}

const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
if (!localHosts.has(host)) {
  console.error(
    `Refusing to run: DATABASE_URL host is "${host}" (not localhost). Use local dev DB only.`,
  );
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
const client = await pool.connect();

try {
  await client.query("BEGIN");

  const tables = [
    "invitations",
    "email_verification_tokens",
    "password_reset_tokens",
  ];

  for (const table of tables) {
    const before = await client.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
    const n = before.rows[0].n;
    await client.query(`DELETE FROM ${table}`);
    console.log(`Deleted ${n} row(s) from ${table}`);
  }

  await client.query("COMMIT");
  console.log("\nDone. You can send principal (and other) invites again.");
} catch (err) {
  await client.query("ROLLBACK");
  console.error("Failed:", err.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
