import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

let pool: pg.Pool;

const localUrl = process.env.LOCAL_DATABASE_URL ?? process.env.DATABASE_URL;

if (localUrl) {
  // Local dev / Supabase — LOCAL_DATABASE_URL or DATABASE_URL (see api-server/.env).
  pool = new Pool({ connectionString: localUrl });
} else if (process.env.POSTGRES_PASSWORD && process.env.POSTGRES_HOST) {
  // AWS RDS — POSTGRES_* only when no local DATABASE_URL is set (e.g. EC2 production).
  pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? "postgres",
    database: process.env.POSTGRES_DATABASE ?? "postgres",
    password: process.env.POSTGRES_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });
} else {
  throw new Error(
    "No database connection configured. Set LOCAL_DATABASE_URL or DATABASE_URL (local), or POSTGRES_HOST + POSTGRES_PASSWORD (RDS).",
  );
}

export { pool };
export const db = drizzle(pool, { schema });

export * from "./schema";
