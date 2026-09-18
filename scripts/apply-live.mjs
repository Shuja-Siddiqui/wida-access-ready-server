/** SQL migrations on RDS — uses POSTGRES_* from api-server/.env (same as db:push:aws). */
import { runLiveMigrations } from "./apply-migrations.mjs";

await runLiveMigrations();
