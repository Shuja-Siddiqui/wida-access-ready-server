/**
 * Super-admin AI token usage — per-call ledger with live Anthropic cost estimates.
 */

import type { IRouter } from "express";
import { createApiRouter } from "../../lib/http/create-api-router";
import { and, desc, eq, gte, inArray, isNotNull, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod/v4";
import {
  aiTokenCallsTable,
  db,
  imageGenerationJobsTable,
  sessionsTable,
  studentsTable,
  usersTable,
} from "../../../db";
import { sendError, sendSuccess } from "../../lib/http/api-response";
import { requireSuperAdminApiStack } from "../../middlewares/admin-guard";
import {
  ensurePricingLoaded,
  estimateCallCost,
  getAnthropicPricing,
  getPricingCacheForEstimate,
} from "../../lib/anthropic-pricing";

const router: IRouter = createApiRouter();

router.use("/admin", ...requireSuperAdminApiStack);

const ListCallsQuery = z.object({
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(100).default(50),
  studentId:  z.string().uuid().optional(),
  sessionId:  z.string().uuid().optional(),
  callKind:   z.string().optional(),
  domain:     z.string().optional(),
  from:       z.string().datetime().optional(),
  to:         z.string().datetime().optional(),
});

const SummaryQuery = z.object({
  studentId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  from:      z.string().datetime().optional(),
  to:        z.string().datetime().optional(),
});

const ListSessionsQuery = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(25),
  studentId: z.string().uuid().optional(),
  completed: z.enum(["true", "false"]).optional(),
});

const ListImageFactoryQuery = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

function buildFilters(q: {
  studentId?: string;
  sessionId?: string;
  callKind?: string;
  domain?: string;
  from?: string;
  to?: string;
}): SQL | undefined {
  const parts: SQL[] = [];
  if (q.studentId) parts.push(eq(aiTokenCallsTable.studentId, q.studentId));
  if (q.sessionId) parts.push(eq(aiTokenCallsTable.sessionId, q.sessionId));
  if (q.callKind) parts.push(eq(aiTokenCallsTable.callKind, q.callKind));
  if (q.domain) parts.push(eq(aiTokenCallsTable.domain, q.domain));
  if (q.from) parts.push(gte(aiTokenCallsTable.createdAt, new Date(q.from)));
  if (q.to) parts.push(lte(aiTokenCallsTable.createdAt, new Date(q.to)));
  if (parts.length === 0) return undefined;
  return and(...parts);
}

function roundUsd(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function formatCallRow(
  row: {
    id: string;
    studentId: string | null;
    userId: string | null;
    imageJobId: string | null;
    sessionId: string | null;
    callKind: string;
    domain: string | null;
    model: string | null;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    createdAt: Date;
    studentName: string | null;
    userName: string | null;
    sessionDomain: string | null;
  },
  pricing: ReturnType<typeof getPricingCacheForEstimate>,
) {
  const cost = estimateCallCost(
    { model: row.model, inputTokens: row.inputTokens, outputTokens: row.outputTokens },
    pricing,
  );
  return {
    id:             row.id,
    studentId:      row.studentId,
    studentName:    row.studentName,
    userId:         row.userId,
    userName:       row.userName,
    actorName:      row.studentName ?? row.userName,
    actorType:      row.studentId ? "student" : row.userId ? "admin" : null,
    imageJobId:     row.imageJobId,
    sessionId:      row.sessionId,
    sessionDomain:  row.sessionDomain,
    callKind:       row.callKind,
    domain:         row.domain,
    model:          row.model,
    inputTokens:    row.inputTokens,
    outputTokens:   row.outputTokens,
    totalTokens:    row.totalTokens,
    inputCostUsd:   roundUsd(cost.inputCostUsd),
    outputCostUsd:  roundUsd(cost.outputCostUsd),
    totalCostUsd:   roundUsd(cost.totalCostUsd),
    pricingModel:   cost.pricingDisplayName,
    priced:         cost.priced,
    createdAt:      row.createdAt.toISOString(),
  };
}

/** GET /admin/ai-usage/calls — paginated per-call ledger (Cursor-style). */
router.get("/admin/ai-usage/calls", async (req, res): Promise<void> => {
  const parsed = ListCallsQuery.safeParse(req.query);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return;
  }

  const { page, limit, ...filters } = parsed.data;
  const where = buildFilters(filters);
  const offset = (page - 1) * limit;

  await ensurePricingLoaded();
  const pricing = getPricingCacheForEstimate();

  const [rows, countRow] = await Promise.all([
    db
      .select({
        id:            aiTokenCallsTable.id,
        studentId:       aiTokenCallsTable.studentId,
        userId:          aiTokenCallsTable.userId,
        imageJobId:      aiTokenCallsTable.imageJobId,
        sessionId:       aiTokenCallsTable.sessionId,
        callKind:        aiTokenCallsTable.callKind,
        domain:          aiTokenCallsTable.domain,
        model:           aiTokenCallsTable.model,
        inputTokens:     aiTokenCallsTable.inputTokens,
        outputTokens:    aiTokenCallsTable.outputTokens,
        totalTokens:     aiTokenCallsTable.totalTokens,
        createdAt:       aiTokenCallsTable.createdAt,
        studentName:     studentsTable.name,
        userName:        usersTable.name,
        sessionDomain:   sessionsTable.domain,
      })
      .from(aiTokenCallsTable)
      .leftJoin(studentsTable, eq(aiTokenCallsTable.studentId, studentsTable.id))
      .leftJoin(usersTable, eq(aiTokenCallsTable.userId, usersTable.id))
      .leftJoin(sessionsTable, eq(aiTokenCallsTable.sessionId, sessionsTable.id))
      .where(where)
      .orderBy(desc(aiTokenCallsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(aiTokenCallsTable)
      .where(where),
  ]);

  const total = Number(countRow[0]?.count ?? 0);
  const calls = rows.map((r) => formatCallRow(r, pricing));
  const pageCostUsd = roundUsd(calls.reduce((s, c) => s + c.totalCostUsd, 0));

  sendSuccess(res, {
    calls,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
    pageSummary: {
      callCount: calls.length,
      inputTokens:  calls.reduce((s, c) => s + c.inputTokens, 0),
      outputTokens: calls.reduce((s, c) => s + c.outputTokens, 0),
      totalTokens:  calls.reduce((s, c) => s + c.totalTokens, 0),
      totalCostUsd: pageCostUsd,
    },
  });
});

/** GET /admin/ai-usage/sessions — per-session token + cost rollups (most recent first). */
router.get("/admin/ai-usage/sessions", async (req, res): Promise<void> => {
  const parsed = ListSessionsQuery.safeParse(req.query);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return;
  }

  const { page, limit, studentId, completed } = parsed.data;
  const offset = (page - 1) * limit;

  await ensurePricingLoaded();
  const pricing = getPricingCacheForEstimate();

  const sessionFilters: SQL[] = [isNotNull(aiTokenCallsTable.sessionId)];
  if (studentId) sessionFilters.push(eq(aiTokenCallsTable.studentId, studentId));
  if (completed === "true") sessionFilters.push(eq(sessionsTable.completed, true));
  if (completed === "false") sessionFilters.push(eq(sessionsTable.completed, false));

  const where = and(...sessionFilters);

  const [aggRows, countRow] = await Promise.all([
    db
      .select({
        sessionId:    aiTokenCallsTable.sessionId,
        studentId:    sql<string>`min(${aiTokenCallsTable.studentId})`,
        callCount:    sql<number>`count(*)::int`,
        inputTokens:  sql<number>`coalesce(sum(${aiTokenCallsTable.inputTokens}), 0)::int`,
        outputTokens: sql<number>`coalesce(sum(${aiTokenCallsTable.outputTokens}), 0)::int`,
        totalTokens:  sql<number>`coalesce(sum(${aiTokenCallsTable.totalTokens}), 0)::int`,
        lastCallAt:   sql<Date>`max(${aiTokenCallsTable.createdAt})`,
      })
      .from(aiTokenCallsTable)
      .innerJoin(sessionsTable, eq(aiTokenCallsTable.sessionId, sessionsTable.id))
      .where(where)
      .groupBy(aiTokenCallsTable.sessionId)
      .orderBy(desc(sql`max(${aiTokenCallsTable.createdAt})`))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(distinct ${aiTokenCallsTable.sessionId})::int` })
      .from(aiTokenCallsTable)
      .innerJoin(sessionsTable, eq(aiTokenCallsTable.sessionId, sessionsTable.id))
      .where(where),
  ]);

  const sessionIds = aggRows
    .map((r) => r.sessionId)
    .filter((id): id is string => id != null);

  const sessionMeta = new Map<string, {
    domain: string;
    completed: boolean;
    createdAt: Date;
    studentName: string | null;
  }>();

  if (sessionIds.length > 0) {
    const metaRows = await db
      .select({
        id:          sessionsTable.id,
        domain:      sessionsTable.domain,
        completed:   sessionsTable.completed,
        createdAt:   sessionsTable.createdAt,
        studentName: studentsTable.name,
      })
      .from(sessionsTable)
      .leftJoin(studentsTable, eq(sessionsTable.studentId, studentsTable.id))
      .where(inArray(sessionsTable.id, sessionIds));

    for (const row of metaRows) {
      sessionMeta.set(row.id, {
        domain: row.domain,
        completed: row.completed,
        createdAt: row.createdAt,
        studentName: row.studentName,
      });
    }
  }

  const costBySession = new Map<string, number>();
  if (sessionIds.length > 0) {
    const callRows = await db
      .select({
        sessionId:    aiTokenCallsTable.sessionId,
        model:        aiTokenCallsTable.model,
        inputTokens:  aiTokenCallsTable.inputTokens,
        outputTokens: aiTokenCallsTable.outputTokens,
      })
      .from(aiTokenCallsTable)
      .where(inArray(aiTokenCallsTable.sessionId, sessionIds));

    for (const call of callRows) {
      if (!call.sessionId) continue;
      const cost = estimateCallCost(
        { model: call.model, inputTokens: call.inputTokens, outputTokens: call.outputTokens },
        pricing,
      );
      costBySession.set(call.sessionId, (costBySession.get(call.sessionId) ?? 0) + cost.totalCostUsd);
    }
  }

  const sessions = aggRows
    .filter((row) => row.sessionId != null)
    .map((row) => {
      const meta = sessionMeta.get(row.sessionId!);
      return {
        sessionId:    row.sessionId!,
        studentId:    row.studentId,
        studentName:  meta?.studentName ?? null,
        domain:       meta?.domain ?? null,
        completed:    meta?.completed ?? false,
        sessionStartedAt: meta?.createdAt.toISOString() ?? null,
        lastCallAt:   row.lastCallAt.toISOString(),
        callCount:    row.callCount,
        inputTokens:  row.inputTokens,
        outputTokens: row.outputTokens,
        totalTokens:  row.totalTokens,
        totalCostUsd: roundUsd(costBySession.get(row.sessionId!) ?? 0),
      };
    });

  const total = Number(countRow[0]?.count ?? 0);

  sendSuccess(res, {
    sessions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

/** GET /admin/ai-usage/summary — aggregates for dashboard header cards. */
router.get("/admin/ai-usage/summary", async (req, res): Promise<void> => {
  const parsed = SummaryQuery.safeParse(req.query);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return;
  }

  const where = buildFilters(parsed.data);
  await ensurePricingLoaded();
  const pricing = getPricingCacheForEstimate();

  const rows = await db
    .select({
      callKind:     aiTokenCallsTable.callKind,
      model:        aiTokenCallsTable.model,
      inputTokens:  aiTokenCallsTable.inputTokens,
      outputTokens: aiTokenCallsTable.outputTokens,
      totalTokens:  aiTokenCallsTable.totalTokens,
    })
    .from(aiTokenCallsTable)
    .where(where)
    .limit(50_000);

  let totalInput = 0;
  let totalOutput = 0;
  let totalCostUsd = 0;
  const byCallKind: Record<string, { calls: number; totalTokens: number; costUsd: number }> = {};
  const byModel: Record<string, { calls: number; totalTokens: number; costUsd: number; displayName: string | null }> = {};

  for (const row of rows) {
    totalInput += row.inputTokens;
    totalOutput += row.outputTokens;
    const cost = estimateCallCost(
      { model: row.model, inputTokens: row.inputTokens, outputTokens: row.outputTokens },
      pricing,
    );
    totalCostUsd += cost.totalCostUsd;

    const kind = row.callKind;
    byCallKind[kind] ??= { calls: 0, totalTokens: 0, costUsd: 0 };
    byCallKind[kind].calls += 1;
    byCallKind[kind].totalTokens += row.totalTokens;
    byCallKind[kind].costUsd += cost.totalCostUsd;

    const modelKey = row.model ?? "unknown";
    byModel[modelKey] ??= { calls: 0, totalTokens: 0, costUsd: 0, displayName: cost.pricingDisplayName };
    byModel[modelKey].calls += 1;
    byModel[modelKey].totalTokens += row.totalTokens;
    byModel[modelKey].costUsd += cost.totalCostUsd;
  }

  const pricingMeta = await getAnthropicPricing();

  sendSuccess(res, {
    callCount: rows.length,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    totalTokens: totalInput + totalOutput,
    totalCostUsd: roundUsd(totalCostUsd),
    byCallKind: Object.entries(byCallKind).map(([callKind, v]) => ({
      callKind,
      ...v,
      costUsd: roundUsd(v.costUsd),
    })),
    byModel: Object.entries(byModel).map(([model, v]) => ({
      model,
      displayName: v.displayName,
      calls: v.calls,
      totalTokens: v.totalTokens,
      costUsd: roundUsd(v.costUsd),
    })),
    pricing: {
      fetchedAt: pricingMeta.fetchedAt,
      expiresAt: pricingMeta.expiresAt,
      source: pricingMeta.source,
    },
  });
});

/** GET /admin/ai-usage/image-factory — image prompt jobs with linked Claude token/cost. */
router.get("/admin/ai-usage/image-factory", async (req, res): Promise<void> => {
  const parsed = ListImageFactoryQuery.safeParse(req.query);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return;
  }

  const { page, limit } = parsed.data;
  const offset = (page - 1) * limit;

  await ensurePricingLoaded();
  const pricing = getPricingCacheForEstimate();

  const [jobs, countRow] = await Promise.all([
    db
      .select({
        jobId:           imageGenerationJobsTable.id,
        subject:         imageGenerationJobsTable.subject,
        level:           imageGenerationJobsTable.level,
        complexityStep:  imageGenerationJobsTable.complexityStep,
        keyUse:          imageGenerationJobsTable.keyUse,
        imageConcept:    imageGenerationJobsTable.imageConcept,
        status:          imageGenerationJobsTable.status,
        createdAt:       imageGenerationJobsTable.createdAt,
        createdByName:   usersTable.name,
        createdByEmail:  usersTable.email,
        tokenId:         aiTokenCallsTable.id,
        model:           aiTokenCallsTable.model,
        inputTokens:     aiTokenCallsTable.inputTokens,
        outputTokens:    aiTokenCallsTable.outputTokens,
        totalTokens:     aiTokenCallsTable.totalTokens,
      })
      .from(imageGenerationJobsTable)
      .leftJoin(usersTable, eq(imageGenerationJobsTable.createdBy, usersTable.id))
      .leftJoin(aiTokenCallsTable, eq(aiTokenCallsTable.imageJobId, imageGenerationJobsTable.id))
      .orderBy(desc(imageGenerationJobsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(imageGenerationJobsTable),
  ]);

  const rows = jobs.map((job) => {
    const cost = job.tokenId
      ? estimateCallCost(
          {
            model: job.model,
            inputTokens: job.inputTokens ?? 0,
            outputTokens: job.outputTokens ?? 0,
          },
          pricing,
        )
      : null;
    return {
      jobId:          job.jobId,
      subject:        job.subject,
      level:          job.level,
      complexityStep: job.complexityStep,
      keyUse:         job.keyUse,
      imageConcept:   job.imageConcept,
      status:         job.status,
      createdAt:      job.createdAt.toISOString(),
      createdByName:  job.createdByName,
      createdByEmail: job.createdByEmail,
      tokenTracked:   Boolean(job.tokenId),
      inputTokens:    job.inputTokens ?? 0,
      outputTokens:   job.outputTokens ?? 0,
      totalTokens:    job.totalTokens ?? 0,
      model:          job.model,
      totalCostUsd:     cost ? roundUsd(cost.totalCostUsd) : 0,
      priced:           cost?.priced ?? false,
    };
  });

  const total = Number(countRow[0]?.count ?? 0);

  sendSuccess(res, {
    jobs: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
    pageSummary: {
      jobCount: rows.length,
      trackedPrompts: rows.filter((r) => r.tokenTracked).length,
      totalTokens: rows.reduce((s, r) => s + r.totalTokens, 0),
      totalCostUsd: roundUsd(rows.reduce((s, r) => s + r.totalCostUsd, 0)),
    },
  });
});

/** GET /admin/ai-usage/pricing — current cached Anthropic rates. */
router.get("/admin/ai-usage/pricing", async (_req, res): Promise<void> => {
  const snapshot = await getAnthropicPricing();
  sendSuccess(res, snapshot);
});

/** POST /admin/ai-usage/pricing/refresh — force re-fetch from Anthropic docs. */
router.post("/admin/ai-usage/pricing/refresh", async (_req, res): Promise<void> => {
  const snapshot = await getAnthropicPricing({ forceRefresh: true });
  sendSuccess(res, snapshot);
});

export default router;
