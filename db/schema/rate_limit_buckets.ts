import { pgTable, text, bigint, integer } from "drizzle-orm/pg-core";

/** Per-key sliding-window counters for shared API rate limiting (see postgres-store.ts). */
export const rateLimitBucketsTable = pgTable("rate_limit_buckets", {
  bucketKey:   text("bucket_key").primaryKey(),
  windowStart: bigint("window_start", { mode: "number" }).notNull(),
  hitCount:    integer("hit_count").notNull(),
});

export type RateLimitBucket = typeof rateLimitBucketsTable.$inferSelect;
