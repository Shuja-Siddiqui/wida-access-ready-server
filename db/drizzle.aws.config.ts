/**
 * Drizzle Kit config for AWS RDS PostgreSQL.
 *
 * Required env vars (set as Replit Secrets):
 *   POSTGRES_PASSWORD — RDS database password
 *
 * Optional env vars (defaults to the production RDS endpoint):
 *   POSTGRES_HOST     — RDS endpoint (default: access-ready.c7yayquuwe8h.us-east-2.rds.amazonaws.com)
 *   POSTGRES_PORT     — default 5432
 *   POSTGRES_USER     — default: postgres
 *   POSTGRES_DATABASE — default: postgres
 */
import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config();

const host = process.env.POSTGRES_HOST ?? "access-ready.c7yayquuwe8h.us-east-2.rds.amazonaws.com";
const port = Number(process.env.POSTGRES_PORT ?? 5432);
const user = process.env.POSTGRES_USER ?? "postgres";
const password = process.env.POSTGRES_PASSWORD;
const database = process.env.POSTGRES_DATABASE ?? "postgres";

if (!password) {
  throw new Error("POSTGRES_PASSWORD must be set to sync with AWS RDS");
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
    ssl: "require",
  },
});
