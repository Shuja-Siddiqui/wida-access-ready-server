/** SQL migrations on dev DB — Supabase (DATABASE_URL) or local Postgres (LOCAL_DATABASE_URL). */
import { runDevMigrations } from "./apply-migrations.mjs";

await runDevMigrations();
