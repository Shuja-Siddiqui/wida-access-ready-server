/** SQL migrations on dev Supabase (DATABASE_URL) + live RDS (POSTGRES_*). */
import { runAllMigrations } from "./apply-migrations.mjs";

await runAllMigrations();
