import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const client = new pg.Client({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DATABASE ?? "postgres",
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const noAdmin = await client.query(
  `SELECT id, name, state, district_code, admin_id, created_at FROM districts WHERE admin_id IS NULL ORDER BY created_at DESC LIMIT 15`,
);
console.log("districts without admin:", JSON.stringify(noAdmin.rows, null, 2));

const kristiUserId = "d7ceecf2-0d20-4668-9a7c-f483e5662f92";
const profile = await client.query(`SELECT * FROM profiles WHERE user_id = $1`, [kristiUserId]);
console.log("kristi profile:", JSON.stringify(profile.rows, null, 2));

await client.end();
