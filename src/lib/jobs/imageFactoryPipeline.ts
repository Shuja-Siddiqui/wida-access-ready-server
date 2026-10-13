/**
 * One full Image Factory cycle: prompt → HF/FLUX → DINO → library ingest.
 * Used by the in-process cron and the standalone CLI script.
 */

import type { ImageFactorySubject } from "../../../db/schema/image_generation";
import { logger } from "../../config/logger";
import { getLastImageFactoryAdminUserId } from "../../image-factory/lib/admin-session";
import {
  pickCronBatchTargets,
  pickNextCronImageFactoryPool,
} from "../../image-factory/lib/pool-rotation";
import { buildAndPersistImagePrompt } from "../../image-factory/services/prompt-service";
import { listImageFactoryPools } from "../../image-factory/services/pool-service";
import {
  generateImageAndLinkJob,
  getGenerationBackendStatus,
} from "../../image-factory/services/generation-service";
import {
  detectGeneratedFactoryImage,
  ingestGeneratedFactoryImage,
} from "../../image-factory/services/ingest-service";
import { IMAGE_FACTORY_SUBJECTS } from "../../../db/schema/image_generation";

export interface ImageFactoryCycleOptions {
  /** users.id — required (jobs.created_by is NOT NULL). */
  createdByUserId: string;
  /** Pin subject; omit for cron auto-rotation across all SF. */
  subject?: ImageFactorySubject;
  /** Pin ELP level 1–6; omit to auto-pick sparsest level within subject. */
  level?: number;
  /** Cron: general SF pool (not one KLU). */
  generalPool?: boolean;
  /** Cron: use SF round-robin + batch-all-SF when batchSize >= 4. */
  cronMode?: boolean;
}

export interface ImageFactoryCycleResult {
  jobId: string;
  libraryImageId: string;
  subject: ImageFactorySubject;
  level: number;
  tags: string[];
  generationBackend: "hf-inference" | "flux-sidecar";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Manual / legacy: sparsest pool across all subject × level. */
export async function pickNextImageFactoryPool(
  subjectFilter?: string,
  levelFilter?: number,
): Promise<{ subject: ImageFactorySubject; level: number }> {
  const pools = await listImageFactoryPools();

  let candidates = pools;
  if (subjectFilter && IMAGE_FACTORY_SUBJECTS.includes(subjectFilter as ImageFactorySubject)) {
    candidates = candidates.filter((p) => p.subject === subjectFilter);
  }
  if (levelFilter != null && levelFilter >= 1 && levelFilter <= 6) {
    candidates = candidates.filter((p) => p.level === levelFilter);
  }

  if (candidates.length === 0) {
    throw new Error("No image factory pool matches the configured subject/level filters");
  }

  candidates.sort((a, b) => {
    if (a.libraryImageCount !== b.libraryImageCount) {
      return a.libraryImageCount - b.libraryImageCount;
    }
    const aTime = a.lastGeneratedAt ? Date.parse(a.lastGeneratedAt) : 0;
    const bTime = b.lastGeneratedAt ? Date.parse(b.lastGeneratedAt) : 0;
    return aTime - bTime;
  });

  const pick = candidates[0]!;
  return { subject: pick.subject, level: pick.level };
}

export function resolveImageFactoryCronUserId(): string | null {
  return getLastImageFactoryAdminUserId();
}

/** Run prompt → generate → DINO → ingest once. Throws on failure. */
export async function runImageFactoryCycle(
  options: ImageFactoryCycleOptions,
): Promise<ImageFactoryCycleResult> {
  const backend = await getGenerationBackendStatus();
  if (!backend.activeSource) {
    throw new Error(
      "No image generation backend configured (set HF_TOKEN or run the FLUX sidecar)",
    );
  }

  const generalPool = options.generalPool ?? Boolean(options.cronMode);

  let subject = options.subject;
  let level = options.level;

  if (!subject || level == null) {
    const picked = options.cronMode
      ? await pickNextCronImageFactoryPool(options.subject, options.level)
      : await pickNextImageFactoryPool(options.subject, options.level);
    subject = subject ?? picked.subject;
    level = level ?? picked.level;
  }

  logger.info({ subject, level, generalPool, cronMode: options.cronMode }, "image-factory-cron: starting cycle");

  const prompt = await buildAndPersistImagePrompt({
    subject,
    level,
    createdByUserId: options.createdByUserId,
    generalPool,
  });

  const imageResult = await generateImageAndLinkJob(
    prompt.hfPrompt,
    {},
    prompt.jobId,
  );

  const detect = await detectGeneratedFactoryImage({
    jobId: prompt.jobId,
    image: imageResult.image,
  });

  if (detect.detections.length === 0) {
    throw new Error(
      `DINO found no bounding boxes for job ${prompt.jobId} — skipping ingest`,
    );
  }

  const ingest = await ingestGeneratedFactoryImage({
    jobId: prompt.jobId,
    image: imageResult.image,
    uploaderId: options.createdByUserId,
    detections: detect.detections,
    generationBackend: imageResult.source,
  });

  logger.info(
    {
      jobId: prompt.jobId,
      libraryImageId: ingest.libraryImageId,
      subject,
      level,
      tags: ingest.tags,
      backend: imageResult.source,
    },
    "image-factory-cron: cycle complete",
  );

  return {
    jobId: prompt.jobId,
    libraryImageId: ingest.libraryImageId,
    subject,
    level,
    tags: ingest.tags,
    generationBackend: imageResult.source,
  };
}

export async function runImageFactoryBatch(
  batchSize: number,
  delayBetweenMs: number,
  cycleOptions: ImageFactoryCycleOptions,
): Promise<ImageFactoryCycleResult[]> {
  const results: ImageFactoryCycleResult[] = [];
  const cronMode = cycleOptions.cronMode ?? !cycleOptions.subject;

  const targets =
    cronMode && !cycleOptions.subject
      ? await pickCronBatchTargets(batchSize, undefined, cycleOptions.level)
      : null;

  for (let i = 0; i < batchSize; i++) {
    const target = targets?.[i];
    try {
      const result = await runImageFactoryCycle({
        ...cycleOptions,
        cronMode,
        generalPool: cycleOptions.generalPool ?? cronMode,
        ...(target ? { subject: target.subject, level: target.level } : {}),
      });
      results.push(result);
    } catch (err) {
      logger.error({ err, attempt: i + 1, batchSize, subject: target?.subject }, "image-factory-cron: cycle failed");
    }

    if (i < batchSize - 1 && delayBetweenMs > 0) {
      await sleep(delayBetweenMs);
    }
  }

  return results;
}
