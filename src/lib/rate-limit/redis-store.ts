import type { RateLimitResult, RateLimitStore } from "./types";

type RedisCmds = {
  incr(key: string): Promise<number>;
  pExpire(key: string, ms: number, mode: "NX"): Promise<unknown>;
  pTTL(key: string): Promise<number>;
};

/**
 * Redis INCR + PEXPIRE. Wire this when RATE_LIMIT_STORE=redis and REDIS_URL is set.
 * Pass any client that implements incr / pExpire / pTTL (node-redis v4, ioredis, etc.).
 */
export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly redis: RedisCmds) {}

  async hit(key: string, windowMs: number, limit: number): Promise<RateLimitResult> {
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.pExpire(key, windowMs, "NX");
    const ttl = await this.redis.pTTL(key);
    const resetAt = Date.now() + (ttl > 0 ? ttl : windowMs);
    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  }
}
