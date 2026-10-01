/**
 * Ownership checks for library rows (image scans / factory ingests).
 */

import { eq } from "drizzle-orm";
import type { Request } from "express";
import { db } from "../../../db";
import { libraryTable } from "../../../db/schema";

export type LibraryScanAccess =
  | { allowed: true }
  | { allowed: false; status: 403 | 404; message: string };

/** Whether the caller may read or mutate a library row identified by scanId. */
export async function assertLibraryScanAccess(
  req: Request,
  scanId: string,
): Promise<LibraryScanAccess> {
  if (req.internalJob) return { allowed: true };

  const auth = req.auth;
  if (!auth) {
    return { allowed: false, status: 403, message: "Forbidden" };
  }

  const [scan] = await db
    .select({ uploaderId: libraryTable.uploaderId })
    .from(libraryTable)
    .where(eq(libraryTable.id, scanId))
    .limit(1);

  if (!scan) {
    return { allowed: false, status: 404, message: "Scan not found" };
  }

  if (auth.role === "super_admin") return { allowed: true };

  if (!scan.uploaderId || scan.uploaderId !== auth.userId) {
    return { allowed: false, status: 403, message: "Forbidden" };
  }

  return { allowed: true };
}
