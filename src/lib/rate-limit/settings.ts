import { count, eq } from "drizzle-orm";
import { db, pool, rateLimitSettingsTable, studentsTable } from "../../../db";
import { config } from "../../config";
import { logger } from "../../config/logger";

export const RATE_LIMIT_BOUNDS = {
  minPerStudent: 1,
  maxPerStudent: 120,
  minWindowMs: 10_000,
  maxWindowMs: 3_600_000,
} as const;

export type RateLimitSettings = {
  enabled: boolean;
  windowMs: number;
  aiMaxPerStudent: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

const SETTINGS_ROW_ID = "default";
const CACHE_MS = 10_000;

let tableReady: Promise<void> | null = null;

function ensureSettingsTable(): Promise<void> {
  if (!tableReady) {
    tableReady = pool
      .query(`
        CREATE TABLE IF NOT EXISTS rate_limit_settings (
          id TEXT PRIMARY KEY,
          enabled BOOLEAN NOT NULL DEFAULT true,
          window_ms INTEGER NOT NULL,
          ai_max_per_student INTEGER NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_by TEXT
        )
      `)
      .then(() => undefined);
  }
  return tableReady;
}

let cached: { value: RateLimitSettings; at: number } | null = null;

function clampSettings(raw: {
  enabled: boolean;
  windowMs: number;
  aiMaxPerStudent: number;
  updatedAt?: Date | null;
  updatedBy?: string | null;
}): RateLimitSettings {
  const windowMs = Math.min(
    RATE_LIMIT_BOUNDS.maxWindowMs,
    Math.max(RATE_LIMIT_BOUNDS.minWindowMs, Math.round(raw.windowMs)),
  );
  const aiMaxPerStudent = Math.min(
    RATE_LIMIT_BOUNDS.maxPerStudent,
    Math.max(RATE_LIMIT_BOUNDS.minPerStudent, Math.round(raw.aiMaxPerStudent)),
  );
  return {
    enabled: raw.enabled,
    windowMs,
    aiMaxPerStudent,
    updatedAt: raw.updatedAt ? raw.updatedAt.toISOString() : null,
    updatedBy: raw.updatedBy ?? null,
  };
}

function envFallback(): RateLimitSettings {
  return clampSettings({
    enabled: config.rateLimit.enabled,
    windowMs: config.rateLimit.windowMs,
    aiMaxPerStudent: config.rateLimit.aiMaxPerWindow,
    updatedAt: null,
    updatedBy: null,
  });
}

export function invalidateRateLimitSettingsCache(): void {
  cached = null;
}

export async function getRateLimitSettings(): Promise<RateLimitSettings> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  try {
    await ensureSettingsTable();
    const [row] = await db
      .select()
      .from(rateLimitSettingsTable)
      .where(eq(rateLimitSettingsTable.id, SETTINGS_ROW_ID))
      .limit(1);
    const value = row
      ? clampSettings({
          enabled: row.enabled,
          windowMs: row.windowMs,
          aiMaxPerStudent: row.aiMaxPerStudent,
          updatedAt: row.updatedAt,
          updatedBy: row.updatedBy,
        })
      : envFallback();
    cached = { value, at: Date.now() };
    return value;
  } catch (err) {
    logger.warn({ err }, "rate_limit_settings read failed; using env defaults");
    return envFallback();
  }
}

export async function saveRateLimitSettings(input: {
  enabled: boolean;
  windowMs: number;
  aiMaxPerStudent: number;
  updatedBy: string | null;
}): Promise<RateLimitSettings> {
  await ensureSettingsTable();
  const value = clampSettings({
    ...input,
    updatedAt: new Date(),
    updatedBy: input.updatedBy,
  });
  await db
    .insert(rateLimitSettingsTable)
    .values({
      id: SETTINGS_ROW_ID,
      enabled: value.enabled,
      windowMs: value.windowMs,
      aiMaxPerStudent: value.aiMaxPerStudent,
      updatedAt: new Date(),
      updatedBy: value.updatedBy,
    })
    .onConflictDoUpdate({
      target: rateLimitSettingsTable.id,
      set: {
        enabled: value.enabled,
        windowMs: value.windowMs,
        aiMaxPerStudent: value.aiMaxPerStudent,
        updatedAt: new Date(),
        updatedBy: value.updatedBy,
      },
    });
  invalidateRateLimitSettingsCache();
  return getRateLimitSettings();
}

const orgCountCache = new Map<string, { count: number; at: number }>();

async function cachedCount(cacheKey: string, query: Promise<{ count: number }[]>): Promise<number> {
  const hit = orgCountCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 30_000) return hit.count;
  const [row] = await query;
  const count = Number(row?.count ?? 0);
  orgCountCache.set(cacheKey, { count, at: Date.now() });
  return count;
}

/**
 * Org pool = per-student cap × registered students in that school or district.
 * Solo students have no org pool (only the per-user cap).
 */
export async function getOrgRateLimitBucket(
  studentId: string,
  perStudent: number,
): Promise<{ key: string; limit: number; memberCount: number } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) return null;
  const [student] = await db
    .select({
      schoolId: studentsTable.schoolId,
      districtId: studentsTable.districtId,
    })
    .from(studentsTable)
    .where(eq(studentsTable.id, studentId))
    .limit(1);
  if (!student) return null;

  if (student.schoolId) {
    const memberCount = Math.max(
      1,
      await cachedCount(
        `school:${student.schoolId}`,
        db
          .select({ count: count() })
          .from(studentsTable)
          .where(eq(studentsTable.schoolId, student.schoolId)),
      ),
    );
    return {
      key: `ai-org:school:${student.schoolId}`,
      limit: perStudent * memberCount,
      memberCount,
    };
  }
  if (student.districtId) {
    const memberCount = Math.max(
      1,
      await cachedCount(
        `district:${student.districtId}`,
        db
          .select({ count: count() })
          .from(studentsTable)
          .where(eq(studentsTable.districtId, student.districtId)),
      ),
    );
    return {
      key: `ai-org:district:${student.districtId}`,
      limit: perStudent * memberCount,
      memberCount,
    };
  }
  return null;
}
