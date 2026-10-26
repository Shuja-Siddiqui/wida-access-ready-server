import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const email = (process.argv[2] ?? "dadmin@gmail.com").trim().toLowerCase();
const conn = process.env.DATABASE_URL ?? process.env.LOCAL_DATABASE_URL;
const client = new pg.Client({ connectionString: conn });
await client.connect();
const r = await client.query(
  `DELETE FROM invitations
   WHERE inviter_id = (
     SELECT da.id FROM district_admins da
     JOIN users u ON u.id = da.user_id
     WHERE lower(u.email) = $1
   )
   RETURNING invitee_email, invitee_role`,
  [email],
);
console.log("Removed pending invitations:", r.rowCount, r.rows);
await client.end();
