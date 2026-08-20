/**
 * POST /api/images/scan
 *
 * Lightweight detection-only endpoint — no question generation, no S3 upload.
 * Runs the full Claude vision → Grounding DINO → Claude fallback pipeline and
 * returns all detected boxes with source tags.
 *
 * Body:  { image: string }   — base64 data URI
 * Reply: { candidates, detections, model }
 */

import { Router, type IRouter } from "express";
import { logger } from "../../config/logger";
import { runImagePipeline, type SupportedMediaType } from "../../lib/image-pipeline";

const router: IRouter = Router();

router.post("/images/scan", async (req, res) => {
  try {
    const { image } = req.body as { image?: string };

    if (!image || !image.startsWith("data:image/")) {
      res.status(400).json({ error: "image must be a base64 data URI" });
      return;
    }

    const [header, base64Data] = image.split(",");
    const mediaType = (header.match(/data:(image\/[^;]+);/) ?? [])[1] as SupportedMediaType | undefined;

    if (!mediaType || !base64Data) {
      res.status(400).json({ error: "Could not parse image data URI" });
      return;
    }

    const { candidates, confirmedTags, detectionResults } =
      await runImagePipeline(image, base64Data, mediaType);

    logger.info(
      { candidates: candidates.length, confirmed: confirmedTags.length, detections: detectionResults.detections.length },
      "scan: done",
    );

    res.json({
      candidates,
      confirmedTags,
      detections: detectionResults.detections,
      model:      detectionResults.model,
    });
  } catch (err) {
    logger.error({ err }, "scan failed");
    res.status(500).json({ error: "Scan failed" });
  }
});

export default router;
