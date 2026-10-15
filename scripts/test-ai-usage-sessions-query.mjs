/**
 * Reproduce GET /admin/ai-usage/sessions aggregate query (same DB pool as running API).
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(apiRoot, ".env") });

const dbTarget =
  process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL
    ? "DATABASE_URL / LOCAL_DATABASE_URL (dev pool)"
    : "POSTGRES_* (RDS pool)";

console.log("API would use:", dbTarget);

const { db, aiTokenCallsTable, sessionsTable } = await import("../db/index.ts");
const { and, desc, eq, isNotNull, sql } = await import("drizzle-orm");

try {
  const limit = 25;
  const where = and(isNotNull(aiTokenCallsTable.sessionId));

  const aggRows = await db
    .select({
      sessionId: aiTokenCallsTable.sessionId,
      studentId: sql`max(${sessionsTable.studentId}::text)::uuid`,
      callCount: sql`count(*)::int`,
      inputTokens: sql`coalesce(sum(${aiTokenCallsTable.inputTokens}), 0)::int`,
      outputTokens: sql`coalesce(sum(${aiTokenCallsTable.outputTokens}), 0)::int`,
      totalTokens: sql`coalesce(sum(${aiTokenCallsTable.totalTokens}), 0)::int`,
      lastCallAt: sql`max(${aiTokenCallsTable.createdAt})`,
    })
    .from(aiTokenCallsTable)
    .innerJoin(sessionsTable, eq(aiTokenCallsTable.sessionId, sessionsTable.id))
    .where(where)
    .groupBy(aiTokenCallsTable.sessionId)
    .orderBy(desc(sql`max(${aiTokenCallsTable.createdAt})`))
    .limit(limit);

  console.log("OK — rows:", aggRows.length);
  if (aggRows[0]) console.log("Sample:", aggRows[0]);
} catch (err) {
  console.error("FAILED:");
  console.error(err);
  process.exitCode = 1;
}

process.exit(process.exitCode ?? 0);
