/**
 * POST /api/images/detect
 *
 * Accepts a base64 image data-URI and an array of text labels.
 * Runs Grounding DINO zero-shot object detection via the Python sidecar.
 */

import type { IRouter } from "express";
import { eq } from "drizzle-orm";
import { runDetection } from "./detect-core";
import { db } from "../../../db";
import { libraryTable } from "../../../db/schema";
import { requireAuthOrInternalJob } from "../../middlewares/internal-job";
import { rateLimitExpensiveImage } from "../../middlewares/rate-limit-public";
import { assertLibraryScanAccess } from "../../lib/images/library-access";
import { badRequest, createApiRouter, sendSuccess, upstreamError } from "../../lib/http";

const router: IRouter = createApiRouter();

router.post(
  "/images/detect",
  requireAuthOrInternalJob,
  rateLimitExpensiveImage(),
  async (req, res) => {
    const { image, labels, scan_id } = req.body as {
      image?: string;
      labels?: string[];
      scan_id?: string;
    };

    if (!image || !Array.isArray(labels) || labels.length === 0) {
      throw badRequest("image (base64 data URI) and labels[] are required");
    }
    if (!image.startsWith("data:image/")) {
      throw badRequest("image must be a base64 data URI (data:image/<type>;base64,...)");
    }

    try {
      const { detections, model } = await runDetection(image, labels);
      req.log.info({ labels, found: detections.map((d) => d.label), model }, "detect: done");

      if (scan_id) {
        const access = await assertLibraryScanAccess(req, scan_id);
        if (access.allowed) {
          await db
            .update(libraryTable)
            .set({ detectionResults: { detections, model } as Record<string, unknown> })
            .where(eq(libraryTable.id, scan_id));
        } else {
          req.log.warn({ scan_id, status: access.status }, "detect: scan_id persist denied");
        }
      }

      sendSuccess(res, { detections, model });
    } catch (err) {
      req.log.error({ err }, "detect: inference failed");
      throw upstreamError("Detection failed");
    }
  },
);

export default router;
