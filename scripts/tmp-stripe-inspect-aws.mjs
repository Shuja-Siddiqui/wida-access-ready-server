import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const email = process.argv[2]?.toLowerCase() ?? "kristi.costellow@gmail.com";

const client = new pg.Client({
  host: process.env.POSTGRES_HOST,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DATABASE ?? "postgres",
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const tables = await client.query(
  `SELECT table_name FROM information_schema.tables WHERE table_schema = 'stripe' ORDER BY 1`,
);
console.log("stripe tables:", tables.rows.map((r) => r.table_name));

const da = await client.query(
  `SELECT da.id AS district_admin_id, da.district_id, u.email
   FROM district_admins da JOIN users u ON u.id = da.user_id
   WHERE lower(u.email) = $1`,
  [email],
);
console.log("district_admin:", da.rows[0]);

if (da.rows[0]) {
  const osc = await client.query(
    `SELECT * FROM owner_stripe_customers WHERE owner_id = $1 AND owner_type = 'organization'`,
    [da.rows[0].district_admin_id],
  );
  console.log("owner_stripe_customers:", osc.rows);

  if (osc.rows[0]?.stripe_customer_id) {
    const subs = await client.query(
      `SELECT s.id, s.status, s.customer, s.created FROM stripe.subscriptions s WHERE s.customer = $1`,
      [osc.rows[0].stripe_customer_id],
    );
    console.log("subscriptions:", subs.rows);
    if (subs.rows[0]) {
      const items = await client.query(
        `SELECT * FROM stripe.subscription_items WHERE subscription = $1`,
        [subs.rows[0].id],
      );
      console.log("subscription_items:", items.rows);
    }
  }
}

const sampleSub = await client.query(
  `SELECT s.id, s.status, s.customer FROM stripe.subscriptions s WHERE s.status = 'active' LIMIT 1`,
);
if (sampleSub.rows[0]) {
  const cols = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='stripe' AND table_name='subscriptions' ORDER BY ordinal_position`,
  );
  console.log("subscription columns:", cols.rows.map((c) => c.column_name).join(", "));
  const itemsCols = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='stripe' AND table_name='subscription_items' ORDER BY ordinal_position`,
  );
  console.log("subscription_items columns:", itemsCols.rows.map((c) => c.column_name).join(", "));
  const custCols = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='stripe' AND table_name='customers' ORDER BY ordinal_position LIMIT 20`,
  );
  console.log("customers columns (first 20):", custCols.rows.map((c) => c.column_name).join(", "));
}

await client.end();
