import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const email = process.argv[2]?.toLowerCase() ?? "nomibabaoo82@gmail.com";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const inv = await client.query(
  `SELECT id, invitee_email, invitee_role, invitee_name, accepted_at, expires_at, created_at, token_hash
   FROM invitations WHERE lower(invitee_email) = $1 ORDER BY created_at DESC LIMIT 3`,
  [email],
);
console.log("invitations:", inv.rows);

const users = await client.query(
  `SELECT id, email, role, email_verified, created_at FROM users WHERE lower(email) = $1`,
  [email],
);
console.log("users:", users.rows);

await client.end();
