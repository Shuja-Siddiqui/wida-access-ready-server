/**
 * POST /api/images/generate-object-question
 *
 * Detect-first flow — guarantees the question is about objects DINO can find.
 */

import type { IRouter, Request } from "express";
import { generateObjectDetectContent } from "../../lib/claude";
import { ObjectStorageService } from "../../lib/images/objectStorage";
import { runImagePipeline, type SupportedMediaType } from "../../lib/images/image-pipeline";
import { db } from "../../../db";
import { libraryTable } from "../../../db/schema";
import { requireAuthOrInternalJob } from "../../middlewares/internal-job";
import { rateLimitStudentAi } from "../../middlewares/rate-limit";
import { rateLimitExpensiveImage } from "../../middlewares/rate-limit-public";
import {
  badRequest,
  createApiRouter,
  sendSuccess,
  unprocessable,
  upstreamError,
} from "../../lib/http";
import { isClaudeCapacityError } from "../../lib/claude/queue";

const router: IRouter = createApiRouter();
const storage = new ObjectStorageService();

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

router.post(
  "/images/generate-object-question",
  requireAuthOrInternalJob,
  rateLimitExpensiveImage(),
  rateLimitStudentAi(),
  async (req: Request, res) => {
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
      const { candidates, confirmedTags, description, detectionResults } =
        await runImagePipeline(image, base64Data, mediaType);

      if (candidates.length === 0) {
        throw unprocessable("Could not identify any objects in this image");
      }

      const labelsForQuestion = confirmedTags.length >= 2 ? confirmedTags : candidates;
      req.log.info({ candidates, confirmedTags, model: detectionResults.model },
        "generate-object-question: pipeline done");

      const targets = labelsForQuestion.length >= 2
        ? [labelsForQuestion[0]!, labelsForQuestion[1]!]
        : [labelsForQuestion[0]!, labelsForQuestion[0]!];

      const uploaderId = req.auth?.userId;

      const [q1, q2, scanId] = await Promise.all([
        generateObjectDetectContent(description, targets[0]),
        generateObjectDetectContent(description, targets[1]),
        persistScan({
          base64Data, mediaType, tags: confirmedTags, description,
          detectionResults: detectionResults as Record<string, unknown>,
          uploaderId,
        }).catch((err) => {
          req.log.error({ err }, "generate-object-question: failed to persist scan");
          return null;
        }),
      ]);

      sendSuccess(res, {
        questions:      [q1, q2],
        scan_id:        scanId,
        allDetections:  detectionResults.detections,
      });
    } catch (err) {
      if (isClaudeCapacityError(err)) throw err;
      req.log.error({ err }, "generate-object-question failed");
      throw upstreamError("Could not generate question from image");
    }
  },
);

export default router;
