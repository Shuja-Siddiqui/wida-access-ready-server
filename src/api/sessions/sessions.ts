import { Router, type IRouter } from "express";
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
import { ObjectStorageService } from "../../lib/objectStorage";
import {
  buildListeningContext,
  buildAcademicListeningContext,
  ACADEMIC_SUBJECT_LABELS,
} from "../../lib/listeningContentEngine";
import { buildReadingContext } from "../../lib/readingContentEngine";
import { buildSpeakingContext } from "../../lib/speakingContentEngine";
import { buildWritingContext } from "../../lib/writingContentEngine";
import { getContentPortrayal } from "../../lib/listeningContentEngine";
import {
  nextKeyUse,
  pickSubjectForKeyUse,
  buildAcademicContentLayer,
  pickAcademicTopicLabel,
} from "../../lib/academicSubjectContent";
import {
  buildMathSessionContext,
  MATH_PERMITTED_FORMATS,
} from "../../lib/academicMathEngine";
import {
  buildScienceSessionContext,
  SCIENCE_PERMITTED_FORMATS,
} from "../../lib/academicScienceEngine";
import {
  buildSocialStudiesSessionContext,
  SS_PERMITTED_FORMATS,
} from "../../lib/academicSocialStudiesEngine";
import {
  buildElaSessionContext,
  ELA_PERMITTED_FORMATS,
} from "../../lib/academicElaEngine";
import {
  generateListeningContent,
  generateAcademicMathListeningContent,
  generateAcademicScienceListeningContent,
  generateAcademicSocialStudiesListeningContent,
  generateAcademicElaListeningContent,
  generateAcademicImageTapContent,
  generateReadingContent,
  generateSpeakingContent,
  generateWritingContent,
  getWritingFeedback,
  generateAttemptFeedback,
  generateItemFeedback,
  generateImagePassageContent,
} from "../../lib/claude";
import { SUBJECT_VISUAL_ANCHOR_TAGS } from "../../lib/claude/prompts";
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
import { calculateLevelUpdate } from "../../lib/adaptive-engine";
// (generateListeningContent and others imported above alongside generateImagePassageContent)
import { sendError, sendSuccess } from "../../lib/api-response";
import { requireAuth, requireStudentAccess } from "../../middlewares/auth";
import { resolveStudentAccess } from "../../lib/subscription";

const storage = new ObjectStorageService();

const ItemFeedbackBody = z.object({
  domain: z.string().min(1),
  level: z.number(),
  format: z.enum(["picture", "selected_response", "speaking", "writing"]),
  question: z.string(),
  studentAnswer: z.string(),
  correctAnswer: z.string().optional(),
  passage: z.string().optional(),
  imageDescription: z.string().optional(),
  imageTags: z.array(z.string()).optional(),
  targetObject: z.string().optional(),
  prompt: z.string().optional(),
  scaffold: z.string().optional(),
  canDo: z.string().optional(),
  keyUse: z.string().optional(),
  canDoItems: z.array(z.string()).optional(),
  canDoAction: z.string().optional(),
  options: z.array(z.string()).optional(),
  responseLength: z.string().optional(),
  minSentences: z.number().optional(),
  correct: z.boolean().optional(),
  sttConfidence: z.number().optional(),
  uncertainWords: z.array(z.string()).optional(),
  tryCount: z.number().optional(),
  lastJudgment: z.enum(["agree", "partial", "rejected"]).optional(),
  lastCoachTip: z.string().optional(),
});

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
};

function toDomainAnchor(row: LibraryAnchorRow, preferDino = false) {
  const dino = dinoLabels(row);
  const tags = preferDino && dino.length >= 2 ? dino : writingImageTags(row);
  return {
    id: row.id,
    tags,
    s3Key: row.s3Key,
    description: row.description,
    imageConcept: row.imageConcept,
    detectionResults: row.detectionResults,
  };
}

const LIBRARY_ANCHOR_COLS = {
  id:               libraryTable.id,
  tags:             libraryTable.tags,
  s3Key:            libraryTable.s3Key,
  description:      libraryTable.description,
  imageConcept:     libraryTable.imageConcept,
  detectionResults: libraryTable.detectionResults,
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

const router: IRouter = Router();

router.use("/students", requireAuth);

// Session end messages
function getSessionEndMessage(domain: string, levelDelta: number, scorePct: number, name: string): string {
  if (levelDelta > 0) {
    return `That's a wrap, ${name}. You gained +0.2 in ${capitalize(domain)} today. Keep it up. See you tomorrow.`;
  }
  if (scorePct >= 70) {
    return `Solid session, ${name}. Keep that up and you'll keep climbing. See you tomorrow.`;
  }
  if (levelDelta < 0) {
    return `Tough one, ${name}. You dropped 0.2 — but that's how you find your edge. Come back tomorrow.`;
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
router.post("/students/:studentId/sessions/start", requireStudentAccess("studentId"), async (req, res): Promise<void> => {
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
  // domain = the skill (listening/speaking/reading/writing).
  // tier   = the curriculum track (general/academic).
  // Both are independent axes stored in separate columns — no composite strings.
  const domain = parsed.data.domain as Domain;
  const tier   = parsed.data.tier as Tier;
  const configDomain = domain; // domain is always a core Domain — no mapping needed
  const config = getAssessmentConfig(assessment);

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
  const recentTopicRows = await db
    .select({ topic: sessionsTable.topic, subject: sessionsTable.subject })
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.studentId, student.id),
        eq(sessionsTable.domain, domain),
        eq(sessionsTable.tier, tier),
        eq(sessionsTable.completed, true),
        sql`${sessionsTable.createdAt} >= ${yesterday}`,
      )
    );

  // Flat list used by general listening and as a fallback.
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

  // For listening: resolve the topic before content generation so it can be
  // written to the session record immediately — survives abandoned sessions.
  let selectedListeningTopic: string | null = null;

  if (domain === "listening" && tier === "general") {
    // Reuse topic only if the student's MOST RECENT completed session was a failure.
    const [lastCompletedSession] = await db
      .select({ topic: sessionsTable.topic, scorePct: sessionsTable.scorePct, keyUse: sessionsTable.keyUse })
      .from(sessionsTable)
      .where(and(
        eq(sessionsTable.studentId, student.id),
        eq(sessionsTable.domain, "listening"),
        eq(sessionsTable.tier, "general"),
        eq(sessionsTable.completed, true),
      ))
      .orderBy(desc(sessionsTable.createdAt))
      .limit(1);

    const lastScore      = lastCompletedSession?.scorePct ?? 100;
    const persistedTopic =
      lastCompletedSession && lastScore < 70
        ? lastCompletedSession.topic
        : null;

    const [lastAnySession] = await db
      .select({ keyUse: sessionsTable.keyUse })
      .from(sessionsTable)
      .where(and(
        eq(sessionsTable.studentId, student.id),
        eq(sessionsTable.domain, "listening"),
        eq(sessionsTable.tier, "general"),
      ))
      .orderBy(desc(sessionsTable.createdAt))
      .limit(1);

    const lastKeyUse = persistedTopic
      ? (lastCompletedSession?.keyUse ?? null)
      : (lastAnySession?.keyUse ?? lastCompletedSession?.keyUse ?? null);

    // ── Levels 0, 1, 2 → image-library object-tap sessions ────────────────
    if (Math.floor(currentLevel) <= 2) {
      try {
        // Pick a random active topic that has at least one library image
        const topicsWithImages = await db
          .selectDistinct({ id: topicsTable.id, name: topicsTable.name })
          .from(topicsTable)
          .innerJoin(libraryTopicsTable, eq(libraryTopicsTable.topicId, topicsTable.id))
          .where(eq(topicsTable.isActive, true));

        if (topicsWithImages.length > 0) {
          const chosenTopic =
            topicsWithImages[Math.floor(Math.random() * topicsWithImages.length)];

          // Pick a random library image for this topic that has detected objects
          const [imageRow] = await db
            .select({
              id:               libraryTable.id,
              description:      libraryTable.description,
              tags:             libraryTable.tags,
              detectionResults: libraryTable.detectionResults,
              s3Key:            libraryTable.s3Key,
              mediumKey:        libraryTable.mediumKey,
            })
            .from(libraryTable)
            .innerJoin(libraryTopicsTable, eq(libraryTopicsTable.libraryId, libraryTable.id))
            .where(
              and(
                eq(libraryTopicsTable.topicId, chosenTopic.id),
                sql`${libraryTable.detectionResults} IS NOT NULL`,
                // Exclude images reserved for academic contexts only.
                // Allow: untagged (contexts = '{}') for backward compat, or explicitly tagged 'general'.
                sql`(${libraryTable.contexts} = '{}' OR ${libraryTable.contexts} && ARRAY['general']::text[])`,
              ),
            )
            // Within allowed images, prefer explicitly general-tagged ones
            .orderBy(
              sql`(${libraryTable.contexts} && ARRAY['general']::text[]) DESC NULLS LAST`,
              sql`RANDOM()`,
            )
            .limit(1);

          // Deduplicate overlapping detections so Claude only sees one label per area
          const rawDetections: Detection[] =
            ((imageRow?.detectionResults as any)?.detections ?? []) as Detection[];
          const cleanDetections = imageRow ? deduplicateDetections(rawDetections) : [];
          const allCleanTags    = [...new Set(cleanDetections.map((d) => d.label))];

          // Only attempt box-tap when DINO actually detected ≥2 distinct objects.
          // DB tags (imageRow.tags) are NOT used as a fallback here — they may not
          // have matching bounding boxes, which causes the wrong box to be shown.
          if (imageRow && allCleanTags.length >= 2) {
            // ── Object-mastery filter ────────────────────────────────────────
            // Remove labels the student has already mastered recently so they
            // encounter fresh question targets each session. Only DINO-confirmed
            // labels above the score threshold are eligible — no DB-tag fallback.
            const cleanTags = await filterMasteredLabels(
              student.id,
              imageRow.id,
              allCleanTags,
            );

            // Use the same engine as levels 3–6 so sub-step difficulty (Entry→Advanced)
            // and key use rotation are applied consistently even within levels 0–2.
            const imageCtx = buildListeningContext(currentLevel, topicsUsedToday, persistedTopic, lastKeyUse);

            // Generate passage + questions via Claude (using mastery-filtered tags)
            const imagePassage = await generateImagePassageContent({
              imageDescription:      (imageRow.description as string | null) ?? cleanTags.join(", "),
              imageTags:             cleanTags,
              level:                 Math.floor(currentLevel),
              fractionalLevel:       currentLevel,
              stepWithinLevel:       imageCtx.stepWithinLevel,
              complexityInstruction: imageCtx.complexityInstruction,
              canDo:                 imageCtx.canDo,
              topic:                 chosenTopic.name,
              lastSessionScore:      lastScore,
            });

            // Hard filter: drop any question whose targetLabel is not in cleanTags.
            // Claude is instructed to only use image_tags strings but occasionally picks
            // a word from image_description instead (e.g. "plant" when DINO detected
            // "cattail"). Without this guard the frontend has no matching bounding box
            // and would previously fall back to the highest-confidence detection — showing
            // a completely wrong object (e.g. osprey) highlighted as correct.
            const cleanTagSet = new Set(cleanTags);
            const safeQuestions = imagePassage.questions.filter((q) => {
              // yes_no questions don't need a bounding box, always keep them
              if (q.type === "image_yes_no") return true;
              const ok = cleanTagSet.has(q.targetLabel);
              if (!ok) req.log.warn(
                { targetLabel: q.targetLabel, cleanTags },
                "general image-library: dropped question — targetLabel not in DINO detections",
              );
              return ok;
            });

            if (safeQuestions.length === 0) {
              throw new Error("No valid tap questions after targetLabel filter — falling back to AI text content");
            }

            // Always use the original image so bounding boxes align exactly.
            // DINO ran on the original — showing a differently-cropped medium would
            // shift every box and highlight the wrong object.
            const imageKey = imageRow.s3Key as string;
            const imageUrl = await storage.getPresignedGetUrl(imageKey, 3600).catch(() => null);

            // Persist the session record — store image context for mastery tracking
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
                topic:          chosenTopic.name,
                keyUse:         imageCtx.canDo.keyUse,
                libraryImageId: imageRow.id,   // ← for mastery lookup at complete-time
                imageTags:      cleanTags,     // ← labels actually shown to Claude
              })
              .returning();

            sendSuccess(res, {
              sessionId:  earlySession.id,
              domain,
              levelStart: currentLevel,
              keyUse:     imageCtx.canDo.keyUse,
              content: {
                type: "image_library",
                data: {
                  topic:            chosenTopic.name,
                  keyUse:           imageCtx.canDo.keyUse,
                  passage:          imagePassage.passage,
                  imageUrl,
                  tags:             cleanTags,
                  imageDescription: (imageRow.description as string | null) || cleanTags.join(", "),
                  // Send deduplicated detections — one box per area, no overlaps
                  detectionResults: { detections: cleanDetections, model: (imageRow.detectionResults as any)?.model ?? "grounding-dino" },
                  questions:        safeQuestions,
                },
              },
              mode,
              exitThreshold,
            });
            return;
          }
        }
      } catch (err) {
        req.log.error({ err }, "Image-library session generation failed, falling back to AI");
      }
      // Fall through to AI-generated content if no suitable library images found
    }

    // ── Levels 3–6 (or fallback for 0–2 when no library images) → AI-generated
    const listeningCtx = buildListeningContext(
      currentLevel,
      topicsUsedToday,
      persistedTopic,
      lastKeyUse,
    );

    // Write session + topic immediately — topic survives even if client abandons
    const [earlySession] = await db
      .insert(sessionsTable)
      .values({
        studentId:   student.id,
        sessionType: parsed.data.sessionType,
        domain,
        tier,
        levelStart:  currentLevel.toString(),
        completed:   false,
        mode,
        topic:       listeningCtx.selectedTopic,
        keyUse:      listeningCtx.canDo.keyUse,
      })
      .returning();

    // Generate content + look up an illustration image in parallel.
    // Extracting the bracket category from "[Social Studies] Colonial America" → "Social Studies"
    const topicCategoryMatch = listeningCtx.selectedTopic.match(/^\[([^\]]+)\]/);
    const topicCategory = topicCategoryMatch?.[1] ?? listeningCtx.selectedTopic;

    const [listeningContentResult, illustrationResult] = await Promise.allSettled([
      generateListeningContent({
        level:                  listeningCtx.elpLevel,
        fractionalLevel:        listeningCtx.fractionalLevel,
        stepWithinLevel:        listeningCtx.stepWithinLevel,
        complexityInstruction:  listeningCtx.complexityInstruction,
        oralFormat:             listeningCtx.oralFormat,
        permittedFormats:       listeningCtx.permittedFormats,
        canDo:                  listeningCtx.canDo,
        topic:                  listeningCtx.selectedTopic,
        isRetry:                persistedTopic !== null,
        lastSessionScore:       lastScore,
      }),
      // Pick a random general library image whose topic category matches
      (async () => {
        const [imgRow] = await db
          .select({ s3Key: libraryTable.s3Key, mediumKey: libraryTable.mediumKey })
          .from(libraryTable)
          .innerJoin(libraryTopicsTable, eq(libraryTopicsTable.libraryId, libraryTable.id))
          .innerJoin(topicsTable, eq(topicsTable.id, libraryTopicsTable.topicId))
          .where(and(
            sql`(
              LOWER(${topicsTable.name}) LIKE LOWER(${"%" + topicCategory + "%"})
              OR LOWER(${topicCategory}) LIKE LOWER(${"%" + topicsTable.name + "%"})
            )`,
            sql`(${libraryTable.contexts} = '{}' OR ${libraryTable.contexts} && ARRAY['general']::text[])`,
          ))
          .orderBy(sql`RANDOM()`)
          .limit(1);
        if (!imgRow) return null;
        // Always original — DINO boxes were computed on the original image
        const imageKey = imgRow.s3Key as string;
        return storage.getPresignedGetUrl(imageKey, 3600).catch(() => null);
      })(),
    ]);

    const listeningContent = listeningContentResult.status === "fulfilled"
      ? listeningContentResult.value
      : (req.log.error({ err: listeningContentResult.reason }, "Listening content generation failed, using fallback"), null);

    const illustrationUrl = illustrationResult.status === "fulfilled"
      ? illustrationResult.value
      : (req.log.warn({ err: illustrationResult.reason }, "Illustration lookup failed"), null);

    sendSuccess(res, {
      sessionId: earlySession.id,
      domain,
      levelStart: currentLevel,
      keyUse: listeningCtx.canDo.keyUse,
      content: { type: "listening", data: { ...(listeningContent as unknown as Record<string, unknown> ?? {}), illustrationUrl, keyUse: listeningCtx.canDo.keyUse } },
      mode,
      exitThreshold,
    });
    return;
  }

  // ── Academic listening tier ───────────────────────────────────────────────
  if (domain === "listening" && tier === "academic") {
    // Retrieve last completed academic session to drive keyUse + subject rotation
    const recentAcademicSessions = await db
      .select({
        topic:     sessionsTable.topic,
        scorePct:  sessionsTable.scorePct,
        keyUse:    sessionsTable.keyUse,
        subject:   sessionsTable.subject,
        completed: sessionsTable.completed,
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
    const persistedTopic =
      lastAcademicSession && lastScore < 70 ? lastAcademicSession.topic : null;
    const lastKeyUse = persistedTopic
      ? (lastAcademicSession?.keyUse ?? null)
      : (lastAnyAcademic?.keyUse ?? null);

    const academicCtx = buildAcademicListeningContext(
      currentLevel,
      topicsUsedToday,
      persistedTopic,
      lastKeyUse,
      recentAcademicSessions,
    );

    // ── Levels 1–2: academic image-tap ───────────────────────────────────────
    // At WIDA levels 1–2 the student needs visual support.  Look for a library
    // image tagged for this academic subject.  If none found, fall back to any
    // general-tagged image — visual support is mandatory at these levels; we
    // only fall through to text if the entire library has no usable images.
    if (Math.floor(currentLevel) <= 2) {
      try {
        const academicContextTag = `academic:${academicCtx.subject}`;

        // 1st try: subject-specific image (preferred — academic vision available)
        const [acImageSubject] = await db
          .select({
            id:               libraryTable.id,
            description:      libraryTable.description,
            tags:             libraryTable.tags,
            detectionResults: libraryTable.detectionResults,
            s3Key:            libraryTable.s3Key,
            mediumKey:        libraryTable.mediumKey,
            academicVision:   libraryTable.academicVision,
            imageConcept:     libraryTable.imageConcept,
          })
          .from(libraryTable)
          .where(
            and(
              sql`${libraryTable.contexts} && ARRAY[${academicContextTag}]::text[]`,
              // Require at least 2 raw detection boxes — images with empty [] arrays are useless.
              sql`jsonb_array_length(COALESCE(${libraryTable.detectionResults}->'detections', '[]'::jsonb)) >= 2`,
            ),
          )
          .orderBy(sql`CASE WHEN ${libraryTable.academicVision} != '{}' THEN 0 ELSE 1 END, RANDOM()`)
          .limit(1);

        // 2nd try: any general image with ≥2 DINO detections (guarantees visual at levels 1–2)
        const [acImageFallback] = acImageSubject ? [acImageSubject] : await db
          .select({
            id:               libraryTable.id,
            description:      libraryTable.description,
            tags:             libraryTable.tags,
            detectionResults: libraryTable.detectionResults,
            s3Key:            libraryTable.s3Key,
            mediumKey:        libraryTable.mediumKey,
            academicVision:   libraryTable.academicVision,
            imageConcept:     libraryTable.imageConcept,
          })
          .from(libraryTable)
          .where(
            and(
              sql`jsonb_array_length(COALESCE(${libraryTable.detectionResults}->'detections', '[]'::jsonb)) >= 2`,
              sql`(${libraryTable.contexts} = '{}' OR ${libraryTable.contexts} && ARRAY['general']::text[])`,
            ),
          )
          .orderBy(sql`RANDOM()`)
          .limit(1);

        const acImage = acImageFallback ?? null;

        // Vision result for this subject (may be undefined if not yet processed).
        const visionResult = (acImage?.academicVision as Record<string, any> | null | undefined)?.[academicCtx.subject];

        // Tap targets MUST be DINO-detected objects — vision only provides the description.
        // Never fall back to DB tags: they may not have matching bounding boxes.
        const rawDetections: Detection[] =
          ((acImage?.detectionResults as any)?.detections ?? []) as Detection[];
        const cleanDetections = acImage ? deduplicateDetections(rawDetections) : [];
        const allDinoTags     = [...new Set(cleanDetections.map((d) => d.label))];

        if (acImage && allDinoTags.length >= 2) {
          // Apply mastery filtering so students aren't re-asked about already-mastered objects.
          const cleanTags = await filterMasteredLabels(student.id, acImage.id, allDinoTags);
          if (cleanTags.length < 2) {
            req.log.warn({ imageId: acImage.id, cleanTags }, "academic: fewer than 2 tags after mastery filter, skipping");
            throw new Error("Insufficient tags after mastery filter");
          }

          // Concept first, then vision prose. Never feed a photo caption as the lesson.
          const imageDescription = [
            visionResult?.concept,
            visionResult?.description,
          ].filter((s): s is string => typeof s === "string" && s.trim().length > 0).join(" ")
            || (acImage.imageConcept as string | null)
            || (acImage.description as string | null)
            || cleanTags.join(", ");

          // ── Variation: shuffle tags + collect recently-used targets ────────────
          // Shuffle so Claude doesn't always pick the same "first" objects.
          const shuffledTags = [...cleanTags].sort(() => Math.random() - 0.5);

          // Fetch target labels from the student's last 3 sessions on this image
          // so Claude is told to avoid repeating the same question targets.
          const recentAnswerRows = await db
            .select({ content: sessionAnswersTable.content })
            .from(sessionAnswersTable)
            .innerJoin(sessionsTable, eq(sessionsTable.id, sessionAnswersTable.sessionId))
            .where(
              and(
                eq(sessionsTable.studentId,      student.id),
                eq(sessionsTable.libraryImageId, acImage.id),
              )
            )
            .orderBy(desc(sessionAnswersTable.createdAt))
            .limit(6);

          const recentTargets = [
            ...new Set(
              recentAnswerRows
                .map((r) => (r.content as any)?.targetLabel as string | undefined)
                .filter((t): t is string => !!t)
            ),
          ];

          const academicTapContent = await generateAcademicImageTapContent({
            academicSubject:       academicCtx.subject,
            subjectLabel:          academicCtx.subjectLabel,
            imageDescription,
            imageTags:             shuffledTags,
            level:                 Math.floor(currentLevel),
            fractionalLevel:       currentLevel,
            stepWithinLevel:       academicCtx.stepWithinLevel,
            complexityInstruction: academicCtx.complexityInstruction,
            oralFormat:            academicCtx.oralFormat,
            canDo:                 academicCtx.canDo,
            topic:                 `[${academicCtx.subjectLabel}]`,
            lastSessionScore:      lastScore,
            // Explicit concept label from the library image metadata
            imageConcept:          (acImage as any).imageConcept ?? undefined,
            // Anti-repetition signals
            avoidTargets:          recentTargets.length > 0 ? recentTargets : undefined,
            variationSeed:         Math.floor(Math.random() * 100000),
          });

          // Hard filter: drop questions whose targetLabel is not a DINO-confirmed object.
          // image_yes_no Q2 intentionally uses an ABSENT object as targetLabel → always skip
          // the box check for yes_no questions (they have no bounding box requirement).
          const cleanTagSet = new Set(cleanTags);
          const safeQuestions = academicTapContent.questions.filter((q) => {
            if (q.type === "image_yes_no") return true; // no box needed for agree/disagree
            const ok = cleanTagSet.has(q.targetLabel);
            if (!ok) req.log.warn({ targetLabel: q.targetLabel, cleanTags }, "academic: dropped question — target not in DINO detections");
            return ok;
          });

          if (safeQuestions.length === 0) {
            req.log.warn({ imageId: acImage.id }, "academic: all questions filtered out, falling through to text content");
            throw new Error("No valid tap questions after filtering");
          }

          // Always use the original image — DINO boxes were computed on the original.
          const imageKey = acImage.s3Key as string;
          const imageUrl = await storage.getPresignedGetUrl(imageKey, 3600).catch(() => null);

          const [earlyAcImageSession] = await db
            .insert(sessionsTable)
            .values({
              studentId:      student.id,
              sessionType:    parsed.data.sessionType,
              domain,
              tier,
              levelStart:     currentLevel.toString(),
              completed:      false,
              mode,
              topic:          `[${academicCtx.subjectLabel}] Academic Image`,
              keyUse:         academicCtx.canDo.keyUse,
              subject:        academicCtx.subject,
              libraryImageId: acImage.id,
              imageTags:      cleanTags,
            })
            .returning();

          sendSuccess(res, {
            sessionId:    earlyAcImageSession.id,
            domain,
            levelStart:   currentLevel,
            keyUse:       academicCtx.canDo.keyUse,
            subject:      academicCtx.subject,
            subjectLabel: academicCtx.subjectLabel,
            content: {
              type: "image_library",
              data: {
                topic:            `[${academicCtx.subjectLabel}] Academic Image`,
                keyUse:           academicCtx.canDo.keyUse,
                passage:          academicTapContent.passage,
                imageUrl,
                tags:             cleanTags,
                imageDescription,
                detectionResults: {
                  detections: cleanDetections,
                  model:      (acImage.detectionResults as any)?.model ?? "grounding-dino",
                },
                questions: safeQuestions,
                mode,
              },
            },
            mode,
            exitThreshold,
          });
          return;
        }
      } catch (err) {
        req.log.warn({ err }, "Academic image-tap lookup failed, falling through to text content");
      }
      // No usable image in the entire library → fall through to text content
    }

    // Build subject-specific context — each engine receives only its own subject's
    // past topics so cross-subject topic labels don't cause false dedup exclusions.
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

    // Resolved topic label for the session record
    const academicTopicLabel =
      mathCtx?.topicLabel ??
      sciCtx?.topicLabel  ??
      ssCtx?.topicLabel   ??
      elaCtx?.topicLabel  ??
      `[${academicCtx.subjectLabel}] ${academicCtx.selectedTopic}`;

    // ── Topic-aware image search ──────────────────────────────────────────────
    // Look for a library image whose tags overlap with the subject's visual anchor
    // tags. If found, the image's objects become real-world anchors for the academic
    // passage (a cafeteria image → math counting problem, not a cafeteria description).
    // If no match, fall through to pure AI academic content generation.
    const subjectAnchorTags = SUBJECT_VISUAL_ANCHOR_TAGS[academicCtx.subject] ?? [];
    let anchorImage: {
      id: string;
      description: string | null;
      tags: string[];
      s3Key: string;
      mediumKey: string | null;
    } | null = null;

    if (subjectAnchorTags.length > 0) {
      try {
        // Find images whose detected tags overlap with the subject's visual anchor tags.
        // Use a raw SQL array-overlap check so we don't need to join per-tag.
        const anchorRows = await db
          .select({
            id:          libraryTable.id,
            description: libraryTable.description,
            tags:        libraryTable.tags,
            s3Key:       libraryTable.s3Key,
            mediumKey:   libraryTable.mediumKey,
          })
          .from(libraryTable)
          .where(
            and(
                  sql`${libraryTable.tags} IS NOT NULL`,
              // tags is jsonb — can't cast directly to text[]; use jsonb_array_elements_text
              sql`ARRAY(SELECT jsonb_array_elements_text(${libraryTable.tags})) && ARRAY[${sql.raw(
                subjectAnchorTags.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")
              )}]::text[]`,
              // Exclude general-only images from academic sessions.
              // Allow: untagged (backward compat) or images that include this academic subject.
              sql`(${libraryTable.contexts} = '{}' OR ${libraryTable.contexts} && ARRAY[${`academic:${academicCtx.subject}`}]::text[])`,
            )
          )
          .orderBy(sql`RANDOM()`)
          .limit(1);

        if (anchorRows[0] && Array.isArray(anchorRows[0].tags) && anchorRows[0].tags.length >= 2) {
          anchorImage = {
            id:          anchorRows[0].id,
            description: anchorRows[0].description as string | null,
            tags:        anchorRows[0].tags as string[],
            s3Key:       anchorRows[0].s3Key as string,
            mediumKey:   anchorRows[0].mediumKey as string | null,
          };
        }
      } catch (err) {
        req.log.warn({ err }, "Academic image search failed, proceeding without image");
      }
    }

    // ── All levels → AI-generated academic content (with optional image anchor) ──
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
        keyUse:         academicCtx.canDo.keyUse,
        subject:        academicCtx.subject,
        libraryImageId: anchorImage?.id ?? null,
        imageTags:      anchorImage?.tags ?? null,
      })
      .returning();

    // Resolve image URL if we found an anchor image
    let anchorImageUrl: string | null = null;
    if (anchorImage) {
      // Always original — DINO boxes were computed on the original image
      const imageKey = anchorImage.s3Key;
      anchorImageUrl = await storage.getPresignedGetUrl(imageKey, 3600).catch(() => null);
    }

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
          permittedFormats:      MATH_PERMITTED_FORMATS,
          canDo:                 academicCtx.canDo,
          mathUnit:              mathCtx.unit,
          mathScenario:          mathCtx.scenario,
          tier3Vocabulary:       mathCtx.tier3Vocabulary,
          topic:                 mathCtx.topicLabel,
          isRetry:               persistedTopic !== null,
          lastSessionScore:      lastScore,
          hasLibraryImage:       Boolean(anchorImage),
        });
      } else if (sciCtx) {
        // ── Science ──────────────────────────────────────────────────────────
        academicContent = await generateAcademicScienceListeningContent({
          level:                 academicCtx.elpLevel,
          fractionalLevel:       academicCtx.fractionalLevel,
          stepWithinLevel:       academicCtx.stepWithinLevel,
          complexityInstruction: academicCtx.complexityInstruction,
          oralFormat:            academicCtx.oralFormat,
          permittedFormats:      SCIENCE_PERMITTED_FORMATS,
          canDo:                 academicCtx.canDo,
          scienceUnit:           sciCtx.unit,
          scienceStrand:         sciCtx.strand,
          scienceScenario:       sciCtx.scenario,
          tier3Vocabulary:       sciCtx.tier3Vocabulary,
          topic:                 sciCtx.topicLabel,
          isRetry:               persistedTopic !== null,
          lastSessionScore:      lastScore,
          hasLibraryImage:       Boolean(anchorImage),
        });
      } else if (ssCtx) {
        // ── Social Studies ────────────────────────────────────────────────────
        academicContent = await generateAcademicSocialStudiesListeningContent({
          level:                 academicCtx.elpLevel,
          fractionalLevel:       academicCtx.fractionalLevel,
          stepWithinLevel:       academicCtx.stepWithinLevel,
          complexityInstruction: academicCtx.complexityInstruction,
          oralFormat:            academicCtx.oralFormat,
          permittedFormats:      SS_PERMITTED_FORMATS,
          canDo:                 academicCtx.canDo,
          ssUnit:                ssCtx.unit,
          ssStrand:              ssCtx.strand,
          ssScenario:            ssCtx.scenario,
          tier3Vocabulary:       ssCtx.tier3Vocabulary,
          topic:                 ssCtx.topicLabel,
          isRetry:               persistedTopic !== null,
          lastSessionScore:      lastScore,
          hasLibraryImage:       Boolean(anchorImage),
        });
      } else if (elaCtx) {
        // ── English Language Arts ─────────────────────────────────────────────
        academicContent = await generateAcademicElaListeningContent({
          level:                 academicCtx.elpLevel,
          fractionalLevel:       academicCtx.fractionalLevel,
          stepWithinLevel:       academicCtx.stepWithinLevel,
          complexityInstruction: academicCtx.complexityInstruction,
          oralFormat:            academicCtx.oralFormat,
          permittedFormats:      ELA_PERMITTED_FORMATS,
          canDo:                 academicCtx.canDo,
          elaUnit:               elaCtx.unit,
          elaGenre:              elaCtx.genre,
          elaScenario:           elaCtx.scenario,
          tier3Vocabulary:       elaCtx.tier3Vocabulary,
          topic:                 elaCtx.topicLabel,
          isRetry:               persistedTopic !== null,
          lastSessionScore:      lastScore,
          hasLibraryImage:       Boolean(anchorImage),
        });
      } else {
        // ── Fallback (unexpected subject) → general listening ─────────────────
        academicContent = await generateListeningContent({
          level:                 academicCtx.elpLevel,
          fractionalLevel:       academicCtx.fractionalLevel,
          stepWithinLevel:       academicCtx.stepWithinLevel,
          complexityInstruction: academicCtx.complexityInstruction,
          oralFormat:            academicCtx.oralFormat,
          permittedFormats:      academicCtx.permittedFormats,
          canDo:                 academicCtx.canDo,
          topic:                 academicTopicLabel,
          isRetry:               persistedTopic !== null,
          lastSessionScore:      lastScore,
          hasLibraryImage:       Boolean(anchorImage),
        });
      }
    } catch (err) {
      req.log.error({ err }, "Academic listening content generation failed, using fallback");
    }

    sendSuccess(res, {
      sessionId:    earlySession.id,
      domain,
      levelStart:   currentLevel,
      keyUse:       academicCtx.canDo.keyUse,
      subject:      academicCtx.subject,
      subjectLabel: academicCtx.subjectLabel,
      content:      {
        type: "listening",
        data: academicContent && typeof academicContent === "object"
          ? { ...academicContent as object, illustrationUrl: anchorImageUrl }
          : academicContent,
      },
      // Anchor image included when a topic-relevant library image was found.
      // The frontend can display it as visual context while the student listens.
      anchorImage:  anchorImageUrl
        ? { url: anchorImageUrl, tags: anchorImage?.tags ?? [] }
        : null,
      mode,
      exitThreshold,
    });
    return;
  }

  // ── Non-listening domains ─────────────────────────────────────────────────
  // Fetch the last completed session for this domain/tier to drive key-use
  // rotation and topic persistence (reuse topic if last session score < 70).
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
      eq(sessionsTable.completed, true),
    ))
    .orderBy(desc(sessionsTable.createdAt))
    .limit(16);

  const lastDomainSession = recentDomainSessions[0];

  const lastDomainScore    = lastDomainSession?.scorePct ?? 100;
  const lastDomainKeyUse   = lastDomainSession?.keyUse   ?? null;
  const domainPersistedTopic =
    lastDomainSession && lastDomainScore < 70 ? lastDomainSession.topic : null;

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

  const academicDomain = tier === "academic" && (domain === "reading" || domain === "speaking" || domain === "writing")
    ? (domain as "reading" | "speaking" | "writing")
    : null;
  const academicIsRetry = domainPersistedTopic !== null;
  const academicKeyUse = academicDomain
    ? nextKeyUse(lastDomainKeyUse, academicIsRetry)
    : null;
  const academicSubject = academicDomain
    ? pickSubjectForKeyUse(academicKeyUse, recentDomainSessions, academicIsRetry)
    : null;
  const academicTopic = academicSubject
    ? pickAcademicTopicLabel(academicSubject, currentLevel, domainPersistedTopic, topicsUsedToday)
    : null;
  const academicLayer = academicSubject && academicDomain
    ? buildAcademicContentLayer({
        subject: academicSubject,
        subjectLabel: ACADEMIC_SUBJECT_LABELS[academicSubject],
        domain: academicDomain,
        keyUse: academicKeyUse,
      })
    : undefined;

  let preferredTopic = academicTopic;
  if (!preferredTopic) {
    if (domain === "reading") {
      preferredTopic = buildReadingContext(
        currentLevel,
        topicsUsedToday,
        domainPersistedTopic,
        lastDomainKeyUse,
      ).selectedTopic;
    } else if (domain === "speaking") {
      preferredTopic = buildSpeakingContext(
        currentLevel,
        topicsUsedToday,
        domainPersistedTopic,
        lastDomainKeyUse,
        isTelpas,
      ).selectedTopic;
    } else if (domain === "writing") {
      preferredTopic = buildWritingContext(
        currentLevel,
        topicsUsedToday,
        domainPersistedTopic,
        lastDomainKeyUse,
      ).selectedTopic;
    }
  }

  let domainAnchor: {
    id: string;
    tags: string[];
    s3Key: string;
    description?: string | null;
    imageConcept?: string | null;
    detectionResults?: unknown;
  } | null = null;
  let domainAnchorUrl: string | null = null;
  const skipRecentImage = excludeImageIds.length
    ? notInArray(libraryTable.id, excludeImageIds)
    : undefined;
  const elpFloor = Math.floor(currentLevel);
  const domainKeyUseForPhoto = academicKeyUse ?? nextKeyUse(lastDomainKeyUse, domainPersistedTopic !== null);
  const portrayal = getContentPortrayal(elpFloor, domain.toUpperCase(), domainKeyUseForPhoto);
  const pictureUse = (portrayal?.picture as { use?: string } | null | undefined)?.use;
  const skipLibraryPhoto = elpFloor <= 2 && pictureUse === "not_needed";
  const requireLibraryPhoto = elpFloor <= 2 && pictureUse === "required";
  try {
    if (!skipLibraryPhoto) {
    const terms = preferredTopic ? topicSearchTerms(preferredTopic) : [];
    const metaMatch = terms.length
      ? or(
          ...terms.map((t) => sql`(
            COALESCE(${libraryTable.description}, '') ILIKE ${"%" + t + "%"}
            OR COALESCE(${libraryTable.imageConcept}, '') ILIKE ${"%" + t + "%"}
            OR COALESCE(${libraryTable.tags}::text, '') ILIKE ${"%" + t + "%"}
          )`),
        )
      : undefined;

    if (terms.length) {
      const [byLinkedTopic] = await db
        .select(LIBRARY_ANCHOR_COLS)
        .from(libraryTable)
        .innerJoin(libraryTopicsTable, eq(libraryTopicsTable.libraryId, libraryTable.id))
        .innerJoin(topicsTable, eq(topicsTable.id, libraryTopicsTable.topicId))
        .where(
          skipRecentImage
            ? and(
                or(
                  ...terms.map((t) =>
                    sql`LOWER(${topicsTable.name}) LIKE LOWER(${"%" + t + "%"})`,
                  ),
                ),
                skipRecentImage,
              )
            : or(
                ...terms.map((t) =>
                  sql`LOWER(${topicsTable.name}) LIKE LOWER(${"%" + t + "%"})`,
                ),
              ),
        )
        .orderBy(sql`RANDOM()`)
        .limit(1);
      if (byLinkedTopic?.s3Key) domainAnchor = toDomainAnchor(byLinkedTopic, requireLibraryPhoto);
    }

    if (!domainAnchor && metaMatch) {
      const [byMeta] = await db
        .select(LIBRARY_ANCHOR_COLS)
        .from(libraryTable)
        .where(skipRecentImage ? and(metaMatch, skipRecentImage) : metaMatch)
        .orderBy(sql`RANDOM()`)
        .limit(1);
      if (byMeta?.s3Key) domainAnchor = toDomainAnchor(byMeta, requireLibraryPhoto);
    }

    const subjectAnchorTags = academicSubject
      ? (SUBJECT_VISUAL_ANCHOR_TAGS[academicSubject] ?? [])
      : [];
    if (!domainAnchor && academicSubject && subjectAnchorTags.length > 0) {
      const [row] = await db
        .select(LIBRARY_ANCHOR_COLS)
        .from(libraryTable)
        .where(
          and(
            sql`${libraryTable.tags} IS NOT NULL`,
            sql`ARRAY(SELECT jsonb_array_elements_text(${libraryTable.tags})) && ARRAY[${sql.raw(
              subjectAnchorTags.map((t) => `'${t.replace(/'/g, "''")}'`).join(","),
            )}]::text[]`,
            sql`(${libraryTable.contexts} = '{}' OR ${libraryTable.contexts} && ARRAY[${`academic:${academicSubject}`}]::text[])`,
            ...(skipRecentImage ? [skipRecentImage] : []),
          ),
        )
        .orderBy(sql`RANDOM()`)
        .limit(1);
      if (row?.s3Key) domainAnchor = toDomainAnchor(row, requireLibraryPhoto);
    }

    const anyPhotoWhere = requireLibraryPhoto
      ? sql`jsonb_array_length(COALESCE(${libraryTable.detectionResults}->'detections', '[]'::jsonb)) >= 2`
      : sql`jsonb_array_length(COALESCE(${libraryTable.detectionResults}->'detections', '[]'::jsonb)) >= 1
              OR jsonb_array_length(COALESCE(${libraryTable.tags}, '[]'::jsonb)) >= 1`;
    if (!domainAnchor && (domain === "writing" || elpFloor <= 2)) {
      const [row] = await db
        .select(LIBRARY_ANCHOR_COLS)
        .from(libraryTable)
        .where(skipRecentImage ? and(anyPhotoWhere, skipRecentImage) : anyPhotoWhere)
        .orderBy(sql`RANDOM()`)
        .limit(1);
      if (row?.s3Key) domainAnchor = toDomainAnchor(row, requireLibraryPhoto);
    }
    if (!domainAnchor && (domain === "writing" || elpFloor <= 2) && skipRecentImage) {
      const [row] = await db
        .select(LIBRARY_ANCHOR_COLS)
        .from(libraryTable)
        .where(anyPhotoWhere)
        .orderBy(sql`RANDOM()`)
        .limit(1);
      if (row?.s3Key) domainAnchor = toDomainAnchor(row, requireLibraryPhoto);
    }
    if (requireLibraryPhoto && domainAnchor && domainAnchor.tags.length < 2) {
      domainAnchor = null;
    }
    if (domainAnchor) {
      if (domain !== "writing" && domain !== "speaking") {
        preferredTopic = topicFromAnchor(domainAnchor);
      }
      req.log.info(
        { imageId: domainAnchor.id, tags: domainAnchor.tags, topic: preferredTopic, domain, excludeImageIds, requireLibraryPhoto },
        "Domain library image selected",
      );
      domainAnchorUrl = await storage.getPresignedGetUrl(domainAnchor.s3Key, 3600).catch(() => null);
    }
    }
  } catch (err) {
    req.log.warn({ err }, "Domain library image lookup failed, continuing without photo");
  }
  const hasLibraryImage = Boolean(domainAnchorUrl);

  try {
    switch (domain as Domain) {
      case "reading": {
        const readingCtx = buildReadingContext(
          currentLevel,
          topicsUsedToday,
          domainPersistedTopic,
          lastDomainKeyUse,
        );
        sessionTopic  = preferredTopic ?? academicTopic ?? readingCtx.selectedTopic;
        sessionKeyUse = readingCtx.canDo.keyUse;
        sessionSubject = academicSubject;
        contentData   = await generateReadingContent({
          assessment,
          level:                  readingCtx.elpLevel,
          fractionalLevel:        readingCtx.fractionalLevel,
          stepWithinLevel:        readingCtx.stepWithinLevel,
          complexityInstruction:  readingCtx.complexityInstruction,
          textFormat:             readingCtx.textFormat,
          permittedFormats:       readingCtx.permittedFormats,
          canDo:                  readingCtx.canDo,
          topic:                  sessionTopic,
          gradeBand:              student.gradeBand,
          homeLanguage:           student.homeLanguage ?? undefined,
          mode,
          academicContentLayer:   academicLayer,
          academicSubject:        academicSubject ?? undefined,
          questionCount:          readingCtx.questionCount,
          passageWordMax:         readingCtx.passageWordMax,
          hasLibraryImage,
          imageTags:              domainAnchor?.tags,
          imageDescription:       domainAnchor?.description ?? undefined,
          imageConcept:           domainAnchor?.imageConcept ?? undefined,
        });
        break;
      }
      case "speaking": {
        const speakingCtx = buildSpeakingContext(
          currentLevel,
          topicsUsedToday,
          domainPersistedTopic,
          lastDomainKeyUse,
          isTelpas,
        );
        sessionTopic  = preferredTopic ?? academicTopic ?? speakingCtx.selectedTopic;
        sessionKeyUse = speakingCtx.canDo.keyUse;
        sessionSubject = academicSubject;
        contentData   = await generateSpeakingContent({
          assessment,
          level:                  speakingCtx.elpLevel,
          fractionalLevel:        speakingCtx.fractionalLevel,
          stepWithinLevel:        speakingCtx.stepWithinLevel,
          complexityInstruction:  speakingCtx.complexityInstruction,
          discourseType:          speakingCtx.discourseType,
          scaffoldRequired:       speakingCtx.scaffoldRequired,
          responseLength:         speakingCtx.responseLength,
          allowedPromptTypes:     speakingCtx.allowedPromptTypes,
          targetSeconds:          speakingCtx.targetSeconds,
          canDo:                  speakingCtx.canDo,
          topic:                  sessionTopic,
          gradeBand:              student.gradeBand,
          mode,
          isTelpas,
          academicContentLayer:   academicLayer,
          academicSubject:        academicSubject ?? undefined,
          hasLibraryImage,
          imageTags:              domainAnchor?.tags,
          imageDescription:       domainAnchor?.description ?? undefined,
          imageConcept:           domainAnchor?.imageConcept ?? undefined,
        });
        break;
      }
      case "writing": {
        const writingCtx = buildWritingContext(
          currentLevel,
          topicsUsedToday,
          domainPersistedTopic,
          lastDomainKeyUse,
        );
        sessionTopic  = academicTopic ?? writingCtx.selectedTopic;
        sessionKeyUse = writingCtx.canDo.keyUse;
        sessionSubject = academicSubject;
        contentData   = await generateWritingContent({
          assessment,
          level:                  writingCtx.elpLevel,
          fractionalLevel:        writingCtx.fractionalLevel,
          stepWithinLevel:        writingCtx.stepWithinLevel,
          complexityInstruction:  writingCtx.complexityInstruction,
          writingFormat:          writingCtx.writingFormat,
          taskType:               writingCtx.taskType,
          minSentences:           writingCtx.minSentences,
          sentenceFrameRequired:  writingCtx.sentenceFrameRequired,
          wordBankRequired:       writingCtx.wordBankRequired,
          canDo:                  writingCtx.canDo,
          topic:                  sessionTopic,
          gradeBand:              student.gradeBand,
          mode,
          academicContentLayer:   academicLayer,
          academicSubject:        academicSubject ?? undefined,
          hasLibraryImage,
          imageTags:              domainAnchor?.tags,
          imageDescription:       domainAnchor?.description ?? undefined,
          imageConcept:           domainAnchor?.imageConcept ?? undefined,
        });
        break;
      }
    }
  } catch (err) {
    req.log.error({ err }, "Content generation failed, using fallback");
    contentData = null;
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
  const tier               = (session.tier ?? "general") as Tier;
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
  const consecutivePass = levelRow ? parseInt(levelRow.consecutivePassCount) : 0;
  const consecutiveFail = levelRow ? parseInt(levelRow.consecutiveFailCount) : 0;

  // Calculate level update
  const levelUpdate = calculateLevelUpdate(
    currentLevel,
    exitThreshold,
    scorePct,
    consecutivePass,
    consecutiveFail,
    assessment
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

  const message = getSessionEndMessage(domain, levelUpdate.delta, scorePct, student.name);

  const attemptFeedback =
    domain === "speaking" || domain === "writing"
      ? null
      : await generateAttemptFeedback({
          domain,
          tier,
          level: currentLevel,
          scorePct,
          topic: session.topic,
          keyUse: session.keyUse,
          answers: parsed.data.answers ?? [],
        }).catch(() => ({
          summary: "You finished this practice. Review missed items and try again soon.",
          mistakes: [],
          strengths: ["You completed the session."],
          nextSteps: ["Practice the same skill again tomorrow."],
        }));

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
    attemptFeedback,
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
router.post("/students/:studentId/writing/feedback", requireStudentAccess("studentId"), async (req, res): Promise<void> => {
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
        eq(studentLevelsTable.domain, "writing")
      )
    )
    .orderBy(desc(studentLevelsTable.updatedAt))
    .limit(1);

  const config = getAssessmentConfig(assessment);
  const currentLevel = levelRow ? parseFloat(levelRow.currentLevel) : config.scale.min;
  const exitThreshold = getExitThreshold(assessment, "writing");
  const gap = Math.max(0, exitThreshold - currentLevel);
  const mode = gap <= 0.5 && gap > 0 ? "exit_proximity" : "standard";

  const feedback = await getWritingFeedback({
    canDoDescriptor: "",                   // not available in feedback route — scored generically
    prompt:          parsed.data.prompt,
    studentResponse: parsed.data.response,
    level:           parsed.data.level,
    taskType:        "",                   // not available in feedback route — graded on content
    minSentences:    parsed.data.level <= 2 ? 3 : parsed.data.level <= 3 ? 4 : parsed.data.level <= 4 ? 6 : parsed.data.level <= 5 ? 8 : 12,
  });

  sendSuccess(res, feedback);
});

router.post("/students/:studentId/item-feedback", requireStudentAccess("studentId"), async (req, res): Promise<void> => {
  const studentId = typeof req.params.studentId === "string" ? req.params.studentId : "";
  if (!studentId) {
    sendError(res, 400, "Missing student id");
    return;
  }

  const parsed = ItemFeedbackBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Missing or invalid item feedback fields");
    return;
  }

  const feedback = await generateItemFeedback(parsed.data);
  sendSuccess(res, feedback);
});

export default router;
