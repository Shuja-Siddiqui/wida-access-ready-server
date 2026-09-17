import { config } from "../../config";
import { logger } from "../../config/logger";
import { MemoryRateLimitStore } from "./memory-store";
import { PostgresRateLimitStore } from "./postgres-store";
import { RedisRateLimitStore } from "./redis-store";
import type { RateLimitStore } from "./types";

export type { RateLimitResult, RateLimitStore } from "./types";
export { MemoryRateLimitStore } from "./memory-store";
export { PostgresRateLimitStore } from "./postgres-store";
export { RedisRateLimitStore } from "./redis-store";

let store: RateLimitStore | null = null;

export async function getRateLimitStore(): Promise<RateLimitStore> {
  if (store) return store;
  const kind = config.rateLimit.store;
  if (kind === "memory") {
    store = new MemoryRateLimitStore();
    logger.info("Rate limit store: memory (single process)");
    return store;
  }
  if (kind === "redis") {
    const url = config.rateLimit.redisUrl;
    if (!url) {
      logger.warn("RATE_LIMIT_STORE=redis but REDIS_URL is empty; using postgres");
    } else {
      try {
        const mod = (await Function('return import("redis")')()) as {
          createClient: (opts: { url: string }) => {
            connect: () => Promise<void>;
            incr: (key: string) => Promise<number>;
            pExpire: (key: string, ms: number, mode: "NX") => Promise<unknown>;
            pTTL: (key: string) => Promise<number>;
          };
        };
        const client = mod.createClient({ url });
        await client.connect();
        store = new RedisRateLimitStore(client);
        logger.info("Rate limit store: redis");
        return store;
      } catch (err) {
        logger.warn(
          { err },
          "Redis rate-limit store failed (install `redis` and set REDIS_URL). Using postgres.",
        );
      }
    }
  }
  store = new PostgresRateLimitStore();
  logger.info("Rate limit store: postgres (shared across API replicas)");
  return store;
}
