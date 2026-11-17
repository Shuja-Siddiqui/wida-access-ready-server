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

const subs = await client.query(`SELECT id, status, customer, created, metadata FROM stripe.subscriptions ORDER BY created DESC NULLS LAST LIMIT 3`);
console.log("recent subs:", subs.rows);

const owners = await client.query(`SELECT * FROM owner_stripe_customers LIMIT 5`);
console.log("owner_stripe_customers sample:", owners.rows);

if (owners.rows[0]) {
  const sid = owners.rows[0].stripe_customer_id;
  const s = await client.query(`SELECT * FROM stripe.subscriptions WHERE customer = $1`, [sid]);
  console.log("sub for first owner:", s.rows);
  if (s.rows[0]) {
    const si = await client.query(`SELECT id, quantity, subscription, current_period_end FROM stripe.subscription_items WHERE subscription = $1`, [s.rows[0].id]);
    console.log("items:", si.rows);
  }
}

const prices = await client.query(`SELECT id, product, unit_amount, recurring FROM stripe.prices WHERE active = true LIMIT 5`);
console.log("prices:", prices.rows);

await client.end();
