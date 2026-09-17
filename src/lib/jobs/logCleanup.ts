// Deletes rotated log files older than the configured retention window.
// Pairs with the pino-roll file transport in ../config/logger.ts, which
// writes one log file per day to config.logging.dir.

import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import cron from "node-cron";
import { config } from "../../config/index";
import { logger } from "../../config/logger";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Scans the log directory and removes any file whose last-modified time is
 * older than `retentionDays`. Safe to call repeatedly — a missing directory
 * (e.g. before the first log line is ever written) is treated as a no-op.
 */
export async function deleteExpiredLogs(): Promise<void> {
  const { dir, retentionDays } = config.logging;
  const cutoff = Date.now() - retentionDays * MS_PER_DAY;

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    logger.error({ err, dir }, "Failed to read log directory during cleanup");
    return;
  }

  for (const entry of entries) {
    const filePath = path.join(dir, entry);
    try {
      const stats = await stat(filePath);
      if (!stats.isFile()) continue;
      if (stats.mtimeMs < cutoff) {
        await unlink(filePath);
        logger.info({ filePath }, "Deleted expired log file");
      }
    } catch (err) {
      logger.error({ err, filePath }, "Failed to inspect/delete log file during cleanup");
    }
  }
}

/**
 * Schedules the daily cleanup job and runs it once immediately on startup
 * (so a deploy that was down past the retention window still catches up).
 */
export function startLogCleanupJob(): void {
  void deleteExpiredLogs();

  cron.schedule("0 3 * * *", () => {
    void deleteExpiredLogs();
  });

  logger.info(
    { retentionDays: config.logging.retentionDays, dir: config.logging.dir },
    "Scheduled daily log cleanup job",
  );
}
