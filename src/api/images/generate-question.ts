/**
 * POST /api/images/generate-object-question
 *
 * Detect-first flow — guarantees the question is always about something
 * Grounding DINO can actually find in the image:
 *
 *   Step 1 — Vision call    : image → candidate noun list        ┐
 *   Step 2 — Grounding DINO : run detection on ALL candidates    ├─ runImagePipeline()
 *   Step 3 — Filter         : keep only labels with ≥ 1 hit      ┘
 *   Step 4 — Main pipeline  : callClaude() generates question from confirmed labels
 *
 * Side-effect: uploads the image to S3 and inserts a library row.
 * The returned `scan_id` should be forwarded to POST /api/images/detect
 * so detection results are persisted on the same row.
 *
 * Body:  { image: string }   — base64 data URI (jpeg / png / webp)
 * Reply: { questions, scan_id, _debug }
 */

import { Router, type IRouter, type Request } from "express";
import { logger } from "../../config/logger";
import { generateObjectDetectContent } from "../../lib/claude";
import { ObjectStorageService } from "../../lib/images/objectStorage";
import { runImagePipeline, type SupportedMediaType } from "../../lib/images/image-pipeline";
import { db } from "../../../db";
import { libraryTable } from "../../../db/schema";
import { optionalAuth } from "../../middlewares/auth";
import { rateLimitStudentAi } from "../../middlewares/rate-limit";

const router: IRouter = Router();
const storage = new ObjectStorageService();

// ── Helper: upload image to S3 + insert library row ──────────────────────────

async function persistScan({
  base64Data,
  mediaType,
  tags,
  description,
  detectionResults,
  uploaderId,
}: {
  base64Data:       string;
  mediaType:        string;
  tags:             string[];
  description:      string;
  detectionResults: Record<string, unknown>;
  uploaderId?:      string;
}): Promise<string> {
  const buffer = Buffer.from(base64Data, "base64");
  const { key, sizeBytes } = await storage.uploadBuffer(buffer, mediaType, "access-ready-files/library");

  const [row] = await db.insert(libraryTable).values({
    s3Key:            key,
    contentType:      mediaType,
    sizeBytes,
    tags,
    description,
    detectionResults,
    uploaderId:       uploaderId ?? null,
  }).returning({ id: libraryTable.id });

  return row.id;
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post("/images/generate-object-question", optionalAuth, rateLimitStudentAi(), async (req: Request, res) => {
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

    // ── Steps 1 & 2: Claude vision + Grounding DINO (shared pipeline) ─────────
    const { candidates, confirmedTags, description, detectionResults } =
      await runImagePipeline(image, base64Data, mediaType);

    if (candidates.length === 0) {
      res.status(422).json({ error: "Could not identify any objects in this image" });
      return;
    }

    const labelsForQuestion = confirmedTags.length >= 2 ? confirmedTags : candidates;
    logger.info({ candidates, confirmedTags, model: detectionResults.model },
      "generate-object-question: pipeline done");

    // ── Step 3: generate 2 questions + persist scan in parallel ───────────────
    const targets = labelsForQuestion.length >= 2
      ? [labelsForQuestion[0]!, labelsForQuestion[1]!]
      : [labelsForQuestion[0]!, labelsForQuestion[0]!];

    const uploaderId = (req as any).auth?.userId as string | undefined;

    const [q1, q2, scanId] = await Promise.all([
      generateObjectDetectContent(description, targets[0]),
      generateObjectDetectContent(description, targets[1]),
      persistScan({
        base64Data, mediaType, tags: confirmedTags, description,
        detectionResults: detectionResults as Record<string, unknown>,
        uploaderId,
      }).catch((err) => {
        logger.error({ err }, "generate-object-question: failed to persist scan");
        return null;
      }),
    ]);

    res.json({
      questions:      [q1, q2],
      scan_id:        scanId,
      allDetections:  detectionResults.detections,
    });
  } catch (err) {
    logger.error({ err }, "generate-object-question failed");
    res.status(500).json({ error: "Could not generate question from image" });
  }
});

export default router;
