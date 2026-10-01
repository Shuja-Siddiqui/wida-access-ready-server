/**
 * Image Scans API
 *
 * GET  /api/image-scans        — list scans for the authenticated user (newest first)
 * GET  /api/image-scans/:id    — fetch a single scan + a short-lived presigned GET URL
 * DELETE /api/image-scans/:id  — delete scan record + S3 object
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, desc } from "drizzle-orm";
import { logger } from "../../config/logger";
import { requireAuth } from "../../middlewares/auth";
import { db } from "../../../db";
import { libraryTable } from "../../../db/schema";
import { ObjectStorageService } from "../../lib/images/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();

function canAccessScan(
  req: Request,
  uploaderId: string | null,
): boolean {
  const auth = req.auth!;
  if (auth.role === "super_admin") return true;
  return Boolean(uploaderId && uploaderId === auth.userId);
}

// ── GET /api/image-scans ──────────────────────────────────────────────────────

router.get("/image-scans", requireAuth, async (req: Request, res: Response) => {
  try {
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

    res.json({ scans: rows, limit, offset });
  } catch (err) {
    logger.error({ err }, "image-scans: list failed");
    res.status(500).json({ error: "Failed to fetch scans" });
  }
});

// ── GET /api/image-scans/:id ──────────────────────────────────────────────────

router.get("/image-scans/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const [scan] = await db
      .select()
      .from(libraryTable)
      .where(eq(libraryTable.id, id))
      .limit(1);

    if (!scan) {
      res.status(404).json({ error: "Scan not found" });
      return;
    }

    if (!canAccessScan(req, scan.uploaderId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const imageUrl = await storage.getPresignedGetUrl(scan.s3Key, 3600);

    res.json({ ...scan, imageUrl });
  } catch (err) {
    logger.error({ err }, "image-scans: fetch failed");
    res.status(500).json({ error: "Failed to fetch scan" });
  }
});

// ── DELETE /api/image-scans/:id ───────────────────────────────────────────────

router.delete("/image-scans/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = req.auth!.userId;
    const isSuperAdmin = req.auth!.role === "super_admin";

    const [scan] = await db
      .select()
      .from(libraryTable)
      .where(eq(libraryTable.id, id))
      .limit(1);

    if (!scan) {
      res.status(404).json({ error: "Scan not found" });
      return;
    }

    if (!canAccessScan(req, scan.uploaderId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await storage.deleteObject(scan.s3Key).catch((err: unknown) =>
      logger.warn({ err, key: scan.s3Key }, "image-scans: S3 delete failed, removing DB record anyway"),
    );

    const deleteWhere = isSuperAdmin
      ? eq(libraryTable.id, id)
      : and(eq(libraryTable.id, id), eq(libraryTable.uploaderId, userId));

    await db.delete(libraryTable).where(deleteWhere);

    res.json({ deleted: true });
  } catch (err) {
    logger.error({ err }, "image-scans: delete failed");
    res.status(500).json({ error: "Failed to delete scan" });
  }
});

export default router;
