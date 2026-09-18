/** SQL migrations on local Postgres (if configured) + RDS from api-server/.env. */
import { runAllMigrations } from "./apply-migrations.mjs";

await runAllMigrations();
