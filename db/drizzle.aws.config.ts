/**
 * Drizzle Kit config for AWS RDS PostgreSQL.
 *
 * Required env vars (set as Replit Secrets):
 *   POSTGRES_PASSWORD — RDS database password
 *
 * Required env vars:
 *   POSTGRES_HOST     — RDS endpoint (must be set in api-server/.env)
 *   POSTGRES_PORT     — default 5432
 *   POSTGRES_USER     — default: postgres
 *   POSTGRES_DATABASE — default: postgres
 */
import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config();

const host = process.env.POSTGRES_HOST;
const port = Number(process.env.POSTGRES_PORT ?? 5432);
const user = process.env.POSTGRES_USER ?? "postgres";
const password = process.env.POSTGRES_PASSWORD;
const database = process.env.POSTGRES_DATABASE ?? "postgres";

if (!host || !password) {
  throw new Error("POSTGRES_HOST and POSTGRES_PASSWORD must be set in api-server/.env");
}

export default defineConfig({
  schema: "./db/schema/*.ts",
  dialect: "postgresql",
  dbCredentials: {
    host,
    port,
    user,
    password,
    database,
    ssl: { rejectUnauthorized: false },
  },
});
