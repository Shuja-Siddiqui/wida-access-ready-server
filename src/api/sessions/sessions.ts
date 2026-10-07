import type { IRouter } from "express";
import { createApiRouter } from "../../lib/http/create-api-router";
import { eq, and, sql, desc, inArray, gt, or, notInArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  studentsTable,
  sessionsTable,
  sessionAnswersTable,
  studentLevelsTable,
} from "../../../db";
import {
  libraryTable,
  libraryTopicsTable,
  topicsTable,
  studentObjectMasteryTable,
} from "../../../db/schema";
import { ObjectStorageService } from "../../lib/images/objectStorage";
import {
  buildListeningContext,
  buildAcademicListeningContext,
  ACADEMIC_SUBJECT_LABELS,
  buildReadingContext,
  buildSpeakingContext,
  buildWritingContext,
  nextWritingAcademicSubject,
  nextWritingKeyUseForSubject,
  lastWritingKeyUseForSubject,
  nextFrameworkAcademicSubject,
  nextFrameworkKeyUseForSubject,
  lastFrameworkKeyUseForSubject,
  nextAcademicSubject,
  nextKeyUseForSubject,
  KEY_USE_ROTATION,
  asAcademicSubject,
  retrieveWritingLibraryCandidatesForSession,
  retrieveListeningLibraryCandidatesForSession,
  resolveWritingLibrarySelectionWithPolicy,
  buildLibrarySearchTopic,
  pickBestLibraryCandidateForCurriculum,
  incrementLibraryUseCount,
  sessionUsesLibraryPhotos,
  libraryCandidateToSessionAnchor,
  resolveLibraryImageDisplayUrl,
} from "../../lib/content";
import {
  nextKeyUse,
  pickSubjectForKeyUse,
  buildAcademicContentLayer,
  buildAcademicSessionContext,
  buildMathSessionContext,
  buildScienceSessionContext,
  buildSocialStudiesSessionContext,
  buildElaSessionContext,
} from "../../lib/academic";
import {
  generateAcademicMathListeningContent,
  generateAcademicScienceListeningContent,
  generateAcademicSocialStudiesListeningContent,
  generateAcademicElaListeningContent,
  generateReadingContent,
  generateSpeakingContent,
  generateWritingContent,
  getWritingFeedback,
  generateAttemptFeedback,
  generateItemFeedback,
  type ItemFeedbackInput,
  isClaudeCapacityError,
  getClaudeQueueSnapshot,
} from "../../lib/claude";
import { SUBJECT_VISUAL_ANCHOR_TAGS } from "../../lib/claude/prompts";
import {
  selectFrameworkTask,
  serializeFrameworkForFeedback,
  type FrameworkTask,
} from "../../lib/claude/standards/2020";
import {
  StartSessionParams,
  StartSessionBody,
  CompleteSessionParams,
  CompleteSessionBody,
  ListStudentSessionsParams,
  ListStudentSessionsQueryParams,
  ListSessionAnswersParams,
  GetWritingFeedbackParams,
  GetWritingFeedbackBody,
} from "../../generated";
import {
  Assessment,
  Domain,
  Tier,
  getAssessmentConfig,
  getExitThreshold,
  getLevelLabel,
} from "../../lib/assessments";
import { upsertStudentPracticeSuggestion } from "../../lib/practice-suggestion";
import {
  calculatePerformanceLevelUpdate,
  fractionalStepWithinLevel,
} from "../../lib/performance-level-update";
import {
  extractWritingMeetsTaskFromAnswers,
  extractWritingMinSentencesFromAnswers,
  extractWritingRubricFromAnswers,
} from "../../lib/writing-level-progression";
import { normalizeRotationKeyUse } from "../../lib/content/listeningContentEngine";
import { sendError, sendSuccess } from "../../lib/http/api-response";
import { requireAuth, requireStudentAccess } from "../../middlewares/auth";
import { rateLimitStudentAi } from "../../middlewares/rate-limit";
import {
  filterAttemptFeedbackForStudent,
  filterItemFeedbackForStudent,
  filterWritingFeedbackForStudent,
} from "../../lib/ai-output-filter";
import { resolveStudentAccess } from "../../lib/billing/subscription";
import { patchAiTokenContext, withAiTokenContext } from "../../lib/ai-token-context";
import {
  attachRecentContentGenerateCallToSession,
  getSessionTokenUsage,
} from "../../lib/ai-token-usage";
import { buildPracticeReport, parsePracticeReport } from "../../lib/practice-report";
import {
  computeInterpretiveScore,
  isInterpretiveDomain,
} from "../../lib/interpretive-scoring";

const storage = new ObjectStorageService();

/** Writing: did the last completed session pass the ACCESS rubric gate (not score %)? */
async function resolveLastWritingMeetsTask(
  sessionId: string,
  practiceReportRaw: unknown,
  currentLevel: number,
): Promise<boolean | null> {
  const report = parsePracticeReport(practiceReportRaw);
  if (report?.meetsTask != null) return report.meetsTask;

  const answerRows = await db
    .select({
      questionIndex: sessionAnswersTable.questionIndex,
      content: sessionAnswersTable.content,
      correct: sessionAnswersTable.correct,
    })
    .from(sessionAnswersTable)
    .where(eq(sessionAnswersTable.sessionId, sessionId))
    .orderBy(sessionAnswersTable.questionIndex);

  if (answerRows.length === 0) return null;

  const answers = answerRows.map((r) => ({
    content: r.content,
    correct: r.correct ?? undefined,
  }));
  const rubric = extractWritingRubricFromAnswers(answers);
  const minS = extractWritingMinSentencesFromAnswers(answers);
  return extractWritingMeetsTaskFromAnswers(answers, rubric, currentLevel, minS);
}

function sendClaudeBusy(
  req: { log: { warn: (obj: object, msg: string) => void } },
  res: Parameters<typeof sendError>[0],
  err: unknown,
): void {
  if (!isClaudeCapacityError(err)) return;
  req.log.warn(
    {
      stage: "claude-queue",
      code: err.code,
      jobId: err.jobId,
      kind: err.kind,
      retryAfterSeconds: err.retryAfterSeconds,
      queue: getClaudeQueueSnapshot(),
    },
    "Claude capacity — student asked to retry (request not dropped)",
  );
  res.setHeader("Retry-After", String(err.retryAfterSeconds));
  sendError(res, 503, err.message, {
    code: err.code,
    retryAfterSeconds: err.retryAfterSeconds,
    jobId: err.jobId,
  });
}

const ItemFeedbackBody = z.object({
  sessionId: z.string().uuid().optional(),
  domain: z.string().min(1),
  level: z.coerce.number(),
  format: z.enum(["picture", "selected_response", "speaking", "writing"]),
  question: z.string(),
  studentAnswer: z.string(),
  correctAnswer: z.string().nullish(),
  passage: z.string().nullish(),
  imageDescription: z.string().nullish(),
  imageTags: z.array(z.string()).nullish(),
  targetObject: z.string().nullish(),
  prompt: z.string().nullish(),
  scaffold: z.string().nullish(),
  canDo: z.string().nullish(),
  keyUse: z.string().nullish(),
  canDoItems: z.array(z.string()).nullish(),
  canDoAction: z.string().nullish(),
  options: z.array(z.string()).nullish(),
  responseLength: z.string().nullish(),
  minSentences: z.coerce.number().nullish(),
  correct: z.boolean().nullish(),
  sttConfidence: z.coerce.number().nullish(),
  uncertainWords: z.array(z.string()).nullish(),
  tryCount: z.coerce.number().nullish(),
  lastJudgment: z.enum(["agree", "partial", "rejected"]).nullish(),
  lastCoachTip: z.string().nullish(),
  lastStudentAnswer: z.string().nullish(),
  framework: z.record(z.unknown()).nullish(),
});

/** Zod nullish fields → undefined for generateItemFeedback. */
function normalizeItemFeedbackBody(body: z.infer<typeof ItemFeedbackBody>): ItemFeedbackInput {
  const out = { ...body } as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    if (out[key] === null) delete out[key];
  }
  return out as unknown as ItemFeedbackInput;
}

/** Attach compact 2020 framework snapshot for client item/attempt feedback. */
function withSessionFramework(data: unknown, framework: FrameworkTask): Record<string, unknown> {
  const base = data && typeof data === "object"
    ? { ...(data as Record<string, unknown>) }
    : {};
  base.framework = serializeFrameworkForFeedback(framework);
  if (!base.keyUse) base.keyUse = framework.key_language_use;
  return base;
}

function dinoLabels(row: { detectionResults: unknown }): string[] {
  const detections = ((row.detectionResults as { detections?: { label?: string }[] } | null)?.detections ?? [])
    .map((d) => d.label)
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0);
  return [...new Set(detections)];
}

function writingImageTags(row: {
  tags: unknown;
  detectionResults: unknown;
}): string[] {
  const official = Array.isArray(row.tags) ? row.tags.filter((t): t is string => typeof t === "string") : [];
  const detections = dinoLabels(row);
  return [...new Set([...official, ...detections])];
}

/** Extract curriculum scenario from stored session topic (`Unit :: scenario`). */
function scenarioFromSessionTopic(topic: string): string | null {
  const sep = topic.indexOf(" :: ");
  return sep >= 0 ? topic.slice(sep + 4).trim() : null;
}

const TOPIC_STOP_WORDS = new Set([
  "this", "that", "with", "from", "about", "show", "shows", "what", "does",
  "have", "into", "and", "the", "for", "are", "your", "their", "them",
]);

function topicSearchTerms(topic: string): string[] {
  return topic
    .replace(/[\[\]]/g, " ")
    .split(/[^a-zA-Z0-9]+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 4 && !TOPIC_STOP_WORDS.has(w));
}

function topicFromAnchor(anchor: {
  tags: string[];
  description?: string | null;
  imageConcept?: string | null;
}): string {
  if (anchor.imageConcept?.trim()) return anchor.imageConcept.trim();
  if (anchor.tags.length) return anchor.tags.slice(0, 5).join(", ");
  if (anchor.description?.trim()) return anchor.description.trim().slice(0, 80);
  return "the picture";
}

type LibraryAnchorRow = {
  id: string;
  tags: unknown;
  s3Key: string;
  description: string | null;
  imageConcept: string | null;
  detectionResults: unknown;
  contexts?: string[] | null;
};

function toDomainAnchor(row: LibraryAnchorRow, _preferDino = false) {
  const dino = dinoLabels(row);
  const tags = dino.length >= 2 ? dino : writingImageTags(row);
  return {
    id: row.id,
    tags,
    s3Key: row.s3Key,
    description: row.description,
    imageConcept: row.imageConcept,
    detectionResults: row.detectionResults,
    contexts: row.contexts ?? [],
  };
}

const LIBRARY_ANCHOR_COLS = {
  id:               libraryTable.id,
  tags:             libraryTable.tags,
  s3Key:            libraryTable.s3Key,
  description:      libraryTable.description,
  imageConcept:     libraryTable.imageConcept,
  detectionResults: libraryTable.detectionResults,
  contexts:         libraryTable.contexts,
};

// ── Object-mastery helpers ─────────────────────────────────────────────────────

/**
 * Progressive decay schedule for object mastery.
 * Each correct identification lengthens the suppression window so frequently-
 * seen objects are held back for longer without requiring full SRS complexity.
 *
 *   correctCount = 1 → 7-day cooldown
 *   correctCount = 2 → 14-day cooldown
 *   correctCount ≥ 3 → 30-day cooldown
 *
 * To change the schedule in the future, edit only this function.
 */
function masterySuppressionDays(correctCount: number): number {
  if (correctCount <= 1) return 7;
  if (correctCount === 2) return 14;
  return 30;
}

function computeSuppressUntil(correctCount: number, from: Date): Date {
  const days = masterySuppressionDays(correctCount);
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Given a student + image + the full candidate label list, returns the subset
 * that are NOT currently suppressed by mastery.  Falls back to the full list
 * if filtering would leave fewer than `minLabels` candidates (so the student
 * always gets at least that many question targets).
 */
async function filterMasteredLabels(
  studentId: string,
  imageId: string,
  labels: string[],
  minLabels = 2,
): Promise<string[]> {
  if (labels.length <= minLabels) return labels; // nothing to filter

  const now = new Date();

  // Fetch active suppressions for this student+image combo
  const suppressed = await db
    .select({ label: studentObjectMasteryTable.label })
    .from(studentObjectMasteryTable)
    .where(
      and(
        eq(studentObjectMasteryTable.studentId, studentId),
        eq(studentObjectMasteryTable.imageId, imageId),
        inArray(studentObjectMasteryTable.label, labels),
        gt(studentObjectMasteryTable.suppressUntil, now),
      ),
    );

  const suppressedSet = new Set(suppressed.map((r) => r.label));
  const filtered = labels.filter((l) => !suppressedSet.has(l));

  // Preserve at least minLabels so the session always has enough question targets
  return filtered.length >= minLabels ? filtered : labels;
}

/**
 * Upsert mastery rows for every label in `labels`.
 * On conflict (same student + image + label) we increment correct_count,
 * update last_correct_at, and recompute suppress_until using the new count.
 */
async function recordObjectMastery(
  studentId: string,
  imageId: string,
  labels: string[],
): Promise<void> {
  if (labels.length === 0) return;

  const now = new Date();

  await db
    .insert(studentObjectMasteryTable)
    .values(
      labels.map((label) => ({
        studentId,
        imageId,
        label,
        correctCount: 1,
        lastCorrectAt: now,
        suppressUntil: computeSuppressUntil(1, now),
      })),
    )
    .onConflictDoUpdate({
      target: [
        studentObjectMasteryTable.studentId,
        studentObjectMasteryTable.imageId,
        studentObjectMasteryTable.label,
      ],
      set: {
        // Drizzle doesn't support "excluded.correct_count + 1" directly,
        // so we use a raw SQL expression to atomically increment.
        correctCount: sql`${studentObjectMasteryTable.correctCount} + 1`,
        lastCorrectAt: now,
        // suppress_until is recomputed from the NEW correct_count.
        // Schedule: 1→7d, 2→14d, 3+→30d encoded as a CASE in SQL so it's
        // atomic and doesn't require a read-modify-write round-trip.
        suppressUntil: sql`
          CASE
            WHEN ${studentObjectMasteryTable.correctCount} + 1 = 1 THEN ${now}::timestamptz + INTERVAL '7 days'
            WHEN ${studentObjectMasteryTable.correctCount} + 1 = 2 THEN ${now}::timestamptz + INTERVAL '14 days'
            ELSE                                                       ${now}::timestamptz + INTERVAL '30 days'
          END
        `,
      },
    });
}

// ── Detection deduplication ────────────────────────────────────────────────────
type DetectionBox = { x: number; y: number; width: number; height: number };
type Detection    = { label: string; score: number; box: DetectionBox };

function iou(a: DetectionBox, b: DetectionBox): number {
  const ax2 = a.x + a.width,  ay2 = a.y + a.height;
  const bx2 = b.x + b.width,  by2 = b.y + b.height;
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Remove lower-confidence detections whose boxes overlap a kept detection
 * by more than `threshold` IoU.  Keeps one representative per area so that
 * "umbrella" and "black umbrella" don't both appear as tap targets.
 */
function deduplicateDetections(detections: Detection[], threshold = 0.30): Detection[] {
  const sorted = [...detections].sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];
  for (const det of sorted) {
    if (!kept.some((k) => iou(det.box, k.box) > threshold)) {
      kept.push(det);
    }
  }
  return kept;
}

const router: IRouter = createApiRouter();

router.use("/students", requireAuth);

// Session end messages
function getSessionEndMessage(
  domain: string,
  levelDelta: number,
  scorePct: number,
  name: string,
  meetsTask?: boolean,
): string {
  const deltaLabel = levelDelta > 0 ? `+${levelDelta.toFixed(1)}` : levelDelta.toFixed(1);
  if (levelDelta > 0) {
    return `That's a wrap, ${name}. You moved ${deltaLabel} in ${capitalize(domain)} today. Keep it up. See you tomorrow.`;
  }
  const sessionStrong = domain === "writing"
    ? meetsTask === true
    : scorePct >= 70;
  if (sessionStrong) {
    return `Solid session, ${name}. Keep that up and you'll keep climbing. See you tomorrow.`;
  }
  if (levelDelta < 0) {
    return `Tough one, ${name}. You moved ${deltaLabel} in ${capitalize(domain)} — but that's how you find your edge. Come back tomorrow.`;
  }
  return `Keep going, ${name}. Every session counts. You'll get there. See you tomorrow.`;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// List sessions
router.get("/students/:studentId/sessions", requireStudentAccess("studentId"), async (req, res): Promise<void> => {
  const params = ListStudentSessionsParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, params.error.message);
    return;
  }

  const query = ListStudentSessionsQueryParams.safeParse(req.query);
  const limit = query.success ? (query.data.limit ?? 20) : 20;
  const domainFilter = query.success ? query.data.domain : undefined;

  const allSessions = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.studentId, params.data.studentId))
    .orderBy(sessionsTable.createdAt);

  const filtered = domainFilter
    ? allSessions.filter((s) => s.domain === domainFilter)
    : allSessions;

  const limited = filtered.slice(-limit);

  sendSuccess(
    res,
    limited.map((s) => ({
      id: s.id,
      studentId: s.studentId,
      domain: s.domain,
      sessionType: s.sessionType,
      levelStart: parseFloat(s.levelStart),
      levelEnd: s.levelEnd ? parseFloat(s.levelEnd) : null,
      scorePct: s.scorePct,
      completed: s.completed,
      durationSeconds: s.durationSeconds,
      createdAt: s.createdAt.toISOString(),
    }))
  );
});

// Start session
router.post("/students/:studentId/sessions/start", requireStudentAccess("studentId"), rateLimitStudentAi(), async (req, res): Promise<void> => {
  const params = StartSessionParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, params.error.message);
    return;
  }

  const parsed = StartSessionBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return;
  }

  const [student] = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.id, params.data.studentId))
    .limit(1);

  if (!student) {
    sendError(res, 404, "Student not found");
    return;
  }

  const access = await resolveStudentAccess(student.id);
  if (!access.canPractice) {
    sendError(
      res,
      403,
      access.accessReason === "guardian_active" || access.accessReason === "plan_inactive"
        ? "Your teacher's plan has expired or been cancelled. Please ask them to renew to continue practicing."
        : "An active subscription is required to start a practice session.",
    );
    return;
  }

  const assessment = student.stateAssessment as Assessment;
  const domain = parsed.data.domain as Domain;
  const tier: Tier = "academic";
  const configDomain = domain;
  const config = getAssessmentConfig(assessment);

  return withAiTokenContext(
    { studentId: student.id, domain, callKind: "content_generate" },
    async () => {

  // Get current level — ORDER BY updatedAt DESC so duplicates never serve a stale row
  const [levelRow] = await db
    .select()
    .from(studentLevelsTable)
    .where(
      and(
        eq(studentLevelsTable.studentId, student.id),
        eq(studentLevelsTable.domain, domain),
        eq(studentLevelsTable.tier, tier),
      )
    )
    .orderBy(desc(studentLevelsTable.updatedAt))
    .limit(1);

  const currentLevel = levelRow ? parseFloat(levelRow.currentLevel) : config.scale.min;
  const exitThreshold = getExitThreshold(assessment, configDomain);
  const gap = Math.max(0, exitThreshold - currentLevel);
  const mode = gap <= 0.5 && gap > 0 ? "exit_proximity" : "standard";

  // Get topics used in the last 24 h so Claude doesn't repeat them.
  // We also fetch `subject` so academic sessions can de-dup per-subject
  // (prevents a science topic from incorrectly blocking a math unit).
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  // Include incomplete sessions so abandoned/failed completes still dedupe prompts.
  const recentTopicRows = await db
    .select({ topic: sessionsTable.topic, subject: sessionsTable.subject })
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.studentId, student.id),
        eq(sessionsTable.domain, domain),
        eq(sessionsTable.tier, tier),
        sql`${sessionsTable.createdAt} >= ${yesterday}`,
      )
    );

  const topicsUsedToday = recentTopicRows.map((r) => r.topic).filter(Boolean) as string[];

  // Per-subject topic lists for academic de-dup (null subject rows are excluded).
  const topicsUsedBySubject: Record<string, string[]> = {};
  for (const row of recentTopicRows) {
    if (row.subject && row.topic) {
      (topicsUsedBySubject[row.subject] ??= []).push(row.topic);
    }
  }
  const microGapTypes: string[] = [];

  const isTelpas = assessment === "TELPAS";


  // ── Academic listening tier ───────────────────────────────────────────────
  if (domain === "listening") {
    // Retrieve last completed academic session to drive keyUse + subject rotation
    const recentAcademicSessions = await db
      .select({
        topic:          sessionsTable.topic,
        scorePct:       sessionsTable.scorePct,
        keyUse:         sessionsTable.keyUse,
        subject:        sessionsTable.subject,
        completed:      sessionsTable.completed,
        practiceReport: sessionsTable.practiceReport,
      })
      .from(sessionsTable)
      .where(and(
        eq(sessionsTable.studentId, student.id),
        eq(sessionsTable.domain, "listening"),
        eq(sessionsTable.tier, "academic"),
      ))
      .orderBy(desc(sessionsTable.createdAt))
      .limit(16);

    const lastAnyAcademic = recentAcademicSessions[0];
    const lastAcademicSession = recentAcademicSessions.find((s) => s.completed);
    const lastScore      = lastAcademicSession?.scorePct ?? 100;
    const persistedTopic: string | null = null;
    const lastKeyUse = lastAnyAcademic?.keyUse ?? lastAcademicSession?.keyUse ?? null;
    const priorPracticeReport = parsePracticeReport(lastAcademicSession?.practiceReport);

    const academicCtx = buildAcademicListeningContext(
      currentLevel,
      topicsUsedToday,
      persistedTopic,
      lastKeyUse,
      recentAcademicSessions,
    );

    // Curriculum unit + scenarios (science/math/etc.) � used for content AND library image search.
    const mathTopics = topicsUsedBySubject["math"]          ?? [];
    const sciTopics  = topicsUsedBySubject["science"]       ?? [];
    const ssTopics   = topicsUsedBySubject["social_studies"] ?? [];
    const elaTopics  = topicsUsedBySubject["ela"]           ?? [];

    const mathCtx = academicCtx.subject === "math"
      ? buildMathSessionContext(currentLevel, persistedTopic, mathTopics)
      : null;
    const sciCtx  = academicCtx.subject === "science"
      ? buildScienceSessionContext(currentLevel, persistedTopic, sciTopics)
      : null;
    const ssCtx   = academicCtx.subject === "social_studies"
      ? buildSocialStudiesSessionContext(currentLevel, persistedTopic, ssTopics)
      : null;
    const elaCtx  = academicCtx.subject === "ela"
      ? buildElaSessionContext(currentLevel, persistedTopic, elaTopics)
      : null;

    const subjectTopicLabel =
      mathCtx?.topicLabel ??
      sciCtx?.topicLabel ??
      ssCtx?.topicLabel ??
      elaCtx?.topicLabel ??
      null;
    const activeAcademicCtx = mathCtx ?? sciCtx ?? ssCtx ?? elaCtx;
    const librarySearch = buildLibrarySearchTopic({
      topicLabel:       subjectTopicLabel ?? "",
      unit:             activeAcademicCtx?.unit,
      tier3Vocabulary:  activeAcademicCtx?.tier3Vocabulary,
      scenarioExamples: activeAcademicCtx?.scenarioExamples,
    });

    // Levels 1�2: library compose � Claude picks photo + writes aligned audio_script (writing-style).
    let listeningLibraryCandidates: Awaited<
      ReturnType<typeof retrieveWritingLibraryCandidatesForSession>
    > = [];
    let listeningAnchor: ReturnType<typeof libraryCandidateToSessionAnchor> | null = null;
    let listeningAnchorUrl: string | null = null;

    let listeningExcludeImageIds: string[] = [];

    if (sessionUsesLibraryPhotos(currentLevel)) {
      const elpFloor = Math.floor(currentLevel);

      const listeningRecentImageRows = await db
        .select({ libraryImageId: sessionsTable.libraryImageId })
        .from(sessionsTable)
        .where(and(
          eq(sessionsTable.studentId, student.id),
          eq(sessionsTable.domain, "listening"),
          isNotNull(sessionsTable.libraryImageId),
        ))
        .orderBy(desc(sessionsTable.createdAt))
        .limit(8);
      listeningExcludeImageIds = [...new Set(
        listeningRecentImageRows
          .map((r) => r.libraryImageId)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      )];

      listeningLibraryCandidates = await retrieveListeningLibraryCandidatesForSession({
        academicSubject: academicCtx.subject,
        topic: librarySearch.topic || (subjectTopicLabel ?? `[${academicCtx.subjectLabel}]`),
        scenarioHint: librarySearch.scenarioHint ?? academicCtx.selectedTopic,
        excludeImageIds: listeningExcludeImageIds,
        level: elpFloor,
      });

      if (listeningLibraryCandidates.length === 0) {
        req.log.warn(
          {
            subject: academicCtx.subject,
            level: elpFloor,
            currentLevel,
            topic: librarySearch.topic,
            scenarioHint: librarySearch.scenarioHint,
          },
          "No library candidates for academic listening � text-only session (sync library catalog?)",
        );
      } else {
        req.log.info(
          {
            subject: academicCtx.subject,
            candidateCount: listeningLibraryCandidates.length,
            topic: librarySearch.topic,
          },
          "Library candidates found for academic listening (compose-first)",
        );
      }
    }

    // Resolved topic label for the session record
    const academicTopicLabel =
      subjectTopicLabel ??
      `[${academicCtx.subjectLabel}] ${academicCtx.selectedTopic}`;

    const [earlySession] = await db
      .insert(sessionsTable)
      .values({
        studentId:      student.id,
        sessionType:    parsed.data.sessionType,
        domain,
        tier,
        levelStart:     currentLevel.toString(),
        completed:      false,
        mode,
        topic:          academicTopicLabel,
        keyUse:         academicCtx.keyUse,
        subject:        academicCtx.subject,
        libraryImageId: null,
        imageTags:      null,
      })
      .returning();

    patchAiTokenContext({ sessionId: earlySession.id });

    let academicContent: unknown = null;
    try {
      if (mathCtx) {
        // ── Mathematics ──────────────────────────────────────────────────────
        academicContent = await generateAcademicMathListeningContent({
          level:                 academicCtx.elpLevel,
          fractionalLevel:       academicCtx.fractionalLevel,
          stepWithinLevel:       academicCtx.stepWithinLevel,
          complexityInstruction: academicCtx.complexityInstruction,
          oralFormat:            academicCtx.oralFormat,
          permittedFormats:      academicCtx.permittedFormats,
          framework:             academicCtx.framework,
          mathUnit:              mathCtx.unit,
          scenarioExamples:      mathCtx.scenarioExamples,
          tier3Vocabulary:       mathCtx.tier3Vocabulary,
          topic:                 mathCtx.topicLabel,
          isRetry:               persistedTopic !== null,
          lastSessionScore:      lastScore,
          libraryCandidates:     listeningLibraryCandidates,
          priorPracticeReport,
          frameworkContext:      mathCtx ?? undefined,
        });
      } else if (sciCtx) {
        // ── Science ──────────────────────────────────────────────────────────
        academicContent = await generateAcademicScienceListeningContent({
          level:                 academicCtx.elpLevel,
          fractionalLevel:       academicCtx.fractionalLevel,
          stepWithinLevel:       academicCtx.stepWithinLevel,
          complexityInstruction: academicCtx.complexityInstruction,
          oralFormat:            academicCtx.oralFormat,
          permittedFormats:      academicCtx.permittedFormats,
          framework:             academicCtx.framework,
          scienceUnit:           sciCtx.unit,
          scienceStrand:         sciCtx.strand,
          scenarioExamples:      sciCtx.scenarioExamples,
          tier3Vocabulary:       sciCtx.tier3Vocabulary,
          topic:                 sciCtx.topicLabel,
          isRetry:               persistedTopic !== null,
          lastSessionScore:      lastScore,
          libraryCandidates:     listeningLibraryCandidates,
          priorPracticeReport,
          frameworkContext:      sciCtx ?? undefined,
        });
      } else if (ssCtx) {
        // ── Social Studies ────────────────────────────────────────────────────
        academicContent = await generateAcademicSocialStudiesListeningContent({
          level:                 academicCtx.elpLevel,
          fractionalLevel:       academicCtx.fractionalLevel,
          stepWithinLevel:       academicCtx.stepWithinLevel,
          complexityInstruction: academicCtx.complexityInstruction,
          oralFormat:            academicCtx.oralFormat,
          permittedFormats:      academicCtx.permittedFormats,
          framework:             academicCtx.framework,
          ssUnit:                ssCtx.unit,
          ssStrand:              ssCtx.strand,
          scenarioExamples:      ssCtx.scenarioExamples,
          tier3Vocabulary:       ssCtx.tier3Vocabulary,
          topic:                 ssCtx.topicLabel,
          isRetry:               persistedTopic !== null,
          lastSessionScore:      lastScore,
          libraryCandidates:     listeningLibraryCandidates,
          priorPracticeReport,
          frameworkContext:      ssCtx ?? undefined,
        });
      } else if (elaCtx) {
        // ── English Language Arts ─────────────────────────────────────────────
        academicContent = await generateAcademicElaListeningContent({
          level:                 academicCtx.elpLevel,
          fractionalLevel:       academicCtx.fractionalLevel,
          stepWithinLevel:       academicCtx.stepWithinLevel,
          complexityInstruction: academicCtx.complexityInstruction,
          oralFormat:            academicCtx.oralFormat,
          permittedFormats:      academicCtx.permittedFormats,
          framework:             academicCtx.framework,
          elaUnit:               elaCtx.unit,
          elaGenre:              elaCtx.genre,
          scenarioExamples:      elaCtx.scenarioExamples,
          tier3Vocabulary:       elaCtx.tier3Vocabulary,
          topic:                 elaCtx.topicLabel,
          isRetry:               persistedTopic !== null,
          lastSessionScore:      lastScore,
          libraryCandidates:     listeningLibraryCandidates,
          priorPracticeReport,
          frameworkContext:      elaCtx ?? undefined,
        });
      }
    } catch (err) {
      if (isClaudeCapacityError(err)) {
        sendClaudeBusy(req, res, err);
        return;
      }
      req.log.error({ err }, "Academic listening content generation failed");
      sendError(res, 503, "Could not generate practice content. Please try again.");
      return;
    }

    if (!academicContent || typeof academicContent !== "object") {
      sendError(res, 503, "Could not generate practice content. Please try again.");
      return;
    }

    const composeSelectedId = (academicContent as { selectedLibraryImageId?: string | null })
      .selectedLibraryImageId;
    const composePicked = composeSelectedId
      ? listeningLibraryCandidates.find((c) => c.id === composeSelectedId) ?? null
      : pickBestLibraryCandidateForCurriculum(listeningLibraryCandidates, {
          unit:             activeAcademicCtx?.unit,
          topicLabel:       subjectTopicLabel ?? undefined,
          tier3Vocabulary:  activeAcademicCtx?.tier3Vocabulary,
          scenarioExamples: activeAcademicCtx?.scenarioExamples,
        });

    if (composePicked) {
      listeningAnchor = libraryCandidateToSessionAnchor(composePicked);
      listeningAnchorUrl = await resolveLibraryImageDisplayUrl(storage, {
        libraryImageId: composePicked.id,
        s3Key:          composePicked.s3Key,
      });
      await db
        .update(sessionsTable)
        .set({
          libraryImageId: composePicked.id,
          imageTags:      composePicked.tags,
        })
        .where(eq(sessionsTable.id, earlySession.id));
      incrementLibraryUseCount(composePicked.id).catch((err) => {
        req.log.warn({ err, imageId: composePicked.id }, "Failed to increment library use count");
      });
      req.log.info(
        {
          imageId: composePicked.id,
          concept: composePicked.imageConcept,
          selectedBy: composeSelectedId ? "claude" : "server-fallback",
        },
        "Library image resolved after compose",
      );
    }

    const listeningImageDescription = listeningAnchor
      ? listeningAnchor.imageConcept?.trim()
        || listeningAnchor.description?.trim()
        || listeningAnchor.tags.join(", ")
      : undefined;
    const listeningImageTags = listeningAnchor?.tags?.length
      ? listeningAnchor.tags
      : undefined;

    sendSuccess(res, {
      sessionId:    earlySession.id,
      domain,
      levelStart:   currentLevel,
      keyUse:       academicCtx.keyUse,
      subject:      academicCtx.subject,
      subjectLabel: academicCtx.subjectLabel,
      content:      {
        type: "listening",
        data: academicContent && typeof academicContent === "object"
          ? withSessionFramework(
              {
                ...(academicContent as object),
                useTapMode:      false,
                illustrationUrl: listeningAnchorUrl,
                ...(listeningImageTags?.length
                  ? { imageTags: listeningImageTags, tags: listeningImageTags }
                  : {}),
                ...(listeningImageDescription
                  ? { imageDescription: listeningImageDescription }
                  : {}),
              },
              academicCtx.framework,
            )
          : academicContent,
      },
      anchorImage: listeningAnchorUrl
        ? { url: listeningAnchorUrl, tags: listeningAnchor?.tags ?? [] }
        : null,
      mode,
      exitThreshold,
    });
    return;
  }

  // ── Non-listening domains ─────────────────────────────────────────────────
  // Fetch recent sessions for key-use / subject rotation (always fresh topic next session).
  const recentCompletedDomainSessions = await db
    .select({
      id:             sessionsTable.id,
      topic:          sessionsTable.topic,
      scorePct:       sessionsTable.scorePct,
      keyUse:         sessionsTable.keyUse,
      subject:        sessionsTable.subject,
      practiceReport: sessionsTable.practiceReport,
    })
    .from(sessionsTable)
    .where(and(
      eq(sessionsTable.studentId, student.id),
      eq(sessionsTable.domain, domain),
      eq(sessionsTable.tier, tier),
      eq(sessionsTable.completed, true),
    ))
    .orderBy(desc(sessionsTable.createdAt))
    .limit(16);

  // Include recent incomplete attempts so subject/KLU rotation history is accurate.
  const recentDomainSessions = await db
    .select({
      topic:    sessionsTable.topic,
      scorePct: sessionsTable.scorePct,
      keyUse:   sessionsTable.keyUse,
      subject:  sessionsTable.subject,
    })
    .from(sessionsTable)
    .where(and(
      eq(sessionsTable.studentId, student.id),
      eq(sessionsTable.domain, domain),
      eq(sessionsTable.tier, tier),
    ))
    .orderBy(desc(sessionsTable.createdAt))
    .limit(16);

  const lastDomainSession = recentCompletedDomainSessions[0];
  const domainPriorPracticeReport = parsePracticeReport(lastDomainSession?.practiceReport);

  const lastDomainKeyUse   = lastDomainSession?.keyUse   ?? null;
  const domainPersistedTopic: string | null = null;

  const lastWritingMetTask =
    domain === "writing" && lastDomainSession
      ? await resolveLastWritingMeetsTask(
          lastDomainSession.id ?? "",
          lastDomainSession.practiceReport,
          currentLevel,
        )
      : null;
  const writingSameKluRetry =
    domain === "writing" && lastWritingMetTask === false && Boolean(lastDomainKeyUse);

  const recentImageRows = await db
    .select({ libraryImageId: sessionsTable.libraryImageId })
    .from(sessionsTable)
    .where(and(
      eq(sessionsTable.studentId, student.id),
      eq(sessionsTable.domain, domain),
      isNotNull(sessionsTable.libraryImageId),
    ))
    .orderBy(desc(sessionsTable.createdAt))
    .limit(8);
  const excludeImageIds = [...new Set(
    recentImageRows
      .map((r) => r.libraryImageId)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  )];

  // Variables set inside the switch so the DB insert can store them.
  let sessionTopic:  string | null = null;
  let sessionKeyUse: string | null = null;
  let sessionSubject: string | null = null;
  let contentData: unknown;

  const academicDomain = (domain === "reading" || domain === "speaking" || domain === "writing")
    ? (domain as "reading" | "speaking" | "writing")
    : null;
  const academicIsRetry = false;
  const lastWritingSubject =
    academicDomain === "writing"
    && ACADEMIC_SUBJECT_LABELS[lastDomainSession?.subject as keyof typeof ACADEMIC_SUBJECT_LABELS]
      ? (lastDomainSession?.subject as "math" | "science" | "social_studies" | "ela")
      : null;
  let academicSubject: "math" | "science" | "social_studies" | "ela" | null = null;
  const lastAcademicSubject = asAcademicSubject(lastDomainSession?.subject);
  if (academicDomain === "writing") {
    if (writingSameKluRetry && lastDomainKeyUse) {
      academicSubject = pickSubjectForKeyUse(lastDomainKeyUse, recentDomainSessions, false);
    } else {
      academicSubject = nextWritingAcademicSubject(recentDomainSessions, academicIsRetry, lastWritingSubject);
    }
  } else if (academicDomain === "reading") {
    academicSubject = nextFrameworkAcademicSubject(
      recentDomainSessions,
      academicIsRetry,
      lastAcademicSubject,
      "interpretive",
    );
  } else if (academicDomain === "speaking") {
    academicSubject = nextFrameworkAcademicSubject(
      recentDomainSessions,
      academicIsRetry,
      lastAcademicSubject,
      "expressive",
    );
  } else if (academicDomain) {
    academicSubject = nextAcademicSubject(
      recentDomainSessions,
      academicIsRetry,
      lastAcademicSubject,
      () => KEY_USE_ROTATION,
    );
  }
  const writingFrozenKeyUse = writingSameKluRetry
    ? normalizeRotationKeyUse(lastDomainKeyUse)
    : null;
  const academicKeyUse = academicDomain === "writing" && academicSubject
    ? (writingFrozenKeyUse
        ?? nextWritingKeyUseForSubject(
          recentDomainSessions,
          academicSubject,
          academicIsRetry,
          lastDomainKeyUse,
        ))
    : academicDomain === "reading" && academicSubject
    ? nextFrameworkKeyUseForSubject(
        recentDomainSessions,
        academicSubject,
        academicIsRetry,
        lastDomainKeyUse,
        "interpretive",
      )
    : academicDomain === "speaking" && academicSubject
    ? nextFrameworkKeyUseForSubject(
        recentDomainSessions,
        academicSubject,
        academicIsRetry,
        lastDomainKeyUse,
        "expressive",
      )
    : academicDomain && academicSubject
    ? nextKeyUseForSubject(
        recentDomainSessions,
        academicSubject,
        academicIsRetry,
        lastDomainKeyUse,
        () => KEY_USE_ROTATION,
      )
    : null;
  const academicSubjectTopicList = academicSubject
    ? (topicsUsedBySubject[academicSubject] ?? topicsUsedToday)
    : topicsUsedToday;
  const recentAcademicScenarios = academicSubject
    ? academicSubjectTopicList
        .map(scenarioFromSessionTopic)
        .filter((s): s is string => Boolean(s))
    : [];
  const academicBundle = academicSubject
    ? buildAcademicSessionContext(
        academicSubject,
        currentLevel,
        domainPersistedTopic,
        academicSubjectTopicList,
        recentAcademicScenarios,
      )
    : null;
  const academicTopic = academicBundle?.topicLabel ?? null;
  const academicLayer = academicBundle && academicDomain && academicSubject
    ? buildAcademicContentLayer({
        subject: academicSubject,
        subjectLabel: ACADEMIC_SUBJECT_LABELS[academicSubject],
        domain: academicDomain,
        keyUse: academicKeyUse,
        framework: academicBundle,
      })
    : undefined;

  let preferredTopic = academicTopic;

  let domainAnchor: {
    id: string;
    tags: string[];
    s3Key: string;
    description?: string | null;
    imageConcept?: string | null;
    detectionResults?: unknown;
    contexts?: string[];
  } | null = null;
  let domainAnchorUrl: string | null = null;
  const elpFloor = Math.floor(currentLevel);
  const usesLibraryPhotos = sessionUsesLibraryPhotos(currentLevel);
  let sessionLibraryCandidates: Awaited<ReturnType<typeof retrieveWritingLibraryCandidatesForSession>> = [];
  if (usesLibraryPhotos && academicSubject && academicDomain && academicDomain !== "writing") {
    try {
      const domainLibrarySearch = buildLibrarySearchTopic({
        topicLabel:       academicTopic ?? "",
        unit:             academicBundle?.unit,
        tier3Vocabulary:  academicBundle?.tier3Vocabulary,
        scenarioExamples: academicBundle?.scenarioExamples,
      });
      sessionLibraryCandidates = await retrieveWritingLibraryCandidatesForSession({
        academicSubject,
        topic: domainLibrarySearch.topic || (preferredTopic ?? academicTopic ?? `[${ACADEMIC_SUBJECT_LABELS[academicSubject]}]`),
        scenarioHint: domainLibrarySearch.scenarioHint,
        excludeImageIds,
        level: elpFloor,
      });
      if (sessionLibraryCandidates.length === 0) {
        req.log.warn(
          { subject: academicSubject, domain, level: elpFloor },
          "No library candidates � text-only session",
        );
      }

      if (sessionLibraryCandidates.length > 0) {
        const picked = resolveWritingLibrarySelectionWithPolicy(
          null,
          sessionLibraryCandidates,
          elpFloor,
        );
        if (picked) {
          domainAnchor = libraryCandidateToSessionAnchor(picked);
          if (domain !== "speaking") {
            preferredTopic = topicFromAnchor(domainAnchor);
          }
          domainAnchorUrl = await storage.getPresignedGetUrl(picked.s3Key, 3600).catch(() => null);
          req.log.info(
            {
              imageId: picked.id,
              tags: picked.tags,
              topic: preferredTopic,
              domain,
              matchTier: picked.matchTier,
            },
            "Library image selected for early-band session",
          );
        }
      }
    } catch (err) {
      req.log.warn({ err }, "Library candidate lookup failed, continuing without photo");
    }
  }

  const hasLibraryImage = usesLibraryPhotos && Boolean(domainAnchorUrl);

  try {
    switch (domain as Domain) {
      case "reading": {
        if (!academicSubject) throw new Error("Reading session requires academic subject");
        const readingCtx = buildReadingContext(
          currentLevel,
          topicsUsedToday,
          domainPersistedTopic,
          lastFrameworkKeyUseForSubject(recentDomainSessions, academicSubject),
          academicSubject,
          academicKeyUse,
        );
        sessionTopic  = preferredTopic ?? academicTopic ?? readingCtx.selectedTopic;
        sessionKeyUse = readingCtx.keyUse;
        sessionSubject = academicSubject;
        contentData   = await generateReadingContent({
          assessment,
          level:                  readingCtx.elpLevel,
          fractionalLevel:        readingCtx.fractionalLevel,
          stepWithinLevel:        readingCtx.stepWithinLevel,
          complexityInstruction:  readingCtx.complexityInstruction,
          textFormat:             readingCtx.textFormat,
          permittedFormats:       readingCtx.permittedFormats,
          framework:              readingCtx.framework,
          topic:                  sessionTopic,
          gradeBand:              student.gradeBand,
          homeLanguage:           student.homeLanguage ?? undefined,
          mode,
          academicContentLayer:   academicLayer,
          academicSubject:        academicSubject ?? undefined,
          academicUnit:           academicBundle?.unit,
          scenarioExamples:       academicBundle?.scenarioExamples,
          tier3Vocabulary:        academicBundle?.tier3Vocabulary,
          academicFramework:      academicBundle ?? undefined,
          questionCount:          readingCtx.questionCount,
          passageWordMax:         readingCtx.passageWordMax,
          hasLibraryImage,
          imageTags:              domainAnchor?.tags,
          imageDescription:       domainAnchor?.description ?? undefined,
          imageConcept:           domainAnchor?.imageConcept ?? undefined,
          priorPracticeReport:    domainPriorPracticeReport,
        });
        contentData = withSessionFramework(contentData, readingCtx.framework);
        break;
      }
      case "speaking": {
        if (!academicSubject) throw new Error("Speaking session requires academic subject");
        const speakingCtx = buildSpeakingContext(
          currentLevel,
          topicsUsedToday,
          domainPersistedTopic,
          lastFrameworkKeyUseForSubject(recentDomainSessions, academicSubject),
          isTelpas,
          academicSubject,
          academicKeyUse,
        );
        sessionTopic  = preferredTopic ?? academicTopic ?? speakingCtx.selectedTopic;
        sessionKeyUse = speakingCtx.keyUse;
        sessionSubject = academicSubject;
        contentData   = await generateSpeakingContent({
          assessment,
          level:                  speakingCtx.elpLevel,
          fractionalLevel:        speakingCtx.fractionalLevel,
          stepWithinLevel:        speakingCtx.stepWithinLevel,
          complexityInstruction:  speakingCtx.complexityInstruction,
          discourseType:          speakingCtx.discourseType,
          responseLength:         speakingCtx.responseLength,
          allowedPromptTypes:     speakingCtx.allowedPromptTypes,
          targetSeconds:          speakingCtx.targetSeconds,
          framework:              speakingCtx.framework,
          topic:                  sessionTopic,
          gradeBand:              student.gradeBand,
          mode,
          isTelpas,
          academicContentLayer:   academicLayer,
          academicSubject:        academicSubject ?? undefined,
          academicUnit:           academicBundle?.unit,
          scenarioExamples:       academicBundle?.scenarioExamples,
          tier3Vocabulary:        academicBundle?.tier3Vocabulary,
          academicFramework:      academicBundle ?? undefined,
          hasLibraryImage,
          imageTags:              domainAnchor?.tags,
          imageDescription:       domainAnchor?.description ?? undefined,
          imageConcept:           domainAnchor?.imageConcept ?? undefined,
          priorPracticeReport:    domainPriorPracticeReport,
        });
        contentData = withSessionFramework(contentData, speakingCtx.framework);
        break;
      }
      case "writing": {
        if (!academicSubject) {
          throw new Error("Writing requires an academic subject");
        }
        const subjectTopicsUsed = topicsUsedBySubject[academicSubject] ?? topicsUsedToday;
        const writingCtx = buildWritingContext(
          currentLevel,
          subjectTopicsUsed,
          domainPersistedTopic,
          lastWritingKeyUseForSubject(recentDomainSessions, academicSubject),
          academicSubject,
          writingFrozenKeyUse,
        );

        const writingAcademic = academicBundle ?? buildAcademicSessionContext(
          academicSubject,
          currentLevel,
          domainPersistedTopic,
          subjectTopicsUsed,
          recentAcademicScenarios,
        );
        const academicUnit = writingAcademic.unit;
        const scenarioExamples = writingAcademic.scenarioExamples;
        const tier3Vocabulary = writingAcademic.tier3Vocabulary;
        const topicLabel = writingAcademic.topicLabel ?? academicTopic ?? writingCtx.selectedTopic;

        sessionTopic = topicLabel;
        sessionKeyUse = writingCtx.keyUse;
        sessionSubject = academicSubject;

        const libraryCandidates = usesLibraryPhotos
          ? await retrieveWritingLibraryCandidatesForSession({
              academicSubject,
              topic: topicLabel,
              scenarioHint: scenarioExamples?.[0],
              excludeImageIds,
              level: writingCtx.elpLevel,
            })
          : [];
        if (usesLibraryPhotos && libraryCandidates.length === 0) {
          req.log.warn(
            { subject: academicSubject, topic: topicLabel, level: writingCtx.elpLevel },
            "Writing: no library candidates � text-only session",
          );
        }

        const writingContent = await generateWritingContent({
          assessment,
          level:                  writingCtx.elpLevel,
          fractionalLevel:        writingCtx.fractionalLevel,
          stepWithinLevel:        writingCtx.stepWithinLevel,
          complexityInstruction:  writingCtx.complexityInstruction,
          taskType:               writingCtx.taskType,
          minSentences:           writingCtx.minSentences,
          framework:              writingCtx.framework,
          topic:                  topicLabel,
          gradeBand:              student.gradeBand,
          mode,
          academicContentLayer:   academicLayer,
          academicSubject,
          academicUnit,
          scenarioExamples,
          tier3Vocabulary,
          academicFramework: writingAcademic,
          libraryCandidates,
          priorPracticeReport:    domainPriorPracticeReport,
        });

        const selectedLibrary = resolveWritingLibrarySelectionWithPolicy(
          writingContent.selectedLibraryImageId,
          libraryCandidates,
          writingCtx.elpLevel,
        );

        if (selectedLibrary) {
          domainAnchor = libraryCandidateToSessionAnchor(selectedLibrary);
          domainAnchorUrl = await storage.getPresignedGetUrl(selectedLibrary.s3Key, 3600).catch(() => null);
          req.log.info(
            {
              imageId: selectedLibrary.id,
              tags: selectedLibrary.tags,
              topic: topicLabel,
              subject: academicSubject,
              matchTier: selectedLibrary.matchTier,
            },
            "Writing library image selected by compose step",
          );
        }

        const { selectedLibraryImageId: _omit, ...writingPayload } = writingContent;
        contentData = withSessionFramework(writingPayload, writingCtx.framework);
        break;
      }
    }
  } catch (err) {
    if (isClaudeCapacityError(err)) {
      sendClaudeBusy(req, res, err);
      return;
    }
    req.log.error({ err, domain }, "Content generation failed");
    sendError(res, 503, "Could not generate practice content. Please try again.");
    return;
  }

  if (!contentData || typeof contentData !== "object") {
    sendError(res, 503, "Could not generate practice content. Please try again.");
    return;
  }

  // Create session record — topic and keyUse are now stored for all domains
  // so the next session can rotate key uses and avoid repeating topics.
  const [session] = await db
    .insert(sessionsTable)
    .values({
      studentId:   student.id,
      sessionType: parsed.data.sessionType,
      domain,
      tier,
      levelStart:  currentLevel.toString(),
      completed:   false,
      mode,
      topic:       sessionTopic,
      keyUse:      sessionKeyUse,
      subject:     sessionSubject,
      libraryImageId: domainAnchor?.id ?? null,
      imageTags:      domainAnchor?.tags ?? null,
    })
    .returning();

  await attachRecentContentGenerateCallToSession({
    studentId: student.id,
    sessionId: session.id,
    domain,
  });

  if (usesLibraryPhotos && domainAnchor?.id) {
    incrementLibraryUseCount(domainAnchor.id).catch((err) => {
      req.log.warn({ err, imageId: domainAnchor.id }, "Failed to increment library use count");
    });
  }

  if (contentData && typeof contentData === "object") {
    const row = contentData as Record<string, unknown>;
    if (domainAnchorUrl) row.illustrationUrl = domainAnchorUrl;
    if (domainAnchor?.tags?.length) {
      row.imageTags = domainAnchor.tags;
      row.tags = domainAnchor.tags;
    }
    if (domainAnchor?.description) row.imageDescription = domainAnchor.description;
    if (domainAnchor?.detectionResults) row.detectionResults = domainAnchor.detectionResults;
    if (sessionTopic) row.topic = sessionTopic;
    if (sessionKeyUse) row.keyUse = sessionKeyUse;
  }

  sendSuccess(res, {
    sessionId: session.id,
    domain,
    levelStart: currentLevel,
    keyUse: sessionKeyUse,
    content: {
      type: domain,
      data: contentData,
    },
    anchorImage: domainAnchorUrl
      ? { url: domainAnchorUrl, tags: domainAnchor?.tags ?? [] }
      : null,
    mode,
    telpasTimerRequired: isTelpas && domain === "speaking",
  }, 201);

  });
});

// Complete session
router.post("/students/:studentId/sessions/:sessionId/complete", requireStudentAccess("studentId"), async (req, res): Promise<void> => {
  const params = CompleteSessionParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, params.error.message);
    return;
  }

  const parsed = CompleteSessionBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return;
  }

  const [student] = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.id, params.data.studentId))
    .limit(1);

  if (!student) {
    sendError(res, 404, "Student not found");
    return;
  }

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.id, params.data.sessionId),
        eq(sessionsTable.studentId, student.id)
      )
    )
    .limit(1);

  if (!session) {
    sendError(res, 404, "Session not found");
    return;
  }

  const assessment = student.stateAssessment as Assessment;
  const domain             = session.domain as Domain;
  const tier               = (session.tier ?? "academic") as Tier;
  const completionConfigDomain = domain; // domain is always a core Domain — no mapping needed
  const scorePct = parsed.data.scorePct;

  // Get current level row — ORDER BY updatedAt DESC so duplicates never serve a stale row
  const [levelRow] = await db
    .select()
    .from(studentLevelsTable)
    .where(
      and(
        eq(studentLevelsTable.studentId, student.id),
        eq(studentLevelsTable.domain, domain),
        eq(studentLevelsTable.tier, tier),
      )
    )
    .orderBy(desc(studentLevelsTable.updatedAt))
    .limit(1);

  const currentLevel = levelRow ? parseFloat(levelRow.currentLevel) : 1.0;
  const exitThreshold = getExitThreshold(assessment, completionConfigDomain);
  const consecutiveFail = levelRow ? parseInt(levelRow.consecutiveFailCount) : 0;

  const config = getAssessmentConfig(assessment);
  const writingRubricScore = domain === "writing"
    ? extractWritingRubricFromAnswers(parsed.data.answers)
    : null;
  const writingMinSentences = domain === "writing"
    ? extractWritingMinSentencesFromAnswers(parsed.data.answers)
    : 1;

  const interpretiveResult = isInterpretiveDomain(domain)
    ? computeInterpretiveScore(parsed.data.answers, currentLevel)
    : null;

  req.log.info(
    {
      stage: "session-complete",
      domain,
      accessRubricExpected: domain === "speaking" || domain === "writing" || Boolean(interpretiveResult),
      interpretiveScore: interpretiveResult?.scorePoint ?? null,
      interpretiveWeightedPct: interpretiveResult?.weightedPct ?? null,
      interpretiveMeetsTask: interpretiveResult?.meetsTask ?? null,
    },
    "session submit — end-of-session feedback",
  );

  let attemptFeedback;
  try {
    const completionSubject = asAcademicSubject(session.subject);
    let completionFramework: Record<string, unknown> | null = null;
    if (completionSubject && session.keyUse) {
      const mode = domain === "speaking" || domain === "writing" ? "expressive" : "interpretive";
      completionFramework = serializeFrameworkForFeedback(selectFrameworkTask({
        level: Math.floor(currentLevel),
        keyUse: session.keyUse,
        mode,
        academicSubject: completionSubject,
      }));
    }
    attemptFeedback = await withAiTokenContext(
      {
        studentId: student.id,
        sessionId: session.id,
        domain,
        callKind: "attempt_feedback",
      },
      () => generateAttemptFeedback({
        domain,
        tier,
        level: currentLevel,
        scorePct,
        topic: session.topic,
        keyUse: session.keyUse,
        framework: completionFramework,
        interpretiveScore: interpretiveResult,
        answers: parsed.data.answers ?? [],
      }),
    );
  } catch (err) {
    req.log.error(
      {
        err,
        stage: "session-complete",
        domain,
        code: isClaudeCapacityError(err) ? err.code : "ATTEMPT_FEEDBACK_FAILED",
        jobId: isClaudeCapacityError(err) ? err.jobId : null,
        queue: getClaudeQueueSnapshot(),
      },
      "End-of-session coach failed — using fallback notes",
    );
    attemptFeedback = {
      summary: "You finished this practice. Review missed items and try again soon.",
      mistakes: [],
      strengths: ["You completed the session."],
      nextSteps: ["Practice the same skill again tomorrow."],
      coachForNextSession: "Give another similar job at this same English level. Keep the WIDA factors. Practice clear, complete answers.",
      recommendedLevel: null,
    };
  }

  const writingMeetsTask = domain === "writing"
    ? extractWritingMeetsTaskFromAnswers(
        parsed.data.answers,
        writingRubricScore,
        currentLevel,
        writingMinSentences,
      )
    : undefined;

  const interpretiveMeetsTask = interpretiveResult?.meetsTask;

  const levelUpdate = calculatePerformanceLevelUpdate({
    domain,
    currentLevel,
    exitThreshold,
    minLevel: config.scale.min,
    scorePct,
    recommendedLevel: attemptFeedback.recommendedLevel,
    rubricScore: writingRubricScore,
    interpretiveScore: interpretiveResult?.scorePoint ?? null,
    interpretiveMeetsTask,
    meetsTask: domain === "writing"
      ? writingMeetsTask
      : interpretiveMeetsTask ?? scorePct >= 70,
    minSentences: writingMinSentences,
    consecutiveFail,
  });

  req.log.info(
    {
      domain,
      recommendedLevel: attemptFeedback.recommendedLevel,
      writingRubricScore,
      interpretiveScore: interpretiveResult?.scorePoint ?? null,
      interpretiveWeightedPct: interpretiveResult?.weightedPct ?? null,
      consecutiveFailIn: consecutiveFail,
      consecutiveFailOut: levelUpdate.newConsecutiveFail,
      levelBefore: currentLevel,
      levelAfter: levelUpdate.newLevel,
      delta: levelUpdate.delta,
    },
    "performance-based level update",
  );

  // Upsert level row — ON CONFLICT handles both first-time inserts and race conditions
  // without ever creating duplicate (student_id, domain, tier) rows.
  await db
    .insert(studentLevelsTable)
    .values({
      studentId:            student.id,
      domain,
      tier,
      currentLevel:         levelUpdate.newLevel.toString(),
      exitThreshold:        exitThreshold.toString(),
      atExit:               levelUpdate.atExit,
      consecutivePassCount: levelUpdate.newConsecutivePass.toString(),
      consecutiveFailCount: levelUpdate.newConsecutiveFail.toString(),
      source:               "practice",
      updatedAt:            new Date(),
    })
    .onConflictDoUpdate({
      target: [studentLevelsTable.studentId, studentLevelsTable.domain, studentLevelsTable.tier],
      set: {
        currentLevel:         levelUpdate.newLevel.toString(),
        atExit:               levelUpdate.atExit,
        consecutivePassCount: levelUpdate.newConsecutivePass.toString(),
        consecutiveFailCount: levelUpdate.newConsecutiveFail.toString(),
        updatedAt:            new Date(),
      },
    });

  // Update session record — score_pct is an integer column, so round
  await db
    .update(sessionsTable)
    .set({
      completed: true,
      scorePct: Math.round(scorePct),
      levelEnd: levelUpdate.newLevel.toString(),
      durationSeconds: parsed.data.durationSeconds,
      weakTypes: parsed.data.weakTypes || [],
    })
    .where(eq(sessionsTable.id, session.id));

  // Persist per-question attempt data (question content + submitted answer)
  if (parsed.data.answers && parsed.data.answers.length > 0) {
    await db.insert(sessionAnswersTable).values(
      parsed.data.answers.map((a: (typeof parsed.data.answers)[number], i: number) => ({
        sessionId: session.id,
        questionIndex: i,
        question: a.question,
        content: a.content ?? null,
        submittedAnswer: a.submittedAnswer ?? null,
        correct: a.correct,
      }))
    );
  }

  // ── Object mastery — record correct identifications ──────────────────────
  // Only for image-library sessions (levels 0–2) that the student passed.
  // A score ≥ 70 % means they demonstrated understanding of the objects shown.
  // The suppress_until window grows with each correct encounter (7 / 14 / 30 days)
  // so repeated practice gradually lengthens the cooldown without full SRS overhead.
  if (
    session.libraryImageId &&
    Array.isArray(session.imageTags) &&
    (session.imageTags as string[]).length > 0 &&
    scorePct >= 70
  ) {
    await recordObjectMastery(
      student.id,
      session.libraryImageId,
      session.imageTags as string[],
    ).catch((err) => {
      // Non-fatal: mastery tracking failure should not block session completion
      console.error("object-mastery upsert failed", { sessionId: session.id, err });
    });
  }

  // Calculate XP earned
  let xpEarned = 10; // base XP for completing a session
  if (scorePct >= 80) xpEarned += 10; // accuracy bonus
  if (scorePct >= 90) xpEarned += 5; // excellence bonus
  if (scorePct === 100) xpEarned += 10; // perfect bonus
  if (levelUpdate.delta > 0) xpEarned += 15; // level-up bonus

  // Update streak
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const lastDate = student.lastSessionDate?.toISOString().split("T")[0];
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  let newStreak = student.currentStreak;
  let streakUpdated = false;
  let streakBonus = 0;

  if (lastDate !== today) {
    if (lastDate === yesterday) {
      newStreak = student.currentStreak + 1;
      streakUpdated = true;
    } else if (!lastDate) {
      newStreak = 1;
      streakUpdated = true;
    } else {
      if (student.streakShieldAvailable) {
        newStreak = student.currentStreak;
        await db
          .update(studentsTable)
          .set({
            currentStreak: newStreak,
            longestStreak: Math.max(student.longestStreak, newStreak),
            streakShieldAvailable: false,
            lastSessionDate: now,
            totalXp: student.totalXp + xpEarned,
          })
          .where(eq(studentsTable.id, student.id));
      } else {
        newStreak = 1;
        streakUpdated = true;
      }
    }

    // Streak milestone bonuses
    if (newStreak === 3) streakBonus = 10;
    else if (newStreak === 7) streakBonus = 25;
    else if (newStreak === 14) streakBonus = 50;
    else if (newStreak === 30) streakBonus = 100;
    else if (newStreak > 0 && newStreak % 50 === 0) streakBonus = 200;

    xpEarned += streakBonus;

    if (streakUpdated) {
      await db
        .update(studentsTable)
        .set({
          currentStreak: newStreak,
          longestStreak: Math.max(student.longestStreak, newStreak),
          lastSessionDate: now,
          totalXp: student.totalXp + xpEarned,
        })
        .where(eq(studentsTable.id, student.id));
    }
  } else {
    // Same day, still award XP
    await db
      .update(studentsTable)
      .set({ totalXp: student.totalXp + xpEarned })
      .where(eq(studentsTable.id, student.id));
  }

  const newTotalXp = student.totalXp + xpEarned;

  const message = getSessionEndMessage(
    domain,
    levelUpdate.delta,
    scorePct,
    student.name,
    domain === "writing"
      ? writingMeetsTask
      : interpretiveMeetsTask,
  );

  const reportLevel = levelUpdate.newLevel;
  const practiceReport = buildPracticeReport({
    domain,
    level: Math.floor(reportLevel),
    fractionalLevel: reportLevel,
    stepWithinLevel: fractionalStepWithinLevel(reportLevel),
    scorePct,
    meetsTask: domain === "writing"
      ? writingMeetsTask
      : interpretiveMeetsTask,
    interpretiveScorePoint: interpretiveResult?.scorePoint,
    keyUse: session.keyUse,
    topic: session.topic,
    feedback: attemptFeedback,
  });
  await db
    .update(sessionsTable)
    .set({ practiceReport })
    .where(eq(sessionsTable.id, session.id));

  await upsertStudentPracticeSuggestion({
    studentId: student.id,
    domain,
    sessionId: session.id,
    feedback: attemptFeedback,
  }).catch((err) => {
    req.log.warn({ err, sessionId: session.id, domain }, "practice suggestion upsert failed");
  });

  const aiTokenUsage = await getSessionTokenUsage(session.id);

  sendSuccess(res, {
    sessionId: session.id,
    scorePct,
    levelBefore: currentLevel,
    levelAfter: levelUpdate.newLevel,
    levelChanged: levelUpdate.changed,
    levelDelta: levelUpdate.delta,
    message,
    streakUpdated,
    newStreak,
    domainAtExit: levelUpdate.atExit,
    xpEarned,
    streakBonus,
    totalXp: newTotalXp,
    aiTokenUsage: {
      inputTokens:  aiTokenUsage.aiInputTokens,
      outputTokens: aiTokenUsage.aiOutputTokens,
      totalTokens:  aiTokenUsage.aiTotalTokens,
      callCount:    aiTokenUsage.aiCallCount,
    },
    attemptFeedback: attemptFeedback ? filterAttemptFeedbackForStudent(attemptFeedback) : attemptFeedback,
    interpretiveScore: interpretiveResult
      ? {
          scorePoint: interpretiveResult.scorePoint,
          label: interpretiveResult.label,
          weightedPct: interpretiveResult.weightedPct,
          meetsTask: interpretiveResult.meetsTask,
        }
      : null,
  });
});

// List per-question answers for a completed session
router.get("/students/:studentId/sessions/:sessionId/answers", requireStudentAccess("studentId"), async (req, res): Promise<void> => {
  const params = ListSessionAnswersParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, params.error.message);
    return;
  }

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.id, params.data.sessionId),
        eq(sessionsTable.studentId, params.data.studentId)
      )
    )
    .limit(1);

  if (!session) {
    sendError(res, 404, "Session not found");
    return;
  }

  const rows = await db
    .select()
    .from(sessionAnswersTable)
    .where(eq(sessionAnswersTable.sessionId, session.id))
    .orderBy(sessionAnswersTable.questionIndex);

  sendSuccess(
    res,
    rows.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      questionIndex: r.questionIndex,
      question: r.question,
      content: r.content,
      submittedAnswer: r.submittedAnswer,
      correct: r.correct,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

// Writing feedback
router.post("/students/:studentId/writing/feedback", requireStudentAccess("studentId"), rateLimitStudentAi(), async (req, res): Promise<void> => {
  const params = GetWritingFeedbackParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, params.error.message);
    return;
  }

  const parsed = GetWritingFeedbackBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return;
  }

  const [student] = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.id, params.data.studentId))
    .limit(1);

  if (!student) {
    sendError(res, 404, "Student not found");
    return;
  }

  const assessment = student.stateAssessment as Assessment;
  const [levelRow] = await db
    .select()
    .from(studentLevelsTable)
    .where(
      and(
        eq(studentLevelsTable.studentId, student.id),
        eq(studentLevelsTable.domain, "writing"),
        eq(studentLevelsTable.tier, "academic"),
      )
    )
    .orderBy(desc(studentLevelsTable.updatedAt))
    .limit(1);

  const config = getAssessmentConfig(assessment);
  const currentLevel = levelRow ? parseFloat(levelRow.currentLevel) : config.scale.min;
  const exitThreshold = getExitThreshold(assessment, "writing");
  const gap = Math.max(0, exitThreshold - currentLevel);
  const mode = gap <= 0.5 && gap > 0 ? "exit_proximity" : "standard";

  let feedback;
  try {
    feedback = await withAiTokenContext(
      {
        studentId: params.data.studentId,
        domain:    "writing",
        callKind:  "feedback",
      },
      () => getWritingFeedback({
        prompt:          parsed.data.prompt,
        studentResponse: parsed.data.response,
        level:           parsed.data.level,
        taskType:        "",
        minSentences:    parsed.data.level <= 2 ? 3 : parsed.data.level <= 3 ? 4 : parsed.data.level <= 4 ? 6 : parsed.data.level <= 5 ? 8 : 12,
      }),
    );
  } catch (err) {
    if (isClaudeCapacityError(err)) {
      sendClaudeBusy(req, res, err);
      return;
    }
    throw err;
  }

  sendSuccess(res, filterWritingFeedbackForStudent(feedback));
});

router.post("/students/:studentId/item-feedback", requireStudentAccess("studentId"), rateLimitStudentAi(), async (req, res): Promise<void> => {
  const studentId = typeof req.params.studentId === "string" ? req.params.studentId : "";
  if (!studentId) {
    sendError(res, 400, "Missing student id");
    return;
  }

  const parsed = ItemFeedbackBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ issues: parsed.error.issues, body: req.body }, "item-feedback validation failed");
    sendError(res, 400, "Missing or invalid item feedback fields");
    return;
  }

  if (parsed.data.format === "writing" || parsed.data.format === "speaking") {
    req.log.info(
      {
        stage: "item-feedback HTTP in",
        format: parsed.data.format,
        level: parsed.data.level,
        studentAnswer: parsed.data.studentAnswer,
        prompt: parsed.data.prompt ?? parsed.data.question,
        scaffold: parsed.data.scaffold ?? null,
        wordBank: parsed.data.options ?? [],
        imageTags: parsed.data.imageTags ?? [],
        minSentences: parsed.data.minSentences ?? null,
        hasFramework: Boolean(parsed.data.framework),
        keyUse: parsed.data.keyUse ?? null,
      },
      "WRITING_FEEDBACK_HTTP",
    );
  }

  let feedback;
  try {
    feedback = await withAiTokenContext(
      {
        studentId,
        sessionId: parsed.data.sessionId,
        domain:    parsed.data.domain,
        callKind:  "item_feedback",
      },
      () => generateItemFeedback(normalizeItemFeedbackBody(parsed.data)),
    );
  } catch (err) {
    if (isClaudeCapacityError(err)) {
      sendClaudeBusy(req, res, err);
      return;
    }
    throw err;
  }
  if (parsed.data.format === "writing" || parsed.data.format === "speaking") {
    req.log.info(
      {
        stage: "item-feedback HTTP out",
        format: parsed.data.format,
        meetsTask: feedback.meetsTask,
        judgment: feedback.judgment,
        spokenText: feedback.spokenText,
      },
      "WRITING_FEEDBACK_HTTP_OUT",
    );
  }
  sendSuccess(res, filterItemFeedbackForStudent(feedback));
});

export default router;
