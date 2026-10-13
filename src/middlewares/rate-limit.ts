import type { NextFunction, Request, Response } from "express";
import { getRateLimitStore } from "../lib/rate-limit";
import { getOrgRateLimitBucket, getRateLimitSettings } from "../lib/rate-limit/settings";
import { recordAiUsage, usageKindFromPath } from "../lib/rate-limit/usage";
import { sendError } from "../lib/http/api-response";

function studentKey(req: Request): string {
  const fromParam = req.params.studentId;
  if (typeof fromParam === "string" && fromParam.length > 0) return fromParam;
  const bodyId =
    req.body && typeof req.body === "object"
      ? (req.body as { studentId?: unknown }).studentId
      : undefined;
  if (typeof bodyId === "string" && bodyId.length > 0) return bodyId;
  if (req.auth?.userType === "student" && req.auth.id) return req.auth.id;
  if (req.auth?.userId) return `user:${req.auth.userId}`;
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return `ip:${ip}`;
}

function setRateLimitHeaders(res: Response, result: {
  limit: number;
  remaining: number;
  resetAt: number;
}): void {
  res.setHeader("X-RateLimit-Limit", String(result.limit));
  res.setHeader("X-RateLimit-Remaining", String(result.remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
}

function reject(req: Request, res: Response, result: { resetAt: number }, reason: string): void {
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  res.setHeader("Retry-After", String(retryAfter));
  req.log?.warn({ retryAfter, reason }, "AI rate limit exceeded");
  sendError(res, 429, "Too many practice requests. Wait a minute and try again.", {
    retryAfterSeconds: retryAfter,
  });
}

/**
 * Caps expensive AI / speech calls.
 * 1) Every student is capped at the admin per-student number.
 * 2) School/district total is that number × registered students — still cannot
 *    exceed the per-student cap for any one user.
 */
export function rateLimitStudentAi() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const settings = await getRateLimitSettings();
      const id = studentKey(req);
      const kind = usageKindFromPath(req.path || req.originalUrl || "");
      if (!settings.enabled) {
        recordAiUsage(id, kind);
        next();
        return;
      }
      const store = await getRateLimitStore();
      const perUser = await store.hit(
        `ai:${id}`,
        settings.windowMs,
        settings.aiMaxPerStudent,
      );
      setRateLimitHeaders(res, perUser);
      if (!perUser.allowed) {
        reject(req, res, perUser, "per-student");
        return;
      }

      const org = await getOrgRateLimitBucket(id, settings.aiMaxPerStudent);
      if (org) {
        const orgHit = await store.hit(`ai:${org.key}`, settings.windowMs, org.limit);
        res.setHeader("X-RateLimit-Org-Limit", String(org.limit));
        res.setHeader("X-RateLimit-Org-Remaining", String(orgHit.remaining));
        if (!orgHit.allowed) {
          reject(req, res, orgHit, "org-pool");
          return;
        }
      }
      recordAiUsage(id, kind);
      next();
    } catch (err) {
      req.log?.error({ err }, "Rate limit store failed; allowing request");
      next();
    }
  };
}
