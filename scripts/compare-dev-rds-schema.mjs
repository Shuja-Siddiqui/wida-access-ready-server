/**
 * Compare public table lists: local dev vs RDS (POSTGRES_*).
 * Usage: node scripts/compare-dev-rds-schema.mjs
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createClient,
  loadRdsConfigFromEnv,
  getDevDatabaseConfig,
} from "./apply-migrations.mjs";

const apiRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(apiRoot, ".env") });

async function listPublicTables(config) {
  const client = createClient(config);
  await client.connect();
  const { rows } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  await client.end();
  return rows.map((r) => r.table_name);
}

const dev = getDevDatabaseConfig();
const rds = loadRdsConfigFromEnv();

if (!dev) {
  console.error("No dev DB: set LOCAL_DATABASE_URL or DATABASE_URL (must differ from POSTGRES_HOST).");
  process.exit(1);
}
if (!rds) {
  console.error("No RDS: set POSTGRES_HOST and POSTGRES_PASSWORD.");
  process.exit(1);
}

const localHost = dev.host === "localhost" || dev.host === "127.0.0.1";
const devConfig = {
  connectionString: dev.connectionString,
  ...(localHost ? {} : { ssl: { rejectUnauthorized: false } }),
};

const [devTables, rdsTables] = await Promise.all([
  listPublicTables(devConfig),
  listPublicTables(rds),
]);

const devSet = new Set(devTables);
const rdsSet = new Set(rdsTables);
const onlyDev = devTables.filter((t) => !rdsSet.has(t));
const onlyRds = rdsTables.filter((t) => !devSet.has(t));

console.log(`Dev (${dev.host}): ${devTables.length} tables`);
console.log(`RDS (${rds.host}): ${rdsTables.length} tables`);

if (onlyDev.length === 0 && onlyRds.length === 0) {
  console.log("\nSchema tables: IN SYNC (same public table names).");
} else {
  console.log("\nSchema tables: DIFFER");
  if (onlyDev.length) console.log("  Only on dev:", onlyDev.join(", "));
  if (onlyRds.length) console.log("  Only on RDS:", onlyRds.join(", "));
}
