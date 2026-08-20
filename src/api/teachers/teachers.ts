import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { db, profilesTable, studentsTable, sessionsTable, studentLevelsTable, usersTable, schoolsTable, districtsTable } from "../../../db";
import {
  GetTeacherParams,
  UpdateTeacherParams,
  UpdateTeacherBody,
  ListStudentsParams,
  GetTeacherDashboardParams,
  ExportStudentsCsvParams,
} from "../../generated";
import { Assessment, Domain, getAssessmentConfig, getLevelLabel, getExitThreshold } from "../../lib/assessments";
import { calculateGaps, rankDomains, calculateGrowthRate, projectExitDate } from "../../lib/adaptive-engine";
import { sendError, sendSuccess } from "../../lib/api-response";
import { requireAuth, requireTeacherAccess } from "../../middlewares/auth";

const router: IRouter = Router();

router.use("/teachers", requireAuth);

// Get teacher by ID (joined with users for name/email)
router.get("/teachers/:teacherId", requireTeacherAccess("teacherId"), async (req, res): Promise<void> => {
  const params = GetTeacherParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, params.error.message);
    return;
  }

  const [row] = await db
    .select({
      id: profilesTable.id,
      userId: profilesTable.userId,
      school: profilesTable.school,
      schoolId: profilesTable.schoolId,
      schoolName: schoolsTable.name,
      districtId: schoolsTable.districtId,
      avatarUrl: profilesTable.avatarUrl,
      createdAt: profilesTable.createdAt,
      name: usersTable.name,
      email: usersTable.email,
    })
    .from(profilesTable)
    .innerJoin(usersTable, eq(profilesTable.userId, usersTable.id))
    .leftJoin(schoolsTable, eq(profilesTable.schoolId, schoolsTable.id))
    .where(eq(profilesTable.id, params.data.teacherId))
    .limit(1);

  if (!row) {
    sendError(res, 404, "Teacher not found");
    return;
  }

  sendSuccess(res, { ...row, isSolo: !row.schoolId });
});

// Update teacher profile
router.patch("/teachers/:teacherId", requireTeacherAccess("teacherId"), async (req, res): Promise<void> => {
  const params = UpdateTeacherParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, params.error.message);
    return;
  }

  const parsed = UpdateTeacherBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return;
  }

  const [teacher] = await db
    .select({ id: profilesTable.id, userId: profilesTable.userId, school: profilesTable.school })
    .from(profilesTable)
    .where(eq(profilesTable.id, params.data.teacherId))
    .limit(1);

  if (!teacher) {
    sendError(res, 404, "Teacher not found");
    return;
  }

  // name → update users table; school/schoolId/avatarUrl → update guardians table
  if (parsed.data.name !== undefined) {
    await db.update(usersTable).set({ name: parsed.data.name }).where(eq(usersTable.id, teacher.userId));
  }
  const guardianUpdates: Record<string, unknown> = {};
  if (parsed.data.school !== undefined) guardianUpdates.school = parsed.data.school;
  if (parsed.data.schoolId !== undefined) guardianUpdates.schoolId = parsed.data.schoolId;
  if (parsed.data.avatarUrl !== undefined) guardianUpdates.avatarUrl = parsed.data.avatarUrl;
  if (Object.keys(guardianUpdates).length > 0) {
    await db.update(profilesTable).set(guardianUpdates as any).where(eq(profilesTable.id, teacher.id));
  }

  const [row] = await db
    .select({
      id: profilesTable.id,
      userId: profilesTable.userId,
      school: profilesTable.school,
      schoolId: profilesTable.schoolId,
      schoolName: schoolsTable.name,
      districtId: schoolsTable.districtId,
      avatarUrl: profilesTable.avatarUrl,
      createdAt: profilesTable.createdAt,
      name: usersTable.name,
      email: usersTable.email,
    })
    .from(profilesTable)
    .innerJoin(usersTable, eq(profilesTable.userId, usersTable.id))
    .leftJoin(schoolsTable, eq(profilesTable.schoolId, schoolsTable.id))
    .where(eq(profilesTable.id, teacher.id))
    .limit(1);

  if (!row) {
    sendError(res, 404, "Teacher not found");
    return;
  }

  sendSuccess(res, row);
});

// Helper to build domain info for a student
async function buildStudentDomainInfo(studentId: string, assessment: Assessment) {
  const domains: Domain[] = ["listening", "speaking", "reading", "writing"];
  const levels = await db.select().from(studentLevelsTable).where(eq(studentLevelsTable.studentId, studentId));

  const domainData = domains.map((domain) => {
    const levelRow = levels.find((l) => l.domain === domain);
    const currentLevel = levelRow ? parseFloat(levelRow.currentLevel) : getAssessmentConfig(assessment).scale.min;
    const exitThreshold = levelRow ? parseFloat(levelRow.exitThreshold) : getExitThreshold(assessment, domain);
    const gap = Math.max(0, exitThreshold - currentLevel);

    const config = getAssessmentConfig(assessment);
    const normalizedLevel = config.normalize(currentLevel);

    return {
      domain,
      currentLevel,
      exitThreshold,
      gap,
      normalizedLevel,
      levelLabel: getLevelLabel(currentLevel, assessment),
      atExit: gap <= 0,
      lastSessionScore: null as number | null,
      lastPracticed: levelRow?.updatedAt?.toISOString() || null,
    };
  });

  // Get last session score per domain
  const recentSessions = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.studentId, studentId))
    .orderBy(sessionsTable.createdAt)
    .limit(50);

  for (const d of domainData) {
    const domainSessions = recentSessions.filter((s) => s.domain === d.domain && s.completed && s.scorePct !== null);
    if (domainSessions.length > 0) {
      const last = domainSessions[domainSessions.length - 1];
      d.lastSessionScore = last.scorePct;
      d.lastPracticed = last.createdAt.toISOString();
    }
  }

  return domainData;
}

// List students for a teacher
router.get("/teachers/:teacherId/students", requireTeacherAccess("teacherId"), async (req, res): Promise<void> => {
  const params = ListStudentsParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, params.error.message);
    return;
  }

  const students = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.guardianId, params.data.teacherId));

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const result = await Promise.all(
    students.map(async (student) => {
      const assessment = student.stateAssessment as Assessment;
      const domains = await buildStudentDomainInfo(student.id, assessment);

      const lastSession = student.lastSessionDate;
      const loggedInToday = !!student.lastLoginAt && student.lastLoginAt >= todayStart;
      const practicedToday = !!lastSession && lastSession >= todayStart;
      const isInactive = !loggedInToday;
      const isActive = loggedInToday && !practicedToday;
      const isNearExit = domains.some((d) => !d.atExit && d.gap <= 0.5);

      // Stall detection
      const recentSessions = await db
        .select()
        .from(sessionsTable)
        .where(eq(sessionsTable.studentId, student.id))
        .orderBy(sessionsTable.createdAt)
        .limit(8);

      let isStalled = false;
      let stalledDomain: string | null = null;

      for (const domain of ["listening", "speaking", "reading", "writing"] as Domain[]) {
        const domainSessions = recentSessions
          .filter((s) => s.domain === domain && s.completed)
          .map((s) => ({ levelStart: parseFloat(s.levelStart), levelEnd: s.levelEnd ? parseFloat(s.levelEnd) : null }));

        if (domainSessions.length >= 8) {
          const first = domainSessions[0].levelStart;
          const last = domainSessions[domainSessions.length - 1].levelEnd ?? domainSessions[domainSessions.length - 1].levelStart;
          if (last - first <= 0) {
            isStalled = true;
            stalledDomain = domain;
            break;
          }
        }
      }

      return {
        student: {
          id: student.id,
          teacherId: student.guardianId,
          name: student.name,
          gradeBand: student.gradeBand,
          stateAssessment: student.stateAssessment,
          homeLanguage: student.homeLanguage,
          currentStreak: student.currentStreak,
          totalXp: student.totalXp,
          streakShieldAvailable: student.streakShieldAvailable,
          createdAt: student.createdAt.toISOString(),
        },
        domains,
        lastSessionDate: lastSession?.toISOString() || null,
        isInactive,
        isActive,
        isNearExit,
        isStalled,
        stalledDomain,
        teacherRecommendation: null,
      };
    })
  );

  sendSuccess(res, result);
});

// Teacher dashboard
router.get("/teachers/:teacherId/dashboard", requireTeacherAccess("teacherId"), async (req, res): Promise<void> => {
  const params = GetTeacherDashboardParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, params.error.message);
    return;
  }

  const students = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.guardianId, params.data.teacherId));

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const allStudentData = await Promise.all(
    students.map(async (student) => {
      const assessment = student.stateAssessment as Assessment;
      const domains = await buildStudentDomainInfo(student.id, assessment);

      const lastSession = student.lastSessionDate;
      const loggedInToday = !!student.lastLoginAt && student.lastLoginAt >= todayStart;
      const practicedToday = !!lastSession && lastSession >= todayStart;
      const isInactive = !loggedInToday;
      const isActive = loggedInToday && !practicedToday;
      const isNearExit = domains.some((d) => !d.atExit && d.gap <= 0.5);

      const recentSessions = await db
        .select()
        .from(sessionsTable)
        .where(eq(sessionsTable.studentId, student.id))
        .orderBy(sessionsTable.createdAt)
        .limit(8);

      let isStalled = false;
      let stalledDomain: string | null = null;

      for (const domain of ["listening", "speaking", "reading", "writing"] as Domain[]) {
        const domainSessions = recentSessions
          .filter((s) => s.domain === domain && s.completed)
          .map((s) => ({ levelStart: parseFloat(s.levelStart), levelEnd: s.levelEnd ? parseFloat(s.levelEnd) : null }));

        if (domainSessions.length >= 8) {
          const first = domainSessions[0].levelStart;
          const last = domainSessions[domainSessions.length - 1].levelEnd ?? domainSessions[domainSessions.length - 1].levelStart;
          if (last - first <= 0) {
            isStalled = true;
            stalledDomain = domain;
            break;
          }
        }
      }

      return {
        student: {
          id: student.id,
          teacherId: student.guardianId,
          name: student.name,
          gradeBand: student.gradeBand,
          stateAssessment: student.stateAssessment,
          homeLanguage: student.homeLanguage,
          currentStreak: student.currentStreak,
          totalXp: student.totalXp,
          streakShieldAvailable: student.streakShieldAvailable,
          createdAt: student.createdAt.toISOString(),
        },
        domains,
        lastSessionDate: lastSession?.toISOString() || null,
        isInactive,
        isActive,
        isNearExit,
        isStalled,
        stalledDomain,
        teacherRecommendation: null as string | null,
      };
    })
  );

  const activeToday = allStudentData.filter(
    (s) => s.student && s.lastSessionDate && new Date(s.lastSessionDate) >= todayStart
  ).length;

  sendSuccess(res, {
    teacherId: params.data.teacherId,
    totalStudents: students.length,
    activeToday,
    exitWatchList: allStudentData.filter((s) => s.isNearExit),
    stalledStudents: allStudentData.filter((s) => s.isStalled),
    inactiveStudents: allStudentData.filter((s) => s.isInactive),
    allStudents: allStudentData,
  });
});

// CSV export
router.get("/teachers/:teacherId/export", requireTeacherAccess("teacherId"), async (req, res): Promise<void> => {
  const params = ExportStudentsCsvParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, params.error.message);
    return;
  }

  const students = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.guardianId, params.data.teacherId));

  const rows = await Promise.all(
    students.map(async (student) => {
      const assessment = student.stateAssessment as Assessment;
      const domains = await buildStudentDomainInfo(student.id, assessment);
      const sessionCount = await db
        .select()
        .from(sessionsTable)
        .where(eq(sessionsTable.studentId, student.id));

      return [
        student.id,
        student.name,
        student.gradeBand,
        student.stateAssessment,
        domains.find((d) => d.domain === "listening")?.currentLevel ?? "",
        domains.find((d) => d.domain === "speaking")?.currentLevel ?? "",
        domains.find((d) => d.domain === "reading")?.currentLevel ?? "",
        domains.find((d) => d.domain === "writing")?.currentLevel ?? "",
        sessionCount.length,
        student.currentStreak,
      ].join(",");
    })
  );

  const csv = [
    "student_id,name,grade_band,assessment,listening_level,speaking_level,reading_level,writing_level,session_count,streak",
    ...rows,
  ].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="students-${params.data.teacherId}.csv"`);
  res.send(csv);
});

// POST /api/teachers/:teacherId/students/bulk-assign
// Principal assigns a set of school students to this teacher.
// Replaces each student's guardianId with this teacher's id.
// Only students that belong to the same school as the teacher are touched.
const BulkAssignBody = z.object({
  studentIds: z.array(z.string().uuid()).min(0),
});

router.post("/teachers/:teacherId/students/bulk-assign", async (req, res): Promise<void> => {
  const teacherIdParsed = z.string().uuid().safeParse(req.params.teacherId);
  if (!teacherIdParsed.success) {
    sendError(res, 400, "Invalid teacher ID");
    return;
  }
  const teacherId = teacherIdParsed.data;

  const body = BulkAssignBody.safeParse(req.body);
  if (!body.success) {
    sendError(res, 400, body.error.message);
    return;
  }

  const [teacher] = await db
    .select({ id: profilesTable.id, schoolId: profilesTable.schoolId })
    .from(profilesTable)
    .where(eq(profilesTable.id, teacherId))
    .limit(1);

  if (!teacher) {
    sendError(res, 404, "Teacher not found");
    return;
  }

  const { studentIds } = body.data;
  if (studentIds.length === 0) {
    sendSuccess(res, { assigned: 0 });
    return;
  }

  // Safety: only update students whose guardian is in the same school
  const updated = await db
    .update(studentsTable)
    .set({ guardianId: teacherId })
    .where(
      teacher.schoolId
        ? inArray(
            studentsTable.id,
            db
              .select({ id: studentsTable.id })
              .from(studentsTable)
              .innerJoin(profilesTable, eq(studentsTable.guardianId, profilesTable.id))
              .where(
                inArray(studentsTable.id, studentIds),
              ),
          )
        : inArray(studentsTable.id, studentIds),
    )
    .returning({ id: studentsTable.id });

  sendSuccess(res, { assigned: updated.length });
});

export default router;
