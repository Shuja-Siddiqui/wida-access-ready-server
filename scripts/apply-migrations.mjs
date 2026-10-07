import pg from "pg";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.join(__dirname, "..");
const envPath = path.join(apiRoot, ".env");

/** @typedef {{ host?: string, port?: number, user?: string, password: string, database?: string, pushSchema?: boolean, label?: string, connectionString?: string, ssl?: object, pushTarget?: string }} DbConfig */

function loadEnv() {
  dotenv.config({ path: envPath });
}

/** Same POSTGRES_* vars used by db:push:aws and the running API. */
export function loadRdsConfigFromEnv(overrides = {}) {
  loadEnv();
  const password = overrides.password ?? process.env.POSTGRES_PASSWORD;
  const host = overrides.host ?? process.env.POSTGRES_HOST;
  if (!password || !host) {
    return null;
  }
  return {
    host,
    port: Number(overrides.port ?? process.env.POSTGRES_PORT ?? 5432),
    user: overrides.user ?? process.env.POSTGRES_USER ?? "postgres",
    password,
    database: overrides.database ?? process.env.POSTGRES_DATABASE ?? "postgres",
    pushSchema: overrides.pushSchema ?? false,
    pushTarget: "aws",
    ssl: { rejectUnauthorized: false },
  };
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isLocalhostUrl(url) {
  const host = hostFromUrl(url);
  return host === "localhost" || host === "127.0.0.1";
}

/**
 * Apply numbered SQL migrations to one Postgres database, then optionally
 * drizzle-kit push for any remaining schema drift.
 */
export async function runMigrations(config) {
  const label = config.label ?? config.host ?? "database";
  const client = createClient(config);

  await client.connect();
  console.log(`\n=== ${label} ===`);
  console.log(`Connected.`);

  await applySqlMigrations(client);
  await client.end();

  if (config.pushSchema) {
    runDrizzlePush(config);
  }

  console.log(`${label}: migration complete.`);
}

/**
 * Dev database — Supabase or local Postgres via DATABASE_URL / LOCAL_DATABASE_URL.
 * Skips when that URL points at the same host as POSTGRES_HOST (live RDS).
 */
export async function runDevMigrations(options = {}) {
  loadEnv();

  const rdsHost = loadRdsConfigFromEnv()?.host ?? null;
  const url =
    options.connectionString ??
    process.env.LOCAL_DATABASE_URL ??
    process.env.DATABASE_URL ??
    null;

  if (!url) {
    console.log(
      "Skip dev DB (set DATABASE_URL to your Supabase connection string, or LOCAL_DATABASE_URL for localhost Postgres)",
    );
    return;
  }

  const devHost = hostFromUrl(url);
  if (rdsHost && devHost === rdsHost) {
    console.log(
      `Skip dev DB — DATABASE_URL host (${devHost}) is the same as POSTGRES_HOST (live RDS).`,
    );
    return;
  }

  await runMigrations({
    connectionString: url,
    label: `dev (${devHost ?? "postgres"})`,
    pushSchema: options.pushSchema ?? false,
    pushTarget: "local",
  });
}

/** @deprecated Use runDevMigrations — kept for script compatibility. */
export async function runLocalMigrations(options = {}) {
  return runDevMigrations(options);
}

/** AWS RDS — defaults to POSTGRES_* from api-server/.env (same as db:push:aws). */
export async function runLiveMigrations(config) {
  const resolved = config?.host && config?.password
    ? { ...loadRdsConfigFromEnv(), ...config }
    : loadRdsConfigFromEnv(config ?? {});

  if (!resolved?.password || !resolved?.host) {
    throw new Error(
      "RDS not configured. Set POSTGRES_HOST and POSTGRES_PASSWORD in api-server/.env",
    );
  }

  await runMigrations({
    ...resolved,
    label: resolved.label ?? `RDS (${resolved.host})`,
  });
}

/** Dev (Supabase / DATABASE_URL) + live RDS (POSTGRES_*). Skips dev when same host as RDS. */
export async function runAllMigrations(liveOverrides = {}) {
  loadEnv();

  await runDevMigrations();

  const rds = loadRdsConfigFromEnv(liveOverrides);
  if (!rds) {
    throw new Error(
      "RDS not configured. Set POSTGRES_HOST and POSTGRES_PASSWORD in api-server/.env",
    );
  }

  await runLiveMigrations(liveOverrides);

  const { syncLibraryCatalogFromLiveToDev } = await import("./sync-library-catalog.mjs");
  await syncLibraryCatalogFromLiveToDev();

  console.log("\nAll configured databases migrated.");
}

/** Dev DB config when LOCAL_DATABASE_URL / DATABASE_URL differs from POSTGRES_HOST. */
export function getDevDatabaseConfig(options = {}) {
  loadEnv();

  const rdsHost = loadRdsConfigFromEnv()?.host ?? null;
  const url =
    options.connectionString ??
    process.env.LOCAL_DATABASE_URL ??
    process.env.DATABASE_URL ??
    null;

  if (!url) return null;

  const devHost = hostFromUrl(url);
  if (rdsHost && devHost === rdsHost) return null;

  return {
    connectionString: url,
    host: devHost,
  };
}

export function createClient(config) {
  if (config.connectionString) {
    const needsSsl =
      config.ssl ??
      (!isLocalhostUrl(config.connectionString) ? { rejectUnauthorized: false } : undefined);
    return new pg.Client({
      connectionString: config.connectionString,
      ...(needsSsl ? { ssl: needsSsl } : {}),
    });
  }

  if (!config.host || !config.password) {
    throw new Error("Database config requires host + password or connectionString");
  }

  return new pg.Client({
    host: config.host,
    port: Number(config.port ?? 5432),
    user: config.user ?? "postgres",
    password: config.password,
    database: config.database ?? "postgres",
    ssl: config.ssl ?? { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
}

async function tableExists(client, name) {
  const { rows } = await client.query("SELECT to_regclass($1) AS reg", [`public.${name}`]);
  return rows[0]?.reg != null;
}

async function indexExists(client, name) {
  const { rows } = await client.query(
    "SELECT 1 FROM pg_indexes WHERE indexname = $1 LIMIT 1",
    [name],
  );
  return rows.length > 0;
}

async function applyFile(client, file, { continueOnMissing = false } = {}) {
  const fullPath = path.join(__dirname, "../db/drizzle", file);
  const sql = fs.readFileSync(fullPath, "utf8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`  Applying ${file} (${statements.length} statements)...`);
  for (const statement of statements) {
    try {
      await client.query(statement);
    } catch (err) {
      if (continueOnMissing && (err.code === "42P01" || err.code === "42704")) {
        console.log(`  Skip (already applied): ${err.message.split("\n")[0]}`);
        continue;
      }
      throw err;
    }
  }
}

async function applySqlMigrations(client) {
  console.log("  Before:", {
    themes: await tableExists(client, "themes"),
    content_categories: await tableExists(client, "content_categories"),
    student_levels_unique: await indexExists(client, "student_levels_student_id_domain_tier_unique"),
  });

  if (await tableExists(client, "content_categories")) {
    console.log("  Skip 0010 (content_categories already exists)");
  } else if (await tableExists(client, "themes")) {
    await applyFile(client, "0010_rename_themes_to_content_categories.sql", { continueOnMissing: true });
  } else {
    console.log("  Skip 0010 (themes missing — library catalog not installed yet)");
  }

  await applyFile(client, "0009_wida_exit_4_7.sql");

  if (!(await indexExists(client, "student_levels_student_id_domain_tier_unique"))) {
    await applyFile(client, "0011_student_levels_unique.sql");
  } else {
    console.log("  Skip 0011 (student_levels unique index already exists)");
  }

  const libraryUseCountExists = async () => {
    const { rows } = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'library' AND column_name = 'use_count'
      LIMIT 1
    `);
    return rows.length > 0;
  };

  if (!(await libraryUseCountExists())) {
    await applyFile(client, "0012_library_use_count.sql");
  } else {
    console.log("  Skip 0012 (library.use_count already exists)");
  }

  if (!(await tableExists(client, "student_practice_suggestions"))) {
    await applyFile(client, "0013_student_practice_suggestions.sql");
  } else {
    console.log("  Skip 0013 (student_practice_suggestions already exists)");
  }

  if (!(await tableExists(client, "image_generation_pools"))) {
    await applyFile(client, "0014_image_generation.sql");
  } else {
    console.log("  Skip 0014 (image_generation_pools already exists)");
  }

  const jobContextSnapshotExists = async () => {
    const { rows } = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'image_generation_jobs' AND column_name = 'context_snapshot'
      LIMIT 1
    `);
    return rows.length > 0;
  };

  if (await tableExists(client, "image_generation_jobs") && !(await jobContextSnapshotExists())) {
    await applyFile(client, "0015_image_job_context_snapshot.sql");
  } else if (await jobContextSnapshotExists()) {
    console.log("  Skip 0015 (image_generation_jobs.context_snapshot already exists)");
  } else {
    console.log("  Skip 0015 (image_generation_jobs table missing)");
  }

  const libraryIngestSourceExists = async () => {
    const { rows } = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'library' AND column_name = 'ingest_source'
      LIMIT 1
    `);
    return rows.length > 0;
  };

  if (await tableExists(client, "library") && !(await libraryIngestSourceExists())) {
    await applyFile(client, "0016_library_ingest_source.sql");
  } else if (await libraryIngestSourceExists()) {
    console.log("  Skip 0016 (library.ingest_source already exists)");
  } else {
    console.log("  Skip 0016 (library table missing)");
  }

  if (await tableExists(client, "image_generation_pools")) {
    await applyFile(client, "0017_image_factory_drop_general_subject.sql", { continueOnMissing: true });
  } else {
    console.log("  Skip 0017 (image_generation_pools missing)");
  }

  const userSessionLastActiveExists = async () => {
    const { rows } = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_sessions' AND column_name = 'last_active_at'
      LIMIT 1
    `);
    return rows.length > 0;
  };

  if (await tableExists(client, "user_sessions") && !(await userSessionLastActiveExists())) {
    await applyFile(client, "0018_user_session_context.sql", { continueOnMissing: true });
  } else if (await userSessionLastActiveExists()) {
    console.log("  Skip 0018 (user_sessions.last_active_at already exists)");
  } else {
    console.log("  Skip 0018 (user_sessions table missing)");
  }

  const aiTokenCallsExists = async () => tableExists(client, "ai_token_calls");
  const sessionAiTokensExists = async () => {
    const { rows } = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'ai_total_tokens'
      LIMIT 1
    `);
    return rows.length > 0;
  };

  if (!(await aiTokenCallsExists()) || !(await sessionAiTokensExists())) {
    await applyFile(client, "0019_ai_token_tracking.sql", { continueOnMissing: true });
  } else {
    console.log("  Skip 0019 (ai_token_calls already exists)");
  }

  console.log("  After:", {
    themes: await tableExists(client, "themes"),
    content_categories: await tableExists(client, "content_categories"),
    student_levels_unique: await indexExists(client, "student_levels_student_id_domain_tier_unique"),
    library_use_count: await libraryUseCountExists(),
    student_practice_suggestions: await tableExists(client, "student_practice_suggestions"),
    image_generation_pools: await tableExists(client, "image_generation_pools"),
    image_generation_jobs: await tableExists(client, "image_generation_jobs"),
    image_job_context_snapshot: await jobContextSnapshotExists(),
    library_ingest_source: await libraryIngestSourceExists(),
    user_session_last_active: await userSessionLastActiveExists(),
    ai_token_calls: await aiTokenCallsExists(),
    session_ai_total_tokens: await sessionAiTokensExists(),
  });
}

function runDrizzlePush(config) {
  const target = config.pushTarget ?? (config.connectionString ? "local" : "aws");
  const script = target === "aws" ? "db:push:aws" : "db:push";
  console.log(`  Running drizzle-kit push (${script})...`);

  const result = spawnSync("npm", ["run", script, "--", "--force"], {
    cwd: apiRoot,
    env: { ...process.env },
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    console.warn(
      `  Warning: ${script} exited ${result.status}. SQL migrations were still applied.`,
      "Run npm run db:sync manually if you need full schema drift sync.",
    );
  }
}
