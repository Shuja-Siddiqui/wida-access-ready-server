import fs from "node:fs";
import pg from "pg";

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "postgres",
  database: process.env.POSTGRES_DATABASE ?? "postgres",
  password: process.env.POSTGRES_PASSWORD,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 120000,
});

function parseCopyBlocks(sql) {
  const blocks = [];
  const re = /^COPY ([^\s]+) \((.*)\) FROM stdin;\n([\s\S]*?)^\\\.\s*$/gm;
  let m;
  while ((m = re.exec(sql))) {
    const table = m[1];
    const cols = m[2].split(", ").map((c) => c.replace(/"/g, ""));
    const rows = [];
    for (const line of m[3].split("\n")) {
      if (!line) continue;
      rows.push(
        line.split("\t").map((v) => {
          if (v === "\\N") return null;
          return v
            .replace(/\\t/g, "\t")
            .replace(/\\n/g, "\n")
            .replace(/\\\\/g, "\\");
        }),
      );
    }
    blocks.push({ table, cols, rows });
  }
  return blocks;
}

const dump = fs.readFileSync(new URL("../replit-backup.sql", import.meta.url), "utf8");
const blocks = parseCopyBlocks(dump);
const ddl = dump
  .replace(/^COPY [\s\S]*?^\\\.\s*$/gm, "")
  .replace(/^SET transaction_timeout = 0;\s*$/gm, "");

const client = await pool.connect();
try {
  console.log("Resetting public + stripe schemas on RDS…");
  await client.query(`
    drop schema if exists stripe cascade;
    drop schema if exists public cascade;
    create schema public;
    grant all on schema public to postgres;
    grant all on schema public to public;
  `);

  console.log("Applying dump DDL…");
  await client.query(ddl);
  await client.query("set search_path to public, stripe, pg_catalog");

  console.log("Loading", blocks.length, "COPY tables…");
  await client.query("set session_replication_role = replica");
  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  for (const b of blocks) {
    if (!b.rows.length) continue;
    const colList = b.cols.map((c) => `"${c}"`).join(", ");
    const placeholders = b.cols.map((_, i) => `$${i + 1}`).join(", ");
    const conflict = b.cols.includes("id")
      ? " on conflict (id) do nothing"
      : "";
    const stmt = `insert into ${b.table} (${colList}) values (${placeholders})${conflict}`;
    for (const row of b.rows) {
      try {
        const res = await client.query(stmt, row);
        if (res.rowCount === 0) skipped += 1;
        else inserted += 1;
      } catch (e) {
        failed += 1;
        if (failed <= 12) console.error("FAIL", b.table, e.message.split("\n")[0]);
      }
    }
  }
  await client.query("set session_replication_role = origin");

  const users = await client.query(
    "select email, role from public.users order by email",
  );
  const students = await client.query(
    "select count(*)::int as n from public.students",
  );
  console.log("done inserted", inserted, "skipped", skipped, "failed", failed);
  console.log("users", users.rows);
  console.log("students", students.rows[0].n);
} finally {
  client.release();
  await pool.end();
}
