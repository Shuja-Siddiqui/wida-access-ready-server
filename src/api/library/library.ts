import type { IRouter } from "express";
import { createApiRouter } from "../../lib/http/create-api-router";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { libraryTable } from "../../../db/schema";
import { ObjectStorageService } from "../../lib/images/objectStorage";
import { sendError } from "../../lib/http/api-response";
import { requireAuth } from "../../middlewares/auth";

const router: IRouter = createApiRouter();
const storage = new ObjectStorageService();

/** Authenticated proxy for library photos when presigned S3 URLs are unavailable. */
router.get("/library/images/:libraryImageId/file", requireAuth, async (req, res): Promise<void> => {
  const rawId = req.params.libraryImageId;
  const libraryImageId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!libraryImageId) {
    sendError(res, 400, "Missing library image id");
    return;
  }

  const [row] = await db
    .select({
      s3Key:     libraryTable.s3Key,
      mediumKey: libraryTable.mediumKey,
      contentType: libraryTable.contentType,
    })
    .from(libraryTable)
    .where(eq(libraryTable.id, libraryImageId))
    .limit(1);

  if (!row?.s3Key) {
    sendError(res, 404, "Library image not found");
    return;
  }

  try {
    const key = row.mediumKey?.trim() || row.s3Key;
    const { buffer, contentType } = await storage.getImageBuffer(key);
    res.setHeader("Content-Type", contentType || row.contentType || "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(buffer);
  } catch (err) {
    req.log.warn({ err, libraryImageId }, "Failed to stream library image");
    sendError(res, 404, "Library image file not found");
  }
});

export default router;
