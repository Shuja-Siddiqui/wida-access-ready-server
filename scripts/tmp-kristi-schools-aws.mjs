import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const client = new pg.Client({
  host: process.env.POSTGRES_HOST,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DATABASE ?? "postgres",
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const districtId = "a20f6090-77ac-4440-bde3-f50e2fb229e2";
const adminId = "ad003adc-598c-4925-8112-adb09fde813a";

const schools = await client.query(`SELECT id, name FROM schools WHERE district_id = $1`, [districtId]);
console.log("schools:", schools.rows);

const alloc = await client.query(
  `SELECT * FROM district_seat_allocations WHERE district_admin_id = $1`,
  [adminId],
);
console.log("allocations:", alloc.rows);

await client.end();
