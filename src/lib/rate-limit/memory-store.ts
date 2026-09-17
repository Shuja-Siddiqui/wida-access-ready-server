import type { RateLimitResult, RateLimitStore } from "./types";

type Bucket = { windowStart: number; count: number };

/** Single-process store. Fine for one API box; not shared across replicas. */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();

  async hit(key: string, windowMs: number, limit: number): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const current = this.buckets.get(key);
    const count =
      current && current.windowStart === windowStart ? current.count + 1 : 1;
    this.buckets.set(key, { windowStart, count });
    if (this.buckets.size > 20_000) this.prune(windowStart);
    const resetAt = windowStart + windowMs;
    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  }

  private prune(activeWindowStart: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.windowStart < activeWindowStart) this.buckets.delete(key);
    }
  }
}
