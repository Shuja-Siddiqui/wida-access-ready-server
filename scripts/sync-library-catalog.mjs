/**
 * Copy image library catalog rows from live RDS → dev (local / Supabase).
 * S3 holds the files; this keeps DB metadata (library, topics, categories) in sync.
 * Source of truth: POSTGRES_* (RDS). Target: LOCAL_DATABASE_URL / DATABASE_URL.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createClient,
  getDevDatabaseConfig,
  loadRdsConfigFromEnv,
} from "./apply-migrations.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {Array<{ table: string, conflict: string[] }>} */
const CATALOG_TABLES = [
  { table: "content_categories", conflict: ["id"] },
  { table: "topics", conflict: ["id"] },
  { table: "library", conflict: ["id"] },
  { table: "library_topics", conflict: ["library_id", "topic_id"] },
];

async function tableExists(client, name) {
  const { rows } = await client.query("SELECT to_regclass($1) AS reg", [`public.${name}`]);
  return rows[0]?.reg != null;
}

async function fetchAll(client, table) {
  const { rows } = await client.query(`SELECT * FROM ${table}`);
  return rows;
}

async function getColumnTypes(client, table) {
  const { rows } = await client.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return Object.fromEntries(rows.map((r) => [r.column_name, r.data_type]));
}

function prepareValue(dataType, value) {
  if (value === null || value === undefined) return value;
  if (dataType === "json" || dataType === "jsonb") {
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  return value;
}

async function upsertRows(client, table, rows, conflictColumns) {
  if (rows.length === 0) return 0;

  const columnTypes = await getColumnTypes(client, table);
  let count = 0;
  for (const row of rows) {
    const columns = Object.keys(row);
    const values = columns.map((col) => prepareValue(columnTypes[col], row[col]));
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
    const conflict = conflictColumns.join(", ");
    const updates = columns
      .filter((c) => !conflictColumns.includes(c))
      .map((c) => `${c} = EXCLUDED.${c}`)
      .join(", ");

    await client.query(
      `INSERT INTO ${table} (${columns.join(", ")})
       VALUES (${placeholders})
       ON CONFLICT (${conflict}) DO UPDATE SET ${updates}`,
      values,
    );
    count++;
  }
  return count;
}

async function upsertLibraryUploaders(source, target) {
  const { rows } = await source.query(`
    SELECT DISTINCT u.*
    FROM users u
    INNER JOIN library l ON l.uploader_id = u.id
  `);
  return upsertRows(target, "users", rows, ["id"]);
}

async function deleteDevRowsNotOnLive(source, target, table, idColumn = "id") {
  const { rows: liveIds } = await source.query(`SELECT ${idColumn} FROM ${table}`);
  const ids = liveIds.map((r) => r[idColumn]);
  if (ids.length === 0) {
    await target.query(`DELETE FROM ${table}`);
    return;
  }
  await target.query(`DELETE FROM ${table} WHERE NOT (${idColumn} = ANY($1::uuid[]))`, [ids]);
}

async function deleteDevLibraryTopicsNotOnLive(source, target) {
  const { rows: liveRows } = await source.query(
    "SELECT library_id, topic_id FROM library_topics",
  );
  if (liveRows.length === 0) {
    await target.query("DELETE FROM library_topics");
    return;
  }

  const libraryIds = liveRows.map((r) => r.library_id);
  const topicIds = liveRows.map((r) => r.topic_id);
  await target.query(
    `DELETE FROM library_topics d
     WHERE NOT EXISTS (
       SELECT 1
       FROM unnest($1::uuid[], $2::uuid[]) AS live(library_id, topic_id)
       WHERE d.library_id = live.library_id AND d.topic_id = live.topic_id
     )`,
    [libraryIds, topicIds],
  );
}

/** @param {{ source: import("pg").Client, target: import("pg").Client, sourceLabel?: string, targetLabel?: string }} opts */
export async function syncLibraryCatalog({ source, target, sourceLabel = "RDS", targetLabel = "dev" }) {
  if (!(await tableExists(source, "library"))) {
    console.log(`  Skip library sync — ${sourceLabel} has no library table yet.`);
    return null;
  }
  if (!(await tableExists(target, "library"))) {
    console.log(`  Skip library sync — ${targetLabel} has no library table yet.`);
    return null;
  }

  console.log(`\n=== Library catalog sync (${sourceLabel} → ${targetLabel}) ===`);

  await target.query("BEGIN");
  try {
    const uploaders = await upsertLibraryUploaders(source, target);
    if (uploaders > 0) {
      console.log(`  Upserted ${uploaders} uploader user(s) referenced by library.`);
    }

    const counts = {};
    for (const { table, conflict } of CATALOG_TABLES) {
      const rows = await fetchAll(source, table);
      counts[table] = rows.length;
      await upsertRows(target, table, rows, conflict);
    }

    await deleteDevLibraryTopicsNotOnLive(source, target);
    await deleteDevRowsNotOnLive(source, target, "library");
    await deleteDevRowsNotOnLive(source, target, "topics");
    await deleteDevRowsNotOnLive(source, target, "content_categories");

    await target.query("COMMIT");

    console.log("  Synced:", counts);
    return counts;
  } catch (err) {
    await target.query("ROLLBACK");
    throw err;
  }
}

/** RDS (POSTGRES_*) → dev (LOCAL_DATABASE_URL / DATABASE_URL). No-op when same host. */
export async function syncLibraryCatalogFromLiveToDev() {
  const dev = getDevDatabaseConfig();
  const rds = loadRdsConfigFromEnv();
  if (!dev || !rds) {
    console.log("Skip library sync — dev and RDS must both be configured with different hosts.");
    return null;
  }

  const source = createClient(rds);
  const target = createClient(dev);
  await source.connect();
  await target.connect();

  try {
    return await syncLibraryCatalog({
      source,
      target,
      sourceLabel: `RDS (${rds.host})`,
      targetLabel: `dev (${dev.host ?? "postgres"})`,
    });
  } finally {
    await source.end();
    await target.end();
  }
}

/** dev (LOCAL_DATABASE_URL / DATABASE_URL) → RDS (POSTGRES_*). No-op when same host. */
export async function syncLibraryCatalogFromDevToLive() {
  const dev = getDevDatabaseConfig();
  const rds = loadRdsConfigFromEnv();
  if (!dev || !rds) {
    console.log("Skip library sync — dev and RDS must both be configured with different hosts.");
    return null;
  }

  const source = createClient(dev);
  const target = createClient(rds);
  await source.connect();
  await target.connect();

  try {
    return await syncLibraryCatalog({
      source,
      target,
      sourceLabel: `dev (${dev.host ?? "postgres"})`,
      targetLabel: `RDS (${rds.host})`,
    });
  } finally {
    await source.end();
    await target.end();
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const toLive = process.argv.includes("--to-live");
  if (toLive) {
    await syncLibraryCatalogFromDevToLive();
  } else {
    await syncLibraryCatalogFromLiveToDev();
  }
}
