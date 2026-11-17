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

const c = await client.query(`SELECT id, _raw_data FROM stripe.customers LIMIT 1`);
console.log(JSON.stringify(c.rows[0], null, 2));

const s = await client.query(`SELECT id, _raw_data FROM stripe.subscriptions WHERE status = 'active' LIMIT 1`);
console.log("sub keys", Object.keys(s.rows[0]?._raw_data ?? {}));

const si = await client.query(`SELECT id, _raw_data FROM stripe.subscription_items LIMIT 1`);
console.log("item", si.rows[0]);

await client.end();
