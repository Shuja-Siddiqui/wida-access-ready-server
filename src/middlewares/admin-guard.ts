/**
 * Guards for super-admin API surface — use on every /admin/* router.
 */

import type { NextFunction, Request, Response } from "express";
import { requireAuth, requireSuperAdmin } from "./auth";

/** requireAuth → requireSuperAdmin (403 unless users.role === super_admin). */
export async function requireSuperAdminApi(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await requireAuth(req, res, () => {
    requireSuperAdmin(req, res, next);
  });
}

/** Mount on sub-routers: router.use("/admin", ...requireSuperAdminApiStack); */
export const requireSuperAdminApiStack = [requireSuperAdminApi] as const;
