/**
 * Image Factory HTTP routes — super-admin or internal cron job key.
 */

import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import type { Request } from "express";
import { sendError, sendSuccess } from "../../lib/http/api-response";
import { requireSuperAdminOrInternalJob } from "../../middlewares/internal-job";
import { recordImageFactoryAdmin } from "../lib/admin-session";
import { requireImageFactoryActorUserId } from "../lib/resolve-actor";
import { isClaudeCapacityError } from "../../lib/claude/queue";
import { IMAGE_FACTORY_SUBJECTS } from "../../../db/schema/image_generation";
import { LIBRARY_GENERATION_BACKENDS } from "../../../db/schema/library";
import {
  expressiveKeyUsesForImagePool,
  imageFactoryAcademicSubject,
} from "../standards/2020";
import { buildAndPersistImagePrompt } from "../services/prompt-service";
import { listImageFactoryPools } from "../services/pool-service";
import {
  generateImageAndLinkJob,
  getGenerationBackendStatus,
} from "../services/generation-service";
import type { NormalisedDetection } from "../../api/images/detect-core";
import {
  detectGeneratedFactoryImage,
  ingestGeneratedFactoryImage,
} from "../services/ingest-service";

const router: IRouter = Router();

router.use(requireSuperAdminOrInternalJob);
router.use((req, _res, next) => {
  recordImageFactoryAdmin(req);
  next();
});

const generatePromptSchema = z.object({
  subject: z.enum(IMAGE_FACTORY_SUBJECTS),
  level: z.number().int().min(1).max(6),
  keyUse: z.enum(["Narrate", "Inform", "Explain", "Argue"]).optional(),
  complexityOverride: z.number().int().min(0).max(4).optional(),
});

const generateImageSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  width: z.number().int().min(64).max(2048).optional(),
  height: z.number().int().min(64).max(2048).optional(),
  seed: z.number().int().optional(),
  numInferenceSteps: z.number().int().min(1).max(30).optional(),
  jobId: z.string().uuid().optional(),
});

router.get("/admin/images/pools", async (_req, res) => {
  try {
    const pools = await listImageFactoryPools();
    sendSuccess(res, { pools });
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Failed to list pools");
  }
});

const keyUsesQuerySchema = z.object({
  subject: z.enum(IMAGE_FACTORY_SUBJECTS),
});

/** Expressive key language uses allowed for a pool subject (2020 Table 3-11). */
router.get("/admin/images/key-uses", (req, res) => {
  const parsed = keyUsesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendError(res, 400, "Invalid subject", parsed.error.flatten());
    return;
  }
  const academic = imageFactoryAcademicSubject(parsed.data.subject);
  sendSuccess(res, {
    subject: parsed.data.subject,
    keyUses: expressiveKeyUsesForImagePool(academic),
  });
});

router.post("/admin/images/generate-prompt", async (req: Request, res) => {
  const parsed = generatePromptSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Invalid request body", parsed.error.flatten());
    return;
  }

  const userId = requireImageFactoryActorUserId(req, res);
  if (!userId) return;

  try {
    const result = await buildAndPersistImagePrompt({
      ...parsed.data,
      createdByUserId: userId,
    });
    sendSuccess(res, result);
  } catch (err) {
    if (isClaudeCapacityError(err)) {
      sendError(res, 503, err.message, { retryAfterSeconds: err.retryAfterSeconds });
      return;
    }
    sendError(res, 502, err instanceof Error ? err.message : "Prompt generation failed");
  }
});

router.get("/admin/images/generate-status", async (_req, res) => {
  const status = await getGenerationBackendStatus();
  sendSuccess(res, status);
});

const factoryImageBodySchema = z.object({
  jobId: z.string().uuid(),
  image: z.string().min(10),
});

const DetectionBoxSchema = z.object({
  label: z.string().min(1),
  score: z.number(),
  box: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  points: z.array(z.tuple([z.number(), z.number()])).optional(),
  source: z.string().optional(),
});

const ingestGeneratedSchema = factoryImageBodySchema.extend({
  detections: z.array(DetectionBoxSchema).optional(),
  generationBackend: z.enum(LIBRARY_GENERATION_BACKENDS).optional(),
});

router.post("/admin/images/detect-generated", async (req: Request, res) => {
  const parsed = factoryImageBodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Invalid request body", parsed.error.flatten());
    return;
  }

  try {
    const result = await detectGeneratedFactoryImage(parsed.data);
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, 502, err instanceof Error ? err.message : "Detection failed");
  }
});

router.post("/admin/images/ingest-generated", async (req: Request, res) => {
  const parsed = ingestGeneratedSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Invalid request body", parsed.error.flatten());
    return;
  }

  const uploaderId = requireImageFactoryActorUserId(req, res);
  if (!uploaderId) return;

  try {
    const result = await ingestGeneratedFactoryImage({
      jobId: parsed.data.jobId,
      image: parsed.data.image,
      uploaderId,
      detections: parsed.data.detections as NormalisedDetection[] | undefined,
      generationBackend: parsed.data.generationBackend,
    });
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, 502, err instanceof Error ? err.message : "Ingest failed");
  }
});

router.post("/admin/images/generate-from-prompt", async (req, res) => {
  const parsed = generateImageSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Invalid request body", parsed.error.flatten());
    return;
  }

  try {
    const result = await generateImageAndLinkJob(
      parsed.data.prompt,
      {
        width: parsed.data.width,
        height: parsed.data.height,
        seed: parsed.data.seed,
        numInferenceSteps: parsed.data.numInferenceSteps,
      },
      parsed.data.jobId,
    );
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, 502, err instanceof Error ? err.message : "Image generation failed");
  }
});

export default router;
