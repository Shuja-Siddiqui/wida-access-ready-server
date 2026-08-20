import fs from "node:fs";
import pg from "pg";

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "postgres",
  database: process.env.POSTGRES_DATABASE ?? "postgres",
  password: process.env.POSTGRES_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

function parseCopyBlocks(sql) {
  const blocks = [];
  const re =
    /^COPY ([^\s]+) \((.*)\) FROM stdin;\n([\s\S]*?)^\\\.\s*$/gm;
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

const sql = fs.readFileSync(new URL("../replit-backup.sql", import.meta.url), "utf8");
const blocks = parseCopyBlocks(sql);

console.log("Dump COPY tables:", blocks.length);
for (const b of blocks.filter((b) =>
  ["public.users", "public.students", "public.sessions", "public.library"].includes(
    b.table,
  ),
)) {
  console.log(" dump", b.table, b.rows.length, "rows");
}

try {
  const rdsUsers = await pool.query("select count(*)::int as n from users");
  const rdsStudents = await pool.query("select count(*)::int as n from students");
  const login = await pool.query(
    "select email, role, email_verified from users where email = $1",
    ["student@gmail.com"],
  );
  console.log("RDS users", rdsUsers.rows[0].n, "students", rdsStudents.rows[0].n);
  console.log("RDS student@gmail.com", login.rows);

  const dumpUsers = blocks.find((b) => b.table === "public.users");
  const rdsEmails = new Set(
    (await pool.query("select email from users")).rows.map((r) => r.email),
  );
  const dumpEmails = dumpUsers.rows.map((r) => r[1]);
  const missing = dumpEmails.filter((e) => !rdsEmails.has(e));
  const extra = [...rdsEmails].filter((e) => !dumpEmails.includes(e));
  console.log("emails in dump not RDS:", missing);
  console.log("emails in RDS not dump:", extra);

  if (process.argv.includes("--load")) {
    await pool.query("set session_replication_role = replica");
    let inserted = 0;
    let skipped = 0;
    let failed = 0;
    for (const b of blocks) {
      if (!b.rows.length) continue;
      if (b.table.startsWith("stripe.")) continue;
      const colList = b.cols.map((c) => `"${c}"`).join(", ");
      const placeholders = b.cols.map((_, i) => `$${i + 1}`).join(", ");
      const pk = b.cols.includes("id") ? "id" : null;
      const stmt = pk
        ? `insert into ${b.table} (${colList}) values (${placeholders}) on conflict (id) do nothing`
        : `insert into ${b.table} (${colList}) values (${placeholders})`;
      for (const row of b.rows) {
        try {
          const res = await pool.query(stmt, row);
          if (res.rowCount === 0) skipped += 1;
          else inserted += 1;
        } catch (e) {
          failed += 1;
          if (failed <= 8) {
            console.error("FAIL", b.table, e.message.split("\n")[0]);
          }
        }
      }
    }
    console.log("load inserted", inserted, "skipped", skipped, "failed", failed);
    await pool.query("set session_replication_role = origin");
  }
} finally {
  await pool.end();
}
