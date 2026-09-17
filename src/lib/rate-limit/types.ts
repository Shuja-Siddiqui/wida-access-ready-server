export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export interface RateLimitStore {
  hit(key: string, windowMs: number, limit: number): Promise<RateLimitResult>;
}
