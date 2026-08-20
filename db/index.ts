import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

let pool: pg.Pool;

if (process.env.POSTGRES_PASSWORD && process.env.POSTGRES_HOST) {
  // Prefer discrete RDS vars. A DATABASE_URL with sslmode=require is parsed
  // as verify-full by current `pg` and rejects the cert chain (antivirus /
  // Amazon CA), which is why local login 500'd with "self-signed certificate".
  pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? "postgres",
    database: process.env.POSTGRES_DATABASE ?? "postgres",
    password: process.env.POSTGRES_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });
} else if (process.env.DATABASE_URL) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
} else {
  throw new Error(
    "No database connection configured. Set POSTGRES_HOST + POSTGRES_PASSWORD (AWS RDS) or DATABASE_URL.",
  );
}

export { pool };
export const db = drizzle(pool, { schema });

export * from "./schema";
