import { Router, type IRouter } from "express";
import { eq, count, countDistinct, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db, schoolsTable, districtsTable, profilesTable, usersTable, studentsTable, districtSeatAllocationsTable } from "../../../db";
import { sendError, sendSuccess } from "../../lib/api-response";
import { requireAuth } from "../../middlewares/auth";

const router: IRouter = Router();

router.use("/schools", requireAuth);

const CreateSchoolBody = z.object({
  name: z.string().min(1),
  districtId: z.string().uuid().optional(),
  state: z.string().optional(),
  schoolCode: z.string().optional(),
});

const SchoolIdParam = z.object({ schoolId: z.string().uuid() });
const TeacherIdParam = z.object({ schoolId: z.string().uuid(), teacherId: z.string().uuid() });

// List all schools (optional ?districtId= filter)
router.get("/schools", async (req, res): Promise<void> => {
  const districtId = typeof req.query.districtId === "string" ? req.query.districtId : undefined;

  const query = db
    .select({
      id: schoolsTable.id,
      name: schoolsTable.name,
      state: schoolsTable.state,
      schoolCode: schoolsTable.schoolCode,
      districtId: schoolsTable.districtId,
      districtName: districtsTable.name,
      createdAt: schoolsTable.createdAt,
      teacherCount: countDistinct(profilesTable.id),
      studentCount: countDistinct(studentsTable.id),
    })
    .from(schoolsTable)
    .leftJoin(districtsTable, eq(schoolsTable.districtId, districtsTable.id))
    .leftJoin(profilesTable, eq(profilesTable.schoolId, schoolsTable.id))
    .leftJoin(studentsTable, eq(studentsTable.guardianId, profilesTable.id))
    .groupBy(schoolsTable.id, districtsTable.name)
    .orderBy(schoolsTable.name);

  const schools = districtId
    ? await query.where(eq(schoolsTable.districtId, districtId))
    : await query;

  sendSuccess(res, schools);
});

// Create a school
router.post("/schools", async (req, res): Promise<void> => {
  const parsed = CreateSchoolBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return;
  }

  const [school] = await db
    .insert(schoolsTable)
    .values({
      name: parsed.data.name,
      districtId: parsed.data.districtId ?? null,
      state: parsed.data.state ?? null,
      schoolCode: parsed.data.schoolCode ?? null,
    })
    .returning();

  sendSuccess(res, school, 201);
});

// Get a single school
router.get("/schools/:schoolId", async (req, res): Promise<void> => {
  const params = SchoolIdParam.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "Invalid school ID");
    return;
  }

  const [school] = await db
    .select({
      id: schoolsTable.id,
      name: schoolsTable.name,
      state: schoolsTable.state,
      schoolCode: schoolsTable.schoolCode,
      districtId: schoolsTable.districtId,
      districtName: districtsTable.name,
      createdAt: schoolsTable.createdAt,
      teacherCount: count(profilesTable.id),
    })
    .from(schoolsTable)
    .leftJoin(districtsTable, eq(schoolsTable.districtId, districtsTable.id))
    .leftJoin(profilesTable, eq(profilesTable.schoolId, schoolsTable.id))
    .where(eq(schoolsTable.id, params.data.schoolId))
    .groupBy(schoolsTable.id, districtsTable.name)
    .limit(1);

  if (!school) {
    sendError(res, 404, "School not found");
    return;
  }

  sendSuccess(res, school);
});

// Update a school
router.patch("/schools/:schoolId", async (req, res): Promise<void> => {
  const params = SchoolIdParam.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "Invalid school ID");
    return;
  }

  const parsed = CreateSchoolBody.partial().safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return;
  }

  const updates: Partial<typeof schoolsTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.districtId !== undefined) updates.districtId = parsed.data.districtId;
  if (parsed.data.state !== undefined) updates.state = parsed.data.state;
  if (parsed.data.schoolCode !== undefined) updates.schoolCode = parsed.data.schoolCode;

  if (Object.keys(updates).length === 0) {
    sendError(res, 400, "No fields to update");
    return;
  }

  const [school] = await db
    .update(schoolsTable)
    .set(updates)
    .where(eq(schoolsTable.id, params.data.schoolId))
    .returning();

  if (!school) {
    sendError(res, 404, "School not found");
    return;
  }

  sendSuccess(res, school);
});

// List teachers in a school
router.get("/schools/:schoolId/teachers", async (req, res): Promise<void> => {
  const params = SchoolIdParam.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "Invalid school ID");
    return;
  }

  const teachers = await db
    .select({
      id: profilesTable.id,
      userId: profilesTable.userId,
      schoolId: profilesTable.schoolId,
      avatarUrl: profilesTable.avatarUrl,
      createdAt: profilesTable.createdAt,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
    })
    .from(profilesTable)
    .innerJoin(usersTable, eq(profilesTable.userId, usersTable.id))
    .where(eq(profilesTable.schoolId, params.data.schoolId))
    .orderBy(usersTable.name);

  sendSuccess(res, teachers);
});

// List students in a school (via their guardian's school link)
router.get("/schools/:schoolId/students", async (req, res): Promise<void> => {
  const params = SchoolIdParam.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "Invalid school ID");
    return;
  }

  const students = await db
    .select({
      id: studentsTable.id,
      name: studentsTable.name,
      gradeBand: studentsTable.gradeBand,
      stateAssessment: studentsTable.stateAssessment,
      guardianId: studentsTable.guardianId,
      currentStreak: studentsTable.currentStreak,
      totalXp: studentsTable.totalXp,
    })
    .from(studentsTable)
    .innerJoin(profilesTable, eq(studentsTable.guardianId, profilesTable.id))
    .where(eq(profilesTable.schoolId, params.data.schoolId))
    .orderBy(studentsTable.name);

  sendSuccess(res, students);
});

// Link a teacher to this school (PUT = idempotent)
router.put("/schools/:schoolId/teachers/:teacherId", async (req, res): Promise<void> => {
  const params = TeacherIdParam.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "Invalid school or teacher ID");
    return;
  }

  const [school] = await db
    .select({ id: schoolsTable.id })
    .from(schoolsTable)
    .where(eq(schoolsTable.id, params.data.schoolId))
    .limit(1);

  if (!school) {
    sendError(res, 404, "School not found");
    return;
  }

  const [guardian] = await db
    .update(profilesTable)
    .set({ schoolId: params.data.schoolId })
    .where(eq(profilesTable.id, params.data.teacherId))
    .returning({ id: profilesTable.id, schoolId: profilesTable.schoolId });

  if (!guardian) {
    sendError(res, 404, "Teacher not found");
    return;
  }

  sendSuccess(res, guardian);
});

// GET /api/schools/:schoolId/seat-allocation
// Returns seats allocated by the district, seats currently used (enrolled
// students), and remaining seats for this school.
router.get("/schools/:schoolId/seat-allocation", async (req, res): Promise<void> => {
  const params = SchoolIdParam.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "Invalid school ID");
    return;
  }

  const { schoolId } = params.data;

  // Sum all allocations for this school across all district admins
  const allocResult = await db.execute(sql`
    select coalesce(sum(seats_allocated), 0) as total_allocated
    from district_seat_allocations
    where school_id = ${schoolId}
  `);
  const seatsAllocated = Number(
    (allocResult.rows as Record<string, unknown>[])[0]?.total_allocated ?? 0,
  );

  // Count students currently enrolled via any guardian in this school
  const [countRow] = await db
    .select({ n: count(studentsTable.id) })
    .from(studentsTable)
    .innerJoin(profilesTable, eq(studentsTable.guardianId, profilesTable.id))
    .where(eq(profilesTable.schoolId, schoolId));

  const seatsUsed = Number(countRow?.n ?? 0);
  const seatsRemaining = seatsAllocated > 0 ? Math.max(0, seatsAllocated - seatsUsed) : null;

  sendSuccess(res, {
    schoolId,
    seatsAllocated,
    seatsUsed,
    seatsRemaining,
    hasAllocation: seatsAllocated > 0,
  });
});

// Remove a teacher from this school
router.delete("/schools/:schoolId/teachers/:teacherId", async (req, res): Promise<void> => {
  const params = TeacherIdParam.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "Invalid school or teacher ID");
    return;
  }

  const [guardian] = await db
    .update(profilesTable)
    .set({ schoolId: null })
    .where(eq(profilesTable.id, params.data.teacherId))
    .returning({ id: profilesTable.id });

  if (!guardian) {
    sendError(res, 404, "Teacher not found");
    return;
  }

  sendSuccess(res, { ok: true });
});

export default router;
