/**
 * Scheduled Image Factory worker — continuously fills library pools when enabled.
 *
 * Set IMAGE_FACTORY_CRON_ENABLED=true in .env to start on server boot.
 * Attributes uploads to the last super_admin who used Image Factory (logged-in session).
 */

import cron from "node-cron";
import { config } from "../../config/index";
import { logger } from "../../config/logger";
import type { ImageFactorySubject } from "../../../db/schema/image_generation";
import { IMAGE_FACTORY_SUBJECTS } from "../../../db/schema/image_generation";
import {
  resolveImageFactoryCronUserId,
  runImageFactoryBatch,
} from "./imageFactoryPipeline";
import { getGenerationBackendStatus } from "../../image-factory/services/generation-service";

let tickInProgress = false;

async function runImageFactoryCronTick(): Promise<void> {
  if (tickInProgress) {
    logger.warn("image-factory-cron: previous tick still running — skipping");
    return;
  }

  const userId = resolveImageFactoryCronUserId();
  if (!userId) {
    logger.warn(
      "image-factory-cron: no super_admin session yet — log in and open Image Factory once",
    );
    return;
  }

  const backend = await getGenerationBackendStatus();
  if (!backend.activeSource) {
    logger.warn(
      { hf: backend.hfInferenceConfigured, flux: backend.fluxSidecarReady },
      "image-factory-cron: no generation backend — skipping tick",
    );
    return;
  }

  tickInProgress = true;
  try {
    const { batchSize, delayBetweenMs } = config.imageFactoryCron;
    const subject = parseOptionalSubject(config.imageFactoryCron.subject);
    const level = config.imageFactoryCron.level;

    const results = await runImageFactoryBatch(batchSize, delayBetweenMs, {
      createdByUserId: userId,
      cronMode: !subject,
      generalPool: true,
      ...(subject ? { subject } : {}),
      ...(level != null && level >= 1 && level <= 6 ? { level } : {}),
    });

    logger.info(
      { requested: batchSize, succeeded: results.length },
      "image-factory-cron: tick finished",
    );
  } catch (err) {
    logger.error({ err }, "image-factory-cron: tick failed");
  } finally {
    tickInProgress = false;
  }
}

function parseOptionalSubject(raw: string): ImageFactorySubject | undefined {
  if (!raw) return undefined;
  return IMAGE_FACTORY_SUBJECTS.includes(raw as ImageFactorySubject)
    ? (raw as ImageFactorySubject)
    : undefined;
}

/** Start the image factory cron when IMAGE_FACTORY_CRON_ENABLED=true. */
export function startImageFactoryCron(): void {
  const { enabled, schedule, runOnStartup } = config.imageFactoryCron;

  if (!enabled) {
    logger.info("image-factory-cron: disabled (set IMAGE_FACTORY_CRON_ENABLED=true to enable)");
    return;
  }

  if (!cron.validate(schedule)) {
    logger.error({ schedule }, "image-factory-cron: invalid cron expression — not started");
    return;
  }

  const subject = parseOptionalSubject(config.imageFactoryCron.subject);
  if (config.imageFactoryCron.subject && !subject) {
    logger.warn(
      { subject: config.imageFactoryCron.subject },
      "image-factory-cron: invalid IMAGE_FACTORY_CRON_SUBJECT — ignoring filter",
    );
  }

  cron.schedule(schedule, () => {
    void runImageFactoryCronTick();
  });

  logger.info(
    {
      schedule,
      batchSize: config.imageFactoryCron.batchSize,
      delayBetweenMs: config.imageFactoryCron.delayBetweenMs,
      subject: subject ?? "rotate-all-sf",
      level: config.imageFactoryCron.level ?? "auto-sparsest",
      generalPool: true,
      batchCoversAllSf: !subject && config.imageFactoryCron.batchSize >= IMAGE_FACTORY_SUBJECTS.length,
      runOnStartup,
    },
    "image-factory-cron: scheduled",
  );

  if (runOnStartup) {
    void runImageFactoryCronTick();
  }
}

/** Exported for tests and one-off invocations from the CLI script. */
export { runImageFactoryCronTick };
