/**
 * Tracks the most recent super_admin who used Image Factory.
 * Cron and internal-job calls attribute uploads to that user.
 */

import type { Request } from "express";

let lastSuperAdminUserId: string | null = null;
/** First super_admin factory visit after boot — retry cron if startup tick skipped. */
let cronKickPending = true;

/** Call after auth — records super_admin userId from the logged-in session. */
export function recordImageFactoryAdmin(req: Request): void {
  if (req.auth?.role === "super_admin" && req.auth.userId) {
    lastSuperAdminUserId = req.auth.userId;
    if (cronKickPending) {
      cronKickPending = false;
      void import("../../lib/jobs/imageFactoryCron")
        .then(({ runImageFactoryCronTick }) => runImageFactoryCronTick())
        .catch(() => undefined);
    }
  }
}

/** Last super_admin who opened or used Image Factory since server boot. */
export function getLastImageFactoryAdminUserId(): string | null {
  return lastSuperAdminUserId;
}

/**
 * Resolve users.id for factory create/ingest:
 * - Logged-in super_admin → their userId
 * - Internal job / cron → last logged-in super_admin (if any)
 */
export function resolveImageFactoryActorUserId(req: Request): string | null {
  if (req.auth?.role === "super_admin" && req.auth.userId) {
    return req.auth.userId;
  }
  if (req.internalJob) {
    return lastSuperAdminUserId;
  }
  return null;
}
