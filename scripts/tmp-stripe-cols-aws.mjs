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

for (const table of ["customers", "subscriptions", "subscription_items"]) {
  const r = await client.query(
    `SELECT column_name, is_generated, column_default
     FROM information_schema.columns
     WHERE table_schema = 'stripe' AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );
  console.log("\n", table);
  for (const row of r.rows) {
    if (row.is_generated === "NEVER" || row.is_generated === "NO") {
      console.log(" ", row.column_name, row.column_default ? "(default)" : "");
    } else {
      console.log(" ", row.column_name, "(GENERATED)");
    }
  }
}

await client.end();
