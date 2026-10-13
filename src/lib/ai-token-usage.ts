import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { aiTokenCallsTable, db, sessionsTable } from "../../db";
import { logger } from "../config/logger";
import type { AiTokenCallKind } from "./ai-token-context";
import { incrementDailyTokenUsage } from "./rate-limit/usage";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RecordAiTokenCallParams {
  studentId?: string | null;
  userId?: string | null;
  imageJobId?: string | null;
  sessionId?: string | null;
  callKind: AiTokenCallKind;
  domain?: string | null;
  model?: string | null;
  inputTokens: number;
  outputTokens: number;
}

function normalizeTokens(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Fire-and-forget: one row in ai_token_calls + roll up to session and daily totals. */
export function recordAiTokenCall(params: RecordAiTokenCallParams): void {
  const studentIdRaw = params.studentId?.trim();
  const userIdRaw = params.userId?.trim();
  const studentId = studentIdRaw && UUID_RE.test(studentIdRaw) ? studentIdRaw : null;
  const userId = userIdRaw && UUID_RE.test(userIdRaw) ? userIdRaw : null;
  if (!studentId && !userId) return;

  const inputTokens = normalizeTokens(params.inputTokens);
  const outputTokens = normalizeTokens(params.outputTokens);
  const totalTokens = inputTokens + outputTokens;
  if (totalTokens === 0) return;

  const sessionId = params.sessionId?.trim() && UUID_RE.test(params.sessionId.trim())
    ? params.sessionId.trim()
    : null;
  const imageJobId = params.imageJobId?.trim() && UUID_RE.test(params.imageJobId.trim())
    ? params.imageJobId.trim()
    : null;

  void (async () => {
    try {
      await db.insert(aiTokenCallsTable).values({
        studentId,
        userId,
        imageJobId,
        sessionId,
        callKind: params.callKind,
        domain: params.domain ?? null,
        model: params.model ?? null,
        inputTokens,
        outputTokens,
        totalTokens,
      });

      if (sessionId && studentId) {
        await db
          .update(sessionsTable)
          .set({
            aiInputTokens:  sql`${sessionsTable.aiInputTokens} + ${inputTokens}`,
            aiOutputTokens: sql`${sessionsTable.aiOutputTokens} + ${outputTokens}`,
            aiTotalTokens:  sql`${sessionsTable.aiTotalTokens} + ${totalTokens}`,
            aiCallCount:    sql`${sessionsTable.aiCallCount} + 1`,
          })
          .where(eq(sessionsTable.id, sessionId));
      }

      if (studentId) {
        incrementDailyTokenUsage(studentId, inputTokens, outputTokens, totalTokens);
      }
    } catch (err) {
      logger.warn(
        { err, studentId, userId, sessionId, callKind: params.callKind },
        "ai_token_calls insert failed",
      );
    }
  })();
}

/** Link the most recent image_factory token row to the job created right after Claude returns. */
export async function linkImageFactoryTokenToJob(userId: string, imageJobId: string): Promise<void> {
  if (!UUID_RE.test(userId) || !UUID_RE.test(imageJobId)) return;
  try {
    const [row] = await db
      .select({ id: aiTokenCallsTable.id })
      .from(aiTokenCallsTable)
      .where(and(
        eq(aiTokenCallsTable.userId, userId),
        eq(aiTokenCallsTable.callKind, "image_factory"),
        isNull(aiTokenCallsTable.imageJobId),
        sql`${aiTokenCallsTable.createdAt} >= NOW() - INTERVAL '5 minutes'`,
      ))
      .orderBy(desc(aiTokenCallsTable.createdAt))
      .limit(1);

    if (!row) return;

    await db
      .update(aiTokenCallsTable)
      .set({ imageJobId })
      .where(eq(aiTokenCallsTable.id, row.id));
  } catch (err) {
    logger.warn({ err, userId, imageJobId }, "link image_factory token to job failed");
  }
}

/**
 * Content generation for reading/speaking/writing runs before the session row exists.
 * Link the most recent orphan content_generate call and roll tokens into the new session.
 */
export async function attachRecentContentGenerateCallToSession(params: {
  studentId: string;
  sessionId: string;
  domain: string;
  withinMinutes?: number;
}): Promise<void> {
  const { studentId, sessionId, domain } = params;
  if (!UUID_RE.test(studentId) || !UUID_RE.test(sessionId)) return;

  const withinMinutes = params.withinMinutes ?? 5;
  try {
    const [row] = await db
      .select({
        id:           aiTokenCallsTable.id,
        inputTokens:  aiTokenCallsTable.inputTokens,
        outputTokens: aiTokenCallsTable.outputTokens,
        totalTokens:  aiTokenCallsTable.totalTokens,
      })
      .from(aiTokenCallsTable)
      .where(and(
        eq(aiTokenCallsTable.studentId, studentId),
        eq(aiTokenCallsTable.callKind, "content_generate"),
        eq(aiTokenCallsTable.domain, domain),
        isNull(aiTokenCallsTable.sessionId),
        sql`${aiTokenCallsTable.createdAt} >= NOW() - (${withinMinutes} * INTERVAL '1 minute')`,
      ))
      .orderBy(desc(aiTokenCallsTable.createdAt))
      .limit(1);

    if (!row) return;

    await db
      .update(aiTokenCallsTable)
      .set({ sessionId })
      .where(eq(aiTokenCallsTable.id, row.id));

    await db
      .update(sessionsTable)
      .set({
        aiInputTokens:  sql`${sessionsTable.aiInputTokens} + ${row.inputTokens}`,
        aiOutputTokens: sql`${sessionsTable.aiOutputTokens} + ${row.outputTokens}`,
        aiTotalTokens:  sql`${sessionsTable.aiTotalTokens} + ${row.totalTokens}`,
        aiCallCount:    sql`${sessionsTable.aiCallCount} + 1`,
      })
      .where(eq(sessionsTable.id, sessionId));
  } catch (err) {
    logger.warn({ err, studentId, sessionId, domain }, "attach content_generate call failed");
  }
}

/** Per-session token summary for API responses. */
export async function getSessionTokenUsage(sessionId: string) {
  const [session] = await db
    .select({
      aiInputTokens:  sessionsTable.aiInputTokens,
      aiOutputTokens: sessionsTable.aiOutputTokens,
      aiTotalTokens:  sessionsTable.aiTotalTokens,
      aiCallCount:    sessionsTable.aiCallCount,
    })
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId))
    .limit(1);

  return session ?? {
    aiInputTokens: 0,
    aiOutputTokens: 0,
    aiTotalTokens: 0,
    aiCallCount: 0,
  };
}
