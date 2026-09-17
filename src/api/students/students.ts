import { Router, type IRouter, type Request } from "express";
import { eq, and, or, sql, count, desc } from "drizzle-orm";
import crypto from "node:crypto";
import { z } from "zod/v4";
import {
  db,
  studentsTable,
  studentLevelsTable,
  sessionsTable,
  invitationsTable,
  profilesTable,
  usersTable,
  districtSeatAllocationsTable,
  districtAdminsTable,
  schoolsTable,
  type AccountType,
} from "../../../db";
import { sendHtmlEmail } from "../../lib/mail/mailer";
import { invitationEmail } from "../../lib/mail/email-templates";
import {
  CreateStudentBody,
  GetStudentParams,
  UpdateStudentParams,
  UpdateStudentBody,
  EnterStudentScoresParams,
  EnterStudentScoresBody,
  GetStudentProgressParams,
  GetStudentStreakParams,
  GetStudentPathwayParams,
} from "../../generated";
import {
  Assessment,
  Domain,
  Tier,
  DOMAINS,
  StudentTrack,
  getAssessmentConfig,
  getLevelLabel,
  getExitThreshold,
  getExitThresholdForTrack,
  getStartingLevel,
  telpasToNumeric,
} from "../../lib/assessments";
import {
  calculateGaps,
  rankDomains,
  allocateTime,
  calculateGrowthRate,
  projectExitDate,
  generateNudgeMessage,
} from "../../lib/adaptive-engine";
import { sendError, sendSuccess } from "../../lib/http/api-response";
import {
  resolveDistrictSchoolTeacherForAssign,
  resolveSchoolTeacherForAssign,
} from "../../lib/auth/org-access";
import { requireAuth, requireStudentAccess } from "../../middlewares/auth";
import { resolveStudentAccess } from "../../lib/billing/subscription";
import { getStudentAiUsage } from "../../lib/rate-limit/usage";

const router: IRouter = Router();

router.use("/students", requireAuth);

// All (domain, tier) pairs for which student_levels rows must exist.
// To add a new domain or tier in the future, append a pair here — nothing else needs to change.
const DOMAIN_TIER_PAIRS: Array<{ domain: Domain; tier: Tier }> = [
  { domain: "listening", tier: "general"  },
  { domain: "listening", tier: "academic" },
  { domain: "speaking",  tier: "general"  },
  { domain: "reading",   tier: "general"  },
  { domain: "writing",   tier: "academic" },
];
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sha256(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
function getAppUrl(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim() ?? req.protocol;
  const host = (req.headers["x-forwarded-host"] as string)?.split(",")[0]?.trim() ?? req.get("host") ?? "";
  return `${proto}://${host}`;
}

export async function ensureStudentLevels(
  studentId: string,
  assessment: Assessment,
  track: StudentTrack = "academic",
) {
  for (const { domain, tier } of DOMAIN_TIER_PAIRS) {
    const existing = await db
      .select()
      .from(studentLevelsTable)
      .where(and(
        eq(studentLevelsTable.studentId, studentId),
        eq(studentLevelsTable.domain, domain),
        eq(studentLevelsTable.tier, tier),
      ))
      .orderBy(desc(studentLevelsTable.updatedAt))
      .limit(1);

    if (existing.length === 0) {
      const config = getAssessmentConfig(assessment);
      const threshold = getExitThresholdForTrack(assessment, domain, track);
      await db.insert(studentLevelsTable).values({
        studentId,
        domain,
        tier,
        currentLevel: config.scale.min.toString(),
        exitThreshold: threshold.toString(),
        atExit: false,
        source: "practice",
        consecutivePassCount: "0",
        consecutiveFailCount: "0",
      });
    }
  }
}

// Applies a guardian-entered score (at registration or via the score-entry form)
// directly onto student_levels — this is the single source of truth for a
// student's standing per domain, so there's no separate "official score" record.
async function applyGuardianScores(
  studentId: string,
  assessment: Assessment,
  scores: {
    listening?: number;
    speaking?: number;
    reading?: number;
    writing?: number;
    telpasListening?: string | null;
    telpasSpeaking?: string | null;
    telpasReading?: string | null;
    telpasWriting?: string | null;
  }
) {
  let listeningScore = scores.listening ?? null;
  let speakingScore = scores.speaking ?? null;
  let readingScore = scores.reading ?? null;
  let writingScore = scores.writing ?? null;

  if (assessment === "TELPAS") {
    if (scores.telpasListening) listeningScore = telpasToNumeric(scores.telpasListening as "Beginning" | "Intermediate" | "Advanced" | "Advanced High");
    if (scores.telpasSpeaking) speakingScore = telpasToNumeric(scores.telpasSpeaking as "Beginning" | "Intermediate" | "Advanced" | "Advanced High");
    if (scores.telpasReading) readingScore = telpasToNumeric(scores.telpasReading as "Beginning" | "Intermediate" | "Advanced" | "Advanced High");
    if (scores.telpasWriting) writingScore = telpasToNumeric(scores.telpasWriting as "Beginning" | "Intermediate" | "Advanced" | "Advanced High");
  }

  const scoreMap: Partial<Record<Domain, number | null>> = {
    listening: listeningScore,
    speaking: speakingScore,
    reading: readingScore,
    writing: writingScore,
  };

  await ensureStudentLevels(studentId, assessment);

  for (const domain of DOMAINS) {
    const officialScore = scoreMap[domain];
    if (officialScore != null) {
      const startingLevel = getStartingLevel(officialScore, assessment);
      const exitThreshold = getExitThreshold(assessment, domain);

      await db
        .update(studentLevelsTable)
        .set({
          currentLevel: startingLevel.toString(),
          exitThreshold: exitThreshold.toString(),
          atExit: startingLevel >= exitThreshold,
          source: "guardian_entered",
          consecutivePassCount: "0",
          consecutiveFailCount: "0",
          updatedAt: new Date(),
        })
        // Guardian scores: general tier for L/S/R; writing is academic WIDA only.
        .where(and(
          eq(studentLevelsTable.studentId, studentId),
          eq(studentLevelsTable.domain, domain),
          eq(studentLevelsTable.tier, domain === "writing" ? "academic" : "general"),
        ));
    }
  }
}

// Create student
router.post("/students", async (req, res): Promise<void> => {
  const parsed = CreateStudentBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return;
  }

  const { teacherId, name, gradeBand, stateAssessment, homeLanguage, email, initialScores } = parsed.data;
  const normalizedEmail = email?.trim().toLowerCase() || null;

  const auth = req.auth!;
  if (auth.role !== "super_admin" && (auth.userType === "student" || auth.id !== teacherId)) {
    sendError(res, 403, "You can only add students to your own roster");
    return;
  }

  // Block school-managed teachers — only principals (and solo teachers) can create students
  if (auth.userType === "teacher") {
    const [guardianRow] = await db
      .select({ schoolId: profilesTable.schoolId })
      .from(profilesTable)
      .where(eq(profilesTable.id, auth.id))
      .limit(1);
    if (guardianRow?.schoolId) {
      sendError(res, 403, "Teachers managed by a school cannot add students. Ask your principal to add and assign students.");
      return;
    }
  }

  // Gate principal student creation by district-allocated seat count
  if (auth.userType === "principal") {
    const [principalRow] = await db
      .select({ schoolId: profilesTable.schoolId })
      .from(profilesTable)
      .where(eq(profilesTable.id, auth.id))
      .limit(1);

    const schoolId = principalRow?.schoolId;
    if (schoolId) {
      const allocResult = await db.execute(sql`
        select coalesce(sum(seats_allocated), 0) as total_allocated
        from district_seat_allocations
        where school_id = ${schoolId}
      `);
      const seatsAllocated = Number(
        (allocResult.rows as Record<string, unknown>[])[0]?.total_allocated ?? 0,
      );

      if (seatsAllocated > 0) {
        const [countRow] = await db
          .select({ n: count(studentsTable.id) })
          .from(studentsTable)
          .innerJoin(profilesTable, eq(studentsTable.guardianId, profilesTable.id))
          .where(eq(profilesTable.schoolId, schoolId));

        const seatsUsed = Number(countRow?.n ?? 0);
        if (seatsUsed >= seatsAllocated) {
          sendError(
            res,
            422,
            `Seat limit reached. Your school has been allocated ${seatsAllocated} seat${seatsAllocated !== 1 ? "s" : ""} by the district and all are in use. Contact your district admin to increase the allocation.`,
          );
          return;
        }
      }
    }
  }

  const [student] = await db
    .insert(studentsTable)
    .values({
      guardianId: teacherId,
      name,
      gradeBand,
      stateAssessment,
      homeLanguage: homeLanguage ?? null,
      email: normalizedEmail,
    })
    .returning();

  // Initialize levels — either from a guardian-entered initial score, or
  // defaulted to the assessment's minimum (placement test comes later).
  if (initialScores) {
    await applyGuardianScores(student.id, stateAssessment as Assessment, initialScores);
  } else {
    await ensureStudentLevels(student.id, stateAssessment as Assessment);
  }

  // If email was provided, send an invitation so the student can set their password
  if (normalizedEmail) {
    try {
      const [teacherRow] = await db
        .select({ name: usersTable.name })
        .from(profilesTable)
        .innerJoin(usersTable, eq(profilesTable.userId, usersTable.id))
        .where(eq(profilesTable.id, teacherId))
        .limit(1);

      const teacherName = teacherRow?.name ?? "Your teacher";
      const token = generateToken();
      const tokenHash = sha256(token);
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

      await db.insert(invitationsTable).values({
        inviterId: teacherId,
        inviterType: "teacher",
        inviterName: teacherName,
        inviteeEmail: normalizedEmail,
        inviteeName: name,
        inviteeRole: "student",
        gradeBand,
        stateAssessment,
        homeLanguage: homeLanguage?.trim() || null,
        tokenHash,
        expiresAt,
      });

      const inviteUrl = `${getAppUrl(req)}/accept-invite?token=${token}`;
      await sendHtmlEmail({
        to: normalizedEmail,
        subject: `${teacherName} invited you to ACCESS Ready`,
        html: invitationEmail({
          inviteeName: name,
          inviterName: teacherName,
          inviterRole: "teacher",
          assessment: stateAssessment,
          inviteUrl,
        }),
      });

      req.log.info({ studentId: student.id, email: normalizedEmail }, "Invitation sent to new student");
    } catch (err) {
      req.log.warn({ err, email: normalizedEmail }, "Failed to send invitation email — student still created");
    }
  }

  sendSuccess(res, {
    id: student.id,
    teacherId: student.guardianId,
    name: student.name,
    gradeBand: student.gradeBand,
    stateAssessment: student.stateAssessment,
    homeLanguage: student.homeLanguage,
    currentStreak: student.currentStreak,
    streakShieldAvailable: student.streakShieldAvailable,
    createdAt: student.createdAt.toISOString(),
  }, 201);
});

const BulkImportRowSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  gradeBand: z.string(),
  stateAssessment: z.string(),
  homeLanguage: z.string().optional(),
  guardianId: z.string().uuid().optional(),
  schoolId: z.string().uuid().optional(),
  listening: z.number().optional(),
  speaking: z.number().optional(),
  reading: z.number().optional(),
  writing: z.number().optional(),
  telpasListening: z.string().optional(),
  telpasSpeaking: z.string().optional(),
  telpasReading: z.string().optional(),
  telpasWriting: z.string().optional(),
});

const BulkImportBodySchema = z.object({
  students: z.array(BulkImportRowSchema).min(1).max(300),
});

type BulkImportContext =
  | { kind: "teacher"; guardianId: string }
  | { kind: "principal"; schoolId: string; districtId: string | null }
  | { kind: "district_admin"; districtId: string }
  | { kind: "super_admin" };

async function resolveBulkImportContext(auth: NonNullable<Request["auth"]>): Promise<BulkImportContext | string> {
  if (auth.role === "super_admin") return { kind: "super_admin" };

  if (auth.userType === "teacher") {
    const [row] = await db
      .select({ schoolId: profilesTable.schoolId })
      .from(profilesTable)
      .where(eq(profilesTable.id, auth.id))
      .limit(1);
    if (row?.schoolId) {
      return "Teachers managed by a school cannot import students. Ask your principal.";
    }
    return { kind: "teacher", guardianId: auth.id };
  }

  if (auth.userType === "principal") {
    const [row] = await db
      .select({ schoolId: profilesTable.schoolId })
      .from(profilesTable)
      .where(eq(profilesTable.id, auth.id))
      .limit(1);
    if (!row?.schoolId) {
      return "Your account is not linked to a school.";
    }
    const [school] = await db
      .select({ districtId: schoolsTable.districtId })
      .from(schoolsTable)
      .where(eq(schoolsTable.id, row.schoolId))
      .limit(1);
    return { kind: "principal", schoolId: row.schoolId, districtId: school?.districtId ?? null };
  }

  if (auth.userType === "district_admin") {
    const [row] = await db
      .select({ districtId: districtAdminsTable.districtId })
      .from(districtAdminsTable)
      .where(eq(districtAdminsTable.id, auth.id))
      .limit(1);
    if (!row?.districtId) {
      return "Your account is not linked to a district.";
    }
    return { kind: "district_admin", districtId: row.districtId };
  }

  return "You do not have permission to bulk-import students.";
}

async function resolveSchoolInDistrict(
  schoolId: string,
  districtId: string,
): Promise<boolean> {
  const [school] = await db
    .select({ id: schoolsTable.id })
    .from(schoolsTable)
    .where(and(eq(schoolsTable.id, schoolId), eq(schoolsTable.districtId, districtId)))
    .limit(1);
  return !!school;
}

async function resolveBulkImportRow(
  row: z.infer<typeof BulkImportRowSchema>,
  ctx: BulkImportContext,
): Promise<
  | { ok: true; guardianId: string | null; schoolId: string | null; districtId: string | null; accountType: AccountType }
  | { ok: false; error: string }
> {
  if (ctx.kind === "teacher") {
    return {
      ok: true,
      guardianId: ctx.guardianId,
      schoolId: null,
      districtId: null,
      accountType: "teacher_managed",
    };
  }

  if (ctx.kind === "principal") {
    let guardianId: string | null = null;
    if (row.guardianId) {
      guardianId = await resolveSchoolTeacherForAssign(row.guardianId, ctx.schoolId);
      if (!guardianId) {
        return { ok: false, error: "Teacher ID not found in your school" };
      }
    }
    return {
      ok: true,
      guardianId,
      schoolId: ctx.schoolId,
      districtId: ctx.districtId,
      accountType: guardianId ? "teacher_managed" : "school_managed",
    };
  }

  if (ctx.kind === "district_admin") {
    let schoolId: string | null = null;
    if (row.schoolId) {
      const valid = await resolveSchoolInDistrict(row.schoolId, ctx.districtId);
      if (!valid) return { ok: false, error: "School ID not found in your district" };
      schoolId = row.schoolId;
    }

    let guardianId: string | null = null;
    if (row.guardianId) {
      const resolved = await resolveDistrictSchoolTeacherForAssign(row.guardianId, ctx.districtId);
      if (!resolved) return { ok: false, error: "Teacher ID not found in your district" };
      guardianId = resolved.guardianId;
      if (!schoolId) schoolId = resolved.schoolId;
    }

    const accountType: AccountType = guardianId
      ? "teacher_managed"
      : schoolId
        ? "school_managed"
        : "district_managed";

    return {
      ok: true,
      guardianId,
      schoolId,
      districtId: ctx.districtId,
      accountType,
    };
  }

  // super_admin — trust optional row fields when present
  let schoolId = row.schoolId ?? null;
  let districtId: string | null = null;
  if (schoolId) {
    const [school] = await db
      .select({ districtId: schoolsTable.districtId })
      .from(schoolsTable)
      .where(eq(schoolsTable.id, schoolId))
      .limit(1);
    if (!school) return { ok: false, error: "School ID not found" };
    districtId = school.districtId;
  }

  let guardianId: string | null = null;
  if (row.guardianId) {
    const [g] = await db
      .select({ id: profilesTable.id, role: usersTable.role })
      .from(profilesTable)
      .innerJoin(usersTable, eq(profilesTable.userId, usersTable.id))
      .where(eq(profilesTable.id, row.guardianId))
      .limit(1);
    if (!g || (g.role !== "teacher" && g.role !== "parent")) {
      return { ok: false, error: "Teacher ID not found" };
    }
    guardianId = g.id;
  }

  const accountType: AccountType = guardianId
    ? "teacher_managed"
    : schoolId
      ? "school_managed"
      : "solo";

  return { ok: true, guardianId, schoolId, districtId, accountType };
}

async function getSchoolSeatsRemaining(schoolId: string): Promise<number | null> {
  const allocResult = await db.execute(sql`
    select coalesce(sum(seats_allocated), 0) as total_allocated
    from district_seat_allocations
    where school_id = ${schoolId}
  `);
  const seatsAllocated = Number(
    (allocResult.rows as Record<string, unknown>[])[0]?.total_allocated ?? 0,
  );
  if (seatsAllocated <= 0) return null;

  const [countRow] = await db
    .select({ n: count(studentsTable.id) })
    .from(studentsTable)
    .leftJoin(profilesTable, eq(studentsTable.guardianId, profilesTable.id))
    .where(or(eq(studentsTable.schoolId, schoolId), eq(profilesTable.schoolId, schoolId)));

  const seatsUsed = Number(countRow?.n ?? 0);
  return Math.max(0, seatsAllocated - seatsUsed);
}

// Bulk-import students from a pre-parsed list (frontend sends JSON, not a file)
router.post("/students/bulk-import", async (req, res): Promise<void> => {
  const parsed = BulkImportBodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return;
  }

  const auth = req.auth!;
  const ctxOrError = await resolveBulkImportContext(auth);
  if (typeof ctxOrError === "string") {
    sendError(res, 403, ctxOrError);
    return;
  }
  const ctx = ctxOrError;
  const { students } = parsed.data;

  const [importerRow] = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, auth.userId))
    .limit(1);
  const importerName = importerRow?.name ?? "ACCESS Ready";

  let seatsRemaining: number | null = null;
  if (ctx.kind === "principal") {
    seatsRemaining = await getSchoolSeatsRemaining(ctx.schoolId);
  }

  const results: Array<{
    row: number;
    name: string;
    status: "created" | "failed";
    inviteSent?: boolean;
    error?: string;
  }> = [];

  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    try {
      if (seatsRemaining !== null && seatsRemaining <= 0) {
        results.push({
          row: i + 1,
          name: s.name,
          status: "failed",
          error: "Seat limit reached for this school",
        });
        continue;
      }

      const resolved = await resolveBulkImportRow(s, ctx);
      if (!resolved.ok) {
        results.push({ row: i + 1, name: s.name, status: "failed", error: resolved.error });
        continue;
      }

      const normalizedEmail = s.email?.trim().toLowerCase() || null;

      const [student] = await db
        .insert(studentsTable)
        .values({
          guardianId: resolved.guardianId,
          schoolId: resolved.schoolId,
          districtId: resolved.districtId,
          accountType: resolved.accountType,
          name: s.name.trim(),
          gradeBand: s.gradeBand,
          stateAssessment: s.stateAssessment,
          homeLanguage: s.homeLanguage?.trim() || null,
          email: normalizedEmail,
        })
        .returning();

      if (seatsRemaining !== null) seatsRemaining--;

      const hasScores =
        s.listening != null || s.speaking != null ||
        s.reading != null || s.writing != null ||
        s.telpasListening || s.telpasSpeaking ||
        s.telpasReading || s.telpasWriting;

      if (hasScores) {
        await applyGuardianScores(student.id, s.stateAssessment as Assessment, {
          listening: s.listening,
          speaking: s.speaking,
          reading: s.reading,
          writing: s.writing,
          telpasListening: s.telpasListening ?? null,
          telpasSpeaking: s.telpasSpeaking ?? null,
          telpasReading: s.telpasReading ?? null,
          telpasWriting: s.telpasWriting ?? null,
        });
      } else {
        await ensureStudentLevels(student.id, s.stateAssessment as Assessment);
      }

      let inviteSent = false;
      if (normalizedEmail) {
        const inviterId = resolved.guardianId ?? auth.id;
        const inviterType =
          auth.userType === "district_admin" ? "district_admin" as const : "teacher" as const;
        let inviterName = importerName;
        if (resolved.guardianId) {
          const [g] = await db
            .select({ name: usersTable.name })
            .from(profilesTable)
            .innerJoin(usersTable, eq(profilesTable.userId, usersTable.id))
            .where(eq(profilesTable.id, resolved.guardianId))
            .limit(1);
          inviterName = g?.name ?? inviterName;
        }

        try {
          const token = generateToken();
          const tokenHash = sha256(token);
          const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
          await db.insert(invitationsTable).values({
            inviterId,
            inviterType,
            inviterName,
            inviteeEmail: normalizedEmail,
            inviteeName: s.name.trim(),
            inviteeRole: "student",
            gradeBand: s.gradeBand,
            stateAssessment: s.stateAssessment,
            homeLanguage: s.homeLanguage?.trim() || null,
            tokenHash,
            expiresAt,
          });
          const inviteUrl = `${getAppUrl(req)}/accept-invite?token=${token}`;
          await sendHtmlEmail({
            to: normalizedEmail,
            subject: `${inviterName} invited you to ACCESS Ready`,
            html: invitationEmail({
              inviteeName: s.name.trim(),
              inviterName,
              inviterRole: inviterType === "district_admin" ? "district admin" : "teacher",
              assessment: s.stateAssessment,
              inviteUrl,
            }),
          });
          inviteSent = true;
        } catch (emailErr) {
          req.log.warn({ emailErr, email: normalizedEmail }, "Bulk import: failed to send invite email");
        }
      }

      results.push({ row: i + 1, name: s.name, status: "created", inviteSent });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      results.push({ row: i + 1, name: s.name || `Row ${i + 1}`, status: "failed", error: message });
      req.log.warn({ err, row: i + 1 }, "Bulk import: failed to create student");
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  const failed = results.filter((r) => r.status === "failed").length;
  sendSuccess(res, { results, created, failed });
});

// Get student detail
router.get("/students/:studentId", requireStudentAccess("studentId"), async (req, res): Promise<void> => {
  const params = GetStudentParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, params.error.message);
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
  await ensureStudentLevels(student.id, assessment);

  const progress = await buildProgress(student.id, assessment);
  const recentSessions = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.studentId, student.id))
    .orderBy(sessionsTable.createdAt)
    .limit(20);

  const access = await resolveStudentAccess(student.id);

  sendSuccess(res, {
    student: {
      id: student.id,
      teacherId: student.guardianId,
      name: student.name,
      gradeBand: student.gradeBand,
      stateAssessment: student.stateAssessment,
      homeLanguage: student.homeLanguage,
      email: student.email,
      avatarUrl: student.avatarUrl,
      currentStreak: student.currentStreak,
      totalXp: student.totalXp,
      streakShieldAvailable: student.streakShieldAvailable,
      createdAt: student.createdAt.toISOString(),
    },
    canPractice: access.canPractice,
    accessReason: access.accessReason,
    progress,
    recentSessions: recentSessions.map((s) => ({
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
    })),
  });
});

// Update student
router.patch("/students/:studentId", requireStudentAccess("studentId"), async (req, res): Promise<void> => {
  const params = UpdateStudentParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, params.error.message);
    return;
  }

  const parsed = UpdateStudentBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return;
  }

  const auth = req.auth!;
  const updateData: Record<string, unknown> = {};
  if (parsed.data.name) updateData.name = parsed.data.name;
  if (parsed.data.gradeBand) updateData.gradeBand = parsed.data.gradeBand;
  if (parsed.data.homeLanguage) updateData.homeLanguage = parsed.data.homeLanguage;
  if (parsed.data.avatarUrl !== undefined) {
    const [studentRow] = await db
      .select({ userId: studentsTable.userId, guardianId: studentsTable.guardianId })
      .from(studentsTable)
      .where(eq(studentsTable.id, params.data.studentId))
      .limit(1);
    const isStudentOwner = auth.userType === "student" && auth.id === params.data.studentId;
    const isGuardianForManagedAccount = !studentRow?.userId && studentRow?.guardianId === auth.id;
    if (!isStudentOwner && !isGuardianForManagedAccount) {
      sendError(res, 403, "Only the student can update their profile photo");
      return;
    }
    updateData.avatarUrl = parsed.data.avatarUrl;
  }

  // assignedTeacherId — principal-only field to reassign a student to a different teacher
  if (parsed.data.assignedTeacherId !== undefined) {
    if (auth.userType !== "principal" && auth.role !== "super_admin") {
      sendError(res, 403, "Only a principal can reassign a student to a different teacher");
      return;
    }
    if (parsed.data.assignedTeacherId !== null) {
      const [principal] = await db
        .select({ schoolId: profilesTable.schoolId })
        .from(profilesTable)
        .where(eq(profilesTable.id, auth.id))
        .limit(1);
      if (!principal?.schoolId) {
        sendError(res, 403, "Your account is not linked to a school");
        return;
      }
      const teacherId = await resolveSchoolTeacherForAssign(
        parsed.data.assignedTeacherId,
        principal.schoolId,
      );
      if (!teacherId) {
        sendError(res, 403, "Target teacher does not belong to your school");
        return;
      }
      updateData.guardianId = teacherId;
      updateData.schoolId = principal.schoolId;
      updateData.accountType = "teacher_managed";
    } else {
      updateData.guardianId = null;
    }
  }

  const [student] = await db
    .update(studentsTable)
    .set(updateData)
    .where(eq(studentsTable.id, params.data.studentId))
    .returning();

  if (!student) {
    sendError(res, 404, "Student not found");
    return;
  }

  sendSuccess(res, {
    id: student.id,
    teacherId: student.guardianId,
    name: student.name,
    gradeBand: student.gradeBand,
    stateAssessment: student.stateAssessment,
    homeLanguage: student.homeLanguage,
    avatarUrl: student.avatarUrl,
    currentStreak: student.currentStreak,
    streakShieldAvailable: student.streakShieldAvailable,
    createdAt: student.createdAt.toISOString(),
  });
});

// Delete student and all related records (guardian/admin only — not the
// student's own session, since self-deletion isn't a supported flow here).
router.delete("/students/:studentId", requireStudentAccess("studentId", { allowSelf: false }), async (req, res): Promise<void> => {
  const params = GetStudentParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, params.error.message);
    return;
  }

  const { studentId } = params.data;

  const [student] = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.id, studentId))
    .limit(1);

  if (!student) {
    sendError(res, 404, "Student not found");
    return;
  }

  await db.transaction(async (tx) => {
    await tx.delete(sessionsTable).where(eq(sessionsTable.studentId, studentId));
    await tx.delete(studentLevelsTable).where(eq(studentLevelsTable.studentId, studentId));
    await tx.delete(studentsTable).where(eq(studentsTable.id, studentId));
  });

  res.status(204).send();
});

// Enter (or update) a guardian-provided score — writes directly to student_levels
router.post("/students/:studentId/scores", requireStudentAccess("studentId", { allowSelf: false }), async (req, res): Promise<void> => {
  const params = EnterStudentScoresParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, params.error.message);
    return;
  }

  const parsed = EnterStudentScoresBody.safeParse(req.body);
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
  await applyGuardianScores(student.id, assessment, parsed.data);

  const progress = await buildProgress(student.id, assessment);
  sendSuccess(res, progress, 201);
});

// Get student progress
router.get("/students/:studentId/progress", requireStudentAccess("studentId"), async (req, res): Promise<void> => {
  const params = GetStudentProgressParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, params.error.message);
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
  await ensureStudentLevels(student.id, assessment);

  const progress = await buildProgress(student.id, assessment);
  sendSuccess(res, progress);
});

// Daily AI usage series for parent/teacher graphs (UTC days).
router.get("/students/:studentId/ai-usage", requireStudentAccess("studentId"), async (req, res): Promise<void> => {
  const params = GetStudentProgressParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, params.error.message);
    return;
  }

  const daysRaw = Number(req.query.days);
  const days = Number.isFinite(daysRaw) ? daysRaw : 30;
  const usage = await getStudentAiUsage(params.data.studentId, days);
  sendSuccess(res, usage);
});

async function buildProgress(studentId: string, assessment: Assessment) {
  const config = getAssessmentConfig(assessment);

  const [levels, allSessions] = await Promise.all([
    db.select().from(studentLevelsTable).where(eq(studentLevelsTable.studentId, studentId)),
    db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.studentId, studentId), eq(sessionsTable.completed, true)))
      .orderBy(sessionsTable.createdAt),
  ]);

  const domainData = DOMAIN_TIER_PAIRS.map(({ domain, tier }) => {
    // UI key: "listening_academic" for academic listening; writing stays "writing" (academic-only).
    const domainKey =
      tier === "academic" && domain === "listening" ? `${domain}_academic` : domain;
    const levelRow = levels.find((l) => l.domain === domain && l.tier === tier);
    const currentLevel = levelRow ? parseFloat(levelRow.currentLevel) : config.scale.min;
    const exitThreshold = getExitThreshold(assessment, domain);
    const gap = Math.max(0, exitThreshold - currentLevel);
    const normalizedLevel = config.normalize(currentLevel);

    const domainSessions = allSessions.filter((s) => s.domain === domain && s.tier === tier);

    const growthRate = calculateGrowthRate(
      domainSessions.map((s) => ({
        levelStart: parseFloat(s.levelStart),
        levelEnd: s.levelEnd ? parseFloat(s.levelEnd) : null,
        createdAt: s.createdAt,
      })),
      currentLevel,
    );
    const exitProjection = projectExitDate(gap, growthRate);

    // Last 20 sessions for the chart, oldest→newest
    const sessionHistory = domainSessions.slice(-20).map((s) => ({
      date: s.createdAt.toISOString(),
      level: s.levelEnd ? parseFloat(s.levelEnd) : parseFloat(s.levelStart),
      score: s.scorePct ?? 0,
    }));

    const lastSession = domainSessions[domainSessions.length - 1];

    return {
      domain: domainKey, // UI key — "listening_academic" or plain domain name
      tier,              // raw tier for reference
      currentLevel,
      exitThreshold,
      gap,
      normalizedLevel,
      levelLabel: getLevelLabel(currentLevel, assessment),
      atExit: gap <= 0,
      growthRate,
      exitProjection: { domain: domainKey, ...exitProjection },
      sessionHistory,
      lastSessionScore: lastSession?.scorePct ?? null,
      lastPracticed: lastSession?.createdAt?.toISOString() ?? null,
      scaleMin: config.scale.min,
      scaleMax: config.scale.max,
    };
  });

  const nonExitProjections = domainData
    .filter((d) => !d.atExit && d.exitProjection.projectedDate)
    .map((d) => new Date(d.exitProjection.projectedDate!).getTime());

  const overallProjectedDate =
    nonExitProjections.length > 0
      ? new Date(Math.max(...nonExitProjections)).toISOString()
      : null;

  return {
    studentId,
    assessment,
    scaleMin: config.scale.min,
    scaleMax: config.scale.max,
    domains: domainData.map((d) => ({
      domain: d.domain,
      currentLevel: d.currentLevel,
      exitThreshold: d.exitThreshold,
      gap: d.gap,
      normalizedLevel: d.normalizedLevel,
      levelLabel: d.levelLabel,
      atExit: d.atExit,
      lastSessionScore: d.lastSessionScore,
      lastPracticed: d.lastPracticed,
      sessionHistory: d.sessionHistory,
      scaleMin: d.scaleMin,
      scaleMax: d.scaleMax,
    })),
    growthRates: domainData.map((d) => ({
      domain: d.domain,
      perSession: d.growthRate.perSession,
      weekly: d.growthRate.weekly,
      sessionsPerWeek: d.growthRate.sessionsPerWeek,
      isStalled: d.growthRate.isStalled,
      stalledSessionCount: d.growthRate.stalledSessionCount,
    })),
    exitProjections: domainData.map((d) => d.exitProjection),
    overallProjectedDate,
  };
}

// Get streak info
router.get("/students/:studentId/streak", requireStudentAccess("studentId"), async (req, res): Promise<void> => {
  const params = GetStudentStreakParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, params.error.message);
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

  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.studentId, student.id), eq(sessionsTable.completed, true)))
    .orderBy(sessionsTable.createdAt);

  const sessionDates = [...new Set(sessions.map((s) => s.createdAt.toISOString().split("T")[0]))];

  const totalSessions = sessions.length;

  // XP rank tiers
  const xp = student.totalXp;
  let rank = "Newcomer";
  let rankEmoji = "";
  let nextRankXp = 100;
  if (xp >= 2000) { rank = "Language Master"; nextRankXp = xp; }
  else if (xp >= 1200) { rank = "Expert Speaker"; nextRankXp = 2000; }
  else if (xp >= 700) { rank = "Word Wizard"; nextRankXp = 1200; }
  else if (xp >= 400) { rank = "Rising Star"; nextRankXp = 700; }
  else if (xp >= 200) { rank = "Explorer"; nextRankXp = 400; }
  else if (xp >= 100) { rank = "Learner"; nextRankXp = 200; }

  sendSuccess(res, {
    currentStreak: student.currentStreak,
    longestStreak: student.longestStreak,
    streakShieldAvailable: student.streakShieldAvailable,
    lastSessionDate: student.lastSessionDate?.toISOString() || null,
    sessionDates,
    totalXp: xp,
    rank,
    rankEmoji,
    nextRankXp,
    totalSessions,
  });
});

// Get student pathway
router.get("/students/:studentId/pathway", requireStudentAccess("studentId"), async (req, res): Promise<void> => {
  const params = GetStudentPathwayParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, params.error.message);
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
  await ensureStudentLevels(student.id, assessment);

  const levels = await db
    .select()
    .from(studentLevelsTable)
    .where(eq(studentLevelsTable.studentId, student.id));

  const config = getAssessmentConfig(assessment);

  const levelMap = Object.fromEntries(
    DOMAINS.map((d) => {
      const levelRow = levels.find((l) => l.domain === d);
      return [d, levelRow ? parseFloat(levelRow.currentLevel) : config.scale.min];
    })
  ) as Record<Domain, number>;

  const thresholdMap = Object.fromEntries(
    DOMAINS.map((d) => [d, getExitThreshold(assessment, d)]),
  ) as Record<Domain, number>;

  const gaps = calculateGaps(levelMap, thresholdMap, assessment);
  const ranked = rankDomains(gaps);
  const timeAllocation = allocateTime(gaps);

  const domainsWithAllocation = ranked.map((d) => ({
    domain: d.domain,
    priority: d.priority,
    gap: d.gap,
    allocatedMinutes: timeAllocation[d.domain],
    recommendedFirst: d.recommendedFirst,
  }));

  const nudgeMessage = generateNudgeMessage(ranked, student.name);

  const allAtExit = gaps.every((g) => g.atExit);

  sendSuccess(res, {
    studentId: student.id,
    domains: domainsWithAllocation,
    suggestedMode: allAtExit ? "single" : "all_four",
    nudgeMessage,
  });
});

// ─── Demo level jump (dev/demo only) ─────────────────────────────────────────
// Lets the logged-in student (or their teacher) instantly jump their own
// listening level to any value — purely for demonstration purposes.
router.post("/students/:studentId/demo-jump", requireStudentAccess("studentId"), async (req, res): Promise<void> => {
  const studentId = req.params.studentId as string;
  const { domain = "listening", level } = req.body as { domain?: string; level: number };

  if (typeof level !== "number" || level < 0 || level > 10) {
    sendError(res, 400, "level must be a number between 0 and 10");
    return;
  }

  const [student] = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.id, studentId))
    .limit(1);

  if (!student) {
    sendError(res, 404, "Student not found");
    return;
  }

  // Ensure the level row exists first
  const assessment = student.stateAssessment as Assessment;
  await ensureStudentLevels(student.id, assessment);

  const domainStr  = typeof domain === "string" ? domain : "listening";
  const tierStr    =
    domainStr === "listening_academic" || domainStr === "writing" ? "academic" : "general";
  const coreDomain = domainStr === "listening_academic" ? "listening" : domainStr;

  const [levelRow] = await db
    .select()
    .from(studentLevelsTable)
    .where(and(
      eq(studentLevelsTable.studentId, studentId),
      eq(studentLevelsTable.domain, coreDomain),
      eq(studentLevelsTable.tier, tierStr),
    ))
    .limit(1);

  if (levelRow) {
    await db
      .update(studentLevelsTable)
      .set({ currentLevel: level.toString(), atExit: false, consecutivePassCount: "0", consecutiveFailCount: "0", updatedAt: new Date() })
      .where(eq(studentLevelsTable.id, levelRow.id));
  }

  sendSuccess(res, { studentId, domain: domainStr, level });
});

export { buildProgress };
export default router;
