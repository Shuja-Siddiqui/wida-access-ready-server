import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, count } from "drizzle-orm";
import { db } from "../../../db";
import { mediaAssetsTable } from "../../../db/schema";
import { requireAuth } from "../../middlewares/auth";
import { sendError, sendSuccess } from "../../lib/http/api-response";
import { ObjectStorageService } from "../../lib/images/objectStorage";
import { z } from "zod/v4";

const router: IRouter = Router();
const storageService = new ObjectStorageService();

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const CreateMediaAssetBody = z.object({
  name:        z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  s3Key:       z.string().min(1),
  contentType: z.string().min(1),
  size:        z.number().int().positive().optional(),
  metadata:    z.record(z.string(), z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// POST /media
// Register a new asset in the library AFTER the client has uploaded it
// directly to S3 via the presigned PUT URL.
// ---------------------------------------------------------------------------

router.post("/media", requireAuth, async (req: Request, res: Response) => {
  const parsed = CreateMediaAssetBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Invalid request body");
    return;
  }

  try {
    const [asset] = await db
      .insert(mediaAssetsTable)
      .values({
        ...parsed.data,
        uploadedBy: req.auth!.userId,
      })
      .returning();

    sendSuccess(res, asset);
  } catch (err) {
    req.log.error({ err }, "Error registering media asset");
    sendError(res, 500, "Failed to register media asset");
  }
});

// ---------------------------------------------------------------------------
// GET /media
// List the caller's media assets (paginated).
// ---------------------------------------------------------------------------

router.get("/media", requireAuth, async (req: Request, res: Response) => {
  const page  = Math.max(1, Number(req.query.page)  || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  try {
    const [assets, [{ total }]] = await Promise.all([
      db
        .select()
        .from(mediaAssetsTable)
        .where(eq(mediaAssetsTable.uploadedBy, req.auth!.userId))
        .orderBy(desc(mediaAssetsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(mediaAssetsTable)
        .where(eq(mediaAssetsTable.uploadedBy, req.auth!.userId)),
    ]);

    sendSuccess(res, {
      assets,
      pagination: {
        page,
        limit,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limit),
      },
    });
  } catch (err) {
    req.log.error({ err }, "Error listing media assets");
    sendError(res, 500, "Failed to list media assets");
  }
});

// ---------------------------------------------------------------------------
// GET /media/:id
// Fetch a single asset and return it together with a short-lived presigned
// GET URL so the frontend can display or download the file directly from S3.
// ---------------------------------------------------------------------------

router.get("/media/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const [asset] = await db
      .select()
      .from(mediaAssetsTable)
      .where(eq(mediaAssetsTable.id, id));

    if (!asset) {
      sendError(res, 404, "Media asset not found");
      return;
    }

    const presignedUrl = await storageService.getPresignedGetUrl(asset.s3Key);

    sendSuccess(res, { ...asset, presignedUrl });
  } catch (err) {
    req.log.error({ err }, "Error fetching media asset");
    sendError(res, 500, "Failed to fetch media asset");
  }
});

// ---------------------------------------------------------------------------
// DELETE /media/:id
// Remove the DB record. The S3 object is left in place — delete it manually
// from the AWS console or add a lifecycle rule if you need automatic cleanup.
// ---------------------------------------------------------------------------

router.delete("/media/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const [deleted] = await db
      .delete(mediaAssetsTable)
      .where(eq(mediaAssetsTable.id, String(req.params.id)))
      .returning();

    if (!deleted) {
      sendError(res, 404, "Media asset not found");
      return;
    }

    sendSuccess(res, { ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting media asset");
    sendError(res, 500, "Failed to delete media asset");
  }
});

export default router;
