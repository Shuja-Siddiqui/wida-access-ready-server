/**
 * POST /api/images/scan
 *
 * Lightweight detection-only endpoint — no question generation, no S3 upload.
 */

import type { IRouter } from "express";
import { runImagePipeline, type SupportedMediaType } from "../../lib/images/image-pipeline";
import { requireAuthOrInternalJob } from "../../middlewares/internal-job";
import { rateLimitExpensiveImage } from "../../middlewares/rate-limit-public";
import { badRequest, createApiRouter, sendSuccess, upstreamError } from "../../lib/http";

const router: IRouter = createApiRouter();

router.post(
  "/images/scan",
  requireAuthOrInternalJob,
  rateLimitExpensiveImage(),
  async (req, res) => {
    const { image } = req.body as { image?: string };

    if (!image || !image.startsWith("data:image/")) {
      throw badRequest("image must be a base64 data URI");
    }

    const [header, base64Data] = image.split(",");
    const mediaType = (header.match(/data:(image\/[^;]+);/) ?? [])[1] as SupportedMediaType | undefined;

    if (!mediaType || !base64Data) {
      throw badRequest("Could not parse image data URI");
    }

    try {
      const { candidates, confirmedTags, detectionResults } =
        await runImagePipeline(image, base64Data, mediaType);

      req.log.info(
        {
          candidates: candidates.length,
          confirmed: confirmedTags.length,
          detections: detectionResults.detections.length,
        },
        "scan: done",
      );

      sendSuccess(res, {
        candidates,
        confirmedTags,
        detections: detectionResults.detections,
        model: detectionResults.model,
      });
    } catch (err) {
      req.log.error({ err }, "scan failed");
      throw upstreamError("Scan failed");
    }
  },
);

export default router;
