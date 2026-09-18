/** SQL migrations on local Postgres — LOCAL_DATABASE_URL or localhost DATABASE_URL. */
import { runLocalMigrations } from "./apply-migrations.mjs";

await runLocalMigrations();
