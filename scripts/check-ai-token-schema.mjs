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

async function schemaSnapshot(client) {
  const table = async (name) => {
    const { rows } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
      [name],
    );
    return rows.length > 0;
  };
  const col = async (t, c) => {
    const { rows } = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
      [t, c],
    );
    return rows.length > 0;
  };

  const aiTokenCalls = await table("ai_token_calls");
  let studentIdNullable = null;
  if (aiTokenCalls) {
    const { rows } = await client.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name='ai_token_calls' AND column_name='student_id'`,
    );
    studentIdNullable = rows[0]?.is_nullable ?? "?";
  }

  return {
    ai_token_calls: aiTokenCalls,
    sessions_ai_total_tokens: await col("sessions", "ai_total_tokens"),
    ai_token_calls_user_id: await col("ai_token_calls", "user_id"),
    ai_token_calls_image_job_id: await col("ai_token_calls", "image_job_id"),
    ai_token_calls_student_id_nullable: studentIdNullable,
  };
}

async function probe(label, config) {
  const client = createClient(config);
  try {
    await client.connect();
    const schema = await schemaSnapshot(client);
    return { label, ok: true, schema };
  } catch (err) {
    return { label, ok: false, error: err.message };
  } finally {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
}

const dev = getDevDatabaseConfig();
const rds = loadRdsConfigFromEnv();
const results = [];

if (dev) {
  const localHost = dev.host === "localhost" || dev.host === "127.0.0.1";
  results.push(
    await probe(`dev (${dev.host})`, {
      connectionString: dev.connectionString,
      ...(localHost ? {} : { ssl: { rejectUnauthorized: false } }),
    }),
  );
} else {
  results.push({
    label: "dev",
    ok: false,
    error: "No separate dev DATABASE_URL / LOCAL_DATABASE_URL (or same host as POSTGRES_HOST)",
  });
}

if (rds) {
  results.push(await probe(`RDS (${rds.host})`, rds));
} else {
  results.push({ label: "RDS", ok: false, error: "POSTGRES_HOST / POSTGRES_PASSWORD not set" });
}

console.log(JSON.stringify(results, null, 2));

const need = (s) =>
  s.ai_token_calls &&
  s.sessions_ai_total_tokens &&
  s.ai_token_calls_user_id &&
  s.ai_token_calls_image_job_id &&
  s.ai_token_calls_student_id_nullable === "YES";

for (const r of results) {
  if (r.ok && r.schema) {
    r.migration_0019_0020_ok = need(r.schema);
  }
}

async function testSessionsRollup(config, label) {
  const client = createClient(config);
  try {
    await client.connect();
    const { rows } = await client.query(`
      SELECT count(distinct t.session_id)::int AS session_count
      FROM ai_token_calls t
      INNER JOIN sessions s ON t.session_id = s.id
      WHERE t.session_id IS NOT NULL
    `);
    console.log(`  ${label} sessions rollup query: OK (${rows[0]?.session_count ?? 0} sessions with tokens)`);
  } catch (err) {
    console.log(`  ${label} sessions rollup query: FAILED — ${err.message}`);
  } finally {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
}

if (rds) await testSessionsRollup(rds, "RDS");
if (dev) {
  const localHost = dev.host === "localhost" || dev.host === "127.0.0.1";
  await testSessionsRollup(
    {
      connectionString: dev.connectionString,
      ...(localHost ? {} : { ssl: { rejectUnauthorized: false } }),
    },
    "dev",
  );
}

console.log("\nSummary:");
for (const r of results) {
  if (!r.ok) {
    console.log(`  ${r.label}: UNREACHABLE — ${r.error}`);
  } else if (r.migration_0019_0020_ok) {
    console.log(`  ${r.label}: OK (0019+0020 schema present)`);
  } else {
    console.log(`  ${r.label}: BEHIND — run npm run db:migrate:live (or db:migrate:all)`);
    console.log(`    schema:`, r.schema);
  }
}
