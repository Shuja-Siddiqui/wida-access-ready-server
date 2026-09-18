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

/** Machine-local Postgres (LOCAL_DATABASE_URL or localhost DATABASE_URL). */
export async function runLocalMigrations(options = {}) {
  loadEnv();

  const url =
    options.connectionString ??
    process.env.LOCAL_DATABASE_URL ??
    (process.env.DATABASE_URL && isLocalhostUrl(process.env.DATABASE_URL)
      ? process.env.DATABASE_URL
      : null);

  if (!url) {
    console.log(
      "Skip local Postgres (set LOCAL_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/accessready)",
    );
    return;
  }

  await runMigrations({
    connectionString: url,
    label: `local (${hostFromUrl(url) ?? "postgres"})`,
    pushSchema: options.pushSchema ?? false,
    pushTarget: "local",
  });
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

/** Local Postgres (if configured) + RDS from .env — skips duplicate hosts. */
export async function runAllMigrations(liveOverrides = {}) {
  loadEnv();

  await runLocalMigrations();

  const rds = loadRdsConfigFromEnv(liveOverrides);
  if (!rds) {
    throw new Error(
      "RDS not configured. Set POSTGRES_HOST and POSTGRES_PASSWORD in api-server/.env",
    );
  }

  // DATABASE_URL often points at the same RDS — don't migrate twice.
  const rdsUrl = process.env.DATABASE_URL;
  if (rdsUrl && hostFromUrl(rdsUrl) === rds.host && !isLocalhostUrl(rdsUrl)) {
    console.log(`\nDATABASE_URL already targets ${rds.host} — single RDS migration.`);
    await runLiveMigrations(liveOverrides);
  } else {
    await runLiveMigrations(liveOverrides);
  }

  console.log("\nAll configured databases migrated.");
}

function createClient(config) {
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

  console.log("  After:", {
    themes: await tableExists(client, "themes"),
    content_categories: await tableExists(client, "content_categories"),
    student_levels_unique: await indexExists(client, "student_levels_student_id_domain_tier_unique"),
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
