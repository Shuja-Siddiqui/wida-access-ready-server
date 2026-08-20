/**
 * Image Scans API
 *
 * GET  /api/image-scans        — list scans for the authenticated user (newest first)
 * GET  /api/image-scans/:id    — fetch a single scan + a short-lived presigned GET URL
 * DELETE /api/image-scans/:id  — delete scan record + S3 object
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc } from "drizzle-orm";
import { logger } from "../../config/logger";
import { requireAuth } from "../../middlewares/auth";
import { db } from "../../../db";
import { libraryTable } from "../../../db/schema";
import { ObjectStorageService } from "../../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();

// ── GET /api/image-scans ──────────────────────────────────────────────────────

router.get("/image-scans", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string;
    const limit  = Math.min(Number(req.query.limit ?? 50), 100);
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
    const id     = req.params.id as string;
    const userId = (req as any).user?.id as string;

    const [scan] = await db
      .select()
      .from(libraryTable)
      .where(eq(libraryTable.id, id))
      .limit(1);

    if (!scan) {
      res.status(404).json({ error: "Scan not found" });
      return;
    }

    // Only the owner (or unauthenticated scans) can fetch this
    if (scan.uploaderId && scan.uploaderId !== userId) {
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
    const id     = req.params.id as string;
    const userId = (req as any).user?.id as string;

    const [scan] = await db
      .select()
      .from(libraryTable)
      .where(eq(libraryTable.id, id))
      .limit(1);

    if (!scan) {
      res.status(404).json({ error: "Scan not found" });
      return;
    }

    if (scan.uploaderId && scan.uploaderId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Delete from S3 then DB (non-fatal S3 error)
    await storage.deleteObject(scan.s3Key).catch((err: unknown) =>
      logger.warn({ err, key: scan.s3Key }, "image-scans: S3 delete failed, removing DB record anyway")
    );
    await db.delete(libraryTable).where(eq(libraryTable.id, id));

    res.json({ deleted: true });
  } catch (err) {
    logger.error({ err }, "image-scans: delete failed");
    res.status(500).json({ error: "Failed to delete scan" });
  }
});

export default router;
