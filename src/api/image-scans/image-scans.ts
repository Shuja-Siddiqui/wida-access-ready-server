/**
 * Image Scans API
 *
 * GET    /api/image-scans        — list scans for the authenticated user
 * GET    /api/image-scans/:id    — fetch a single scan + presigned URL
 * DELETE /api/image-scans/:id  — delete scan record + S3 object
 */

import type { IRouter, Request, Response } from "express";
import { and, eq, desc } from "drizzle-orm";
import { requireAuth } from "../../middlewares/auth";
import { db } from "../../../db";
import { libraryTable } from "../../../db/schema";
import { ObjectStorageService } from "../../lib/images/objectStorage";
import { createApiRouter, forbidden, notFound, sendSuccess } from "../../lib/http";

const router: IRouter = createApiRouter();
const storage = new ObjectStorageService();

function canAccessScan(req: Request, uploaderId: string | null): boolean {
  const auth = req.auth!;
  if (auth.role === "super_admin") return true;
  return Boolean(uploaderId && uploaderId === auth.userId);
}

router.get("/image-scans", requireAuth, async (req: Request, res: Response) => {
  const userId = req.auth!.userId;
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const offset = Number(req.query.offset ?? 0);

  const rows = await db
    .select()
    .from(libraryTable)
    .where(eq(libraryTable.uploaderId, userId))
    .orderBy(desc(libraryTable.createdAt))
    .limit(limit)
    .offset(offset);

  sendSuccess(res, { scans: rows, limit, offset });
});

router.get("/image-scans/:id", requireAuth, async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const [scan] = await db
    .select()
    .from(libraryTable)
    .where(eq(libraryTable.id, id))
    .limit(1);

  if (!scan) throw notFound("Scan not found");
  if (!canAccessScan(req, scan.uploaderId)) throw forbidden();

  const imageUrl = await storage.getPresignedGetUrl(scan.s3Key, 3600);
  sendSuccess(res, { ...scan, imageUrl });
});

router.delete("/image-scans/:id", requireAuth, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const userId = req.auth!.userId;
  const isSuperAdmin = req.auth!.role === "super_admin";

  const [scan] = await db
    .select()
    .from(libraryTable)
    .where(eq(libraryTable.id, id))
    .limit(1);

  if (!scan) throw notFound("Scan not found");
  if (!canAccessScan(req, scan.uploaderId)) throw forbidden();

  await storage.deleteObject(scan.s3Key).catch((err: unknown) =>
    req.log.warn({ err, key: scan.s3Key }, "image-scans: S3 delete failed, removing DB record anyway"),
  );

  const deleteWhere = isSuperAdmin
    ? eq(libraryTable.id, id)
    : and(eq(libraryTable.id, id), eq(libraryTable.uploaderId, userId));

  await db.delete(libraryTable).where(deleteWhere);
  sendSuccess(res, { deleted: true });
});

export default router;
