/**
 * IP-based rate limits for auth, contact, and expensive image endpoints.
 * Internal job requests (cron) bypass these limits.
 */

import type { NextFunction, Request, Response } from "express";
import { config } from "../config/index";
import { getRateLimitStore } from "../lib/rate-limit";
import { sendError } from "../lib/http/api-response";

function clientKey(req: Request): string {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return ip;
}

function onStoreError(req: Request, res: Response, next: NextFunction, err: unknown): void {
  req.log?.error({ err }, "Rate limit store failed");
  if (config.rateLimit.failClosed) {
    sendError(res, 503, "Service temporarily unavailable");
    return;
  }
  next();
}

function rateLimitByIp(prefix: string, max: number, windowMs: number) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.internalJob) {
      next();
      return;
    }

    try {
      const store = await getRateLimitStore();
      const result = await store.hit(`${prefix}:${clientKey(req)}`, windowMs, max);
      if (!result.allowed) {
        const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
        res.setHeader("Retry-After", String(retryAfter));
        sendError(res, 429, "Too many requests. Please try again later.", {
          retryAfterSeconds: retryAfter,
        });
        return;
      }
      next();
    } catch (err) {
      onStoreError(req, res, next, err);
    }
  };
}

/** Login, register, password-reset abuse protection. */
export function rateLimitAuth() {
  return rateLimitByIp("auth", config.rateLimit.authMax, config.rateLimit.authWindowMs);
}

/** Contact form spam protection. */
export function rateLimitContact() {
  return rateLimitByIp("contact", config.rateLimit.contactMax, config.rateLimit.contactWindowMs);
}

/** DINO / vision scan endpoints — separate from student AI quota. */
export function rateLimitExpensiveImage() {
  return rateLimitByIp("imgops", config.rateLimit.imageOpsMax, config.rateLimit.imageOpsWindowMs);
}
