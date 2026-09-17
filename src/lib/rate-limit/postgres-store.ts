import { pool } from "../../../db";
import type { RateLimitResult, RateLimitStore } from "./types";

let tableReady: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = pool
      .query(`
        CREATE TABLE IF NOT EXISTS rate_limit_buckets (
          bucket_key TEXT PRIMARY KEY,
          window_start BIGINT NOT NULL,
          hit_count INTEGER NOT NULL
        )
      `)
      .then(() => undefined);
  }
  return tableReady;
}

/**
 * Shared across every API process that uses the same database.
 * Default store — scales to multiple EC2/API replicas without Redis.
 */
export class PostgresRateLimitStore implements RateLimitStore {
  async hit(key: string, windowMs: number, limit: number): Promise<RateLimitResult> {
    await ensureTable();
    const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
    const result = await pool.query<{ hit_count: number; window_start: string }>(
      `INSERT INTO rate_limit_buckets (bucket_key, window_start, hit_count)
       VALUES ($1, $2, 1)
       ON CONFLICT (bucket_key) DO UPDATE SET
         hit_count = CASE
           WHEN rate_limit_buckets.window_start = EXCLUDED.window_start
           THEN rate_limit_buckets.hit_count + 1
           ELSE 1
         END,
         window_start = EXCLUDED.window_start
       RETURNING hit_count, window_start`,
      [key, windowStart],
    );
    const count = Number(result.rows[0]?.hit_count ?? 1);
    if (Math.random() < 0.01) {
      void pool.query("DELETE FROM rate_limit_buckets WHERE window_start < $1", [
        windowStart - windowMs,
      ]);
    }
    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetAt: windowStart + windowMs,
    };
  }
}
