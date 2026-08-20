/**
 * POST /api/images/detect
 *
 * Accepts a base64 image data-URI and an array of text labels.
 * Runs Grounding DINO zero-shot object detection via the Python sidecar.
 *
 * Body:  { image: string, labels: string[], scan_id?: string }
 * Reply: { detections: Array<{ label, score, box: { x, y, width, height } }>, model }
 *
 * If scan_id is provided the detection results are persisted on the
 * matching image_scans row (non-fatal if it fails).
 */

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { logger } from "../../config/logger";
import { runDetection } from "./detect-core";
import { db } from "../../../db";
import { libraryTable } from "../../../db/schema";

const router: IRouter = Router();

router.post("/images/detect", async (req, res) => {
  const { image, labels, scan_id } = req.body as {
    image?:   string;
    labels?:  string[];
    scan_id?: string;
  };

  if (!image || !Array.isArray(labels) || labels.length === 0) {
    res.status(400).json({ error: "image (base64 data URI) and labels[] are required" });
    return;
  }
  if (!image.startsWith("data:image/")) {
    res.status(400).json({ error: "image must be a base64 data URI (data:image/<type>;base64,...)" });
    return;
  }

  try {
    const { detections, model } = await runDetection(image, labels);
    logger.info({ labels, found: detections.map((d) => d.label), model }, "detect: done");

    // Persist detection results on the scan row (non-fatal)
    if (scan_id) {
      db.update(libraryTable)
        .set({ detectionResults: { detections, model } as Record<string, unknown> })
        .where(eq(libraryTable.id, scan_id))
        .catch((err: unknown) => logger.error({ err, scan_id }, "detect: failed to update scan"));
    }

    res.json({ detections, model });
  } catch (err) {
    logger.error({ err }, "detect: inference failed");
    res.status(502).json({ error: "Detection failed", details: String(err) });
  }
});

export default router;
