/**
 * Internal job authentication — for cron / background workers that call
 * image-factory and DINO endpoints without a user session.
 *
 * Set INTERNAL_JOB_API_KEY in the environment and send it as:
 *   X-Internal-Job-Key: <key>
 */

import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config/index";
import { requireAuth, requireSuperAdmin } from "./auth";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** True when the request was authenticated via X-Internal-Job-Key. */
      internalJob?: boolean;
    }
  }
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Returns true when a valid internal job key was supplied. */
export function isInternalJobRequest(req: Request): boolean {
  const expected = config.internalJob.apiKey;
  if (!expected) return false;

  const header = req.headers["x-internal-job-key"];
  if (typeof header !== "string" || header.length === 0) return false;

  try {
    return safeEqual(header, expected);
  } catch {
    return false;
  }
}

/**
 * Requires a valid session OR a valid internal job key.
 * Sets req.internalJob when the key path is used.
 */
export async function requireAuthOrInternalJob(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (isInternalJobRequest(req)) {
    req.internalJob = true;
    next();
    return;
  }
  await requireAuth(req, res, next);
}

/**
 * Requires super_admin OR a valid internal job key.
 * Used only on image-factory / cron routes — not on the full admin surface.
 */
export async function requireSuperAdminOrInternalJob(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (isInternalJobRequest(req)) {
    req.internalJob = true;
    next();
    return;
  }
  await requireAuth(req, res, () => {
    requireSuperAdmin(req, res, next);
  });
}
