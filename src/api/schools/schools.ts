import { Router, type IRouter } from "express";
import { eq, count, countDistinct, sql, and, or } from "drizzle-orm";
import { z } from "zod/v4";
import { db, schoolsTable, districtsTable, profilesTable, usersTable, studentsTable } from "../../../db";
import { sendError, sendSuccess } from "../../lib/http/api-response";
import { requireAuth } from "../../middlewares/auth";
import {
  assertSchoolAccess,
  requireOrgStaff,
  resolveOrgScope,
  sendAccessDenied,
} from "../../lib/auth/org-access";

const router: IRouter = Router();

router.use("/schools", requireAuth, requireOrgStaff);

const CreateSchoolBody = z.object({
  name: z.string().min(1),
  districtId: z.string().uuid().optional(),
  state: z.string().optional(),
  schoolCode: z.string().optional(),
});

const SchoolIdParam = z.object({ schoolId: z.string().uuid() });
const TeacherIdParam = z.object({ schoolId: z.string().uuid(), teacherId: z.string().uuid() });

const schoolListQuery = db
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

// List schools — scoped to caller's org
router.get("/schools", async (req, res): Promise<void> => {
  const auth = req.auth!;
  const scope = await resolveOrgScope(auth);
  if (!scope) {
    sendError(res, 403, "Organization access required");
    return;
  }

  const queryDistrictId = typeof req.query.districtId === "string" ? req.query.districtId : undefined;

  if (scope.role === "super_admin") {
    const schools = queryDistrictId
      ? await schoolListQuery.where(eq(schoolsTable.districtId, queryDistrictId))
      : await schoolListQuery;
    sendSuccess(res, schools);
    return;
  }

  if (scope.role === "district_admin") {
    if (queryDistrictId && queryDistrictId !== scope.districtId) {
      sendError(res, 403, "You do not have access to that district");
      return;
    }
    const schools = await schoolListQuery.where(eq(schoolsTable.districtId, scope.districtId));
    sendSuccess(res, schools);
    return;
  }

  // Principal — own school only
  const schools = await schoolListQuery.where(eq(schoolsTable.id, scope.schoolId));
  sendSuccess(res, schools);
});

// Create a school — super_admin or district_admin (in their district)
router.post("/schools", async (req, res): Promise<void> => {
  const auth = req.auth!;
  const scope = await resolveOrgScope(auth);
  if (!scope) {
    sendError(res, 403, "Organization access required");
    return;
  }

  if (scope.role === "principal") {
    sendError(res, 403, "Only district administrators can create schools");
    return;
  }

  const parsed = CreateSchoolBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return;
  }

  let districtId = parsed.data.districtId ?? null;
  if (scope.role === "district_admin") {
    if (districtId && districtId !== scope.districtId) {
      sendError(res, 403, "You can only create schools in your district");
      return;
    }
    districtId = scope.districtId;
  }

  const [school] = await db
    .insert(schoolsTable)
    .values({
      name: parsed.data.name,
      districtId,
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

  const denied = await assertSchoolAccess(req.auth!, params.data.schoolId);
  if (denied) { sendAccessDenied(res, denied); return; }

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

  const denied = await assertSchoolAccess(req.auth!, params.data.schoolId);
  if (denied) { sendAccessDenied(res, denied); return; }

  const scope = await resolveOrgScope(req.auth!);
  if (scope?.role === "principal") {
    sendError(res, 403, "Principals cannot update school settings");
    return;
  }

  const parsed = CreateSchoolBody.partial().safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return;
  }

  const updates: Partial<typeof schoolsTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.state !== undefined) updates.state = parsed.data.state;
  if (parsed.data.schoolCode !== undefined) updates.schoolCode = parsed.data.schoolCode;

  if (parsed.data.districtId !== undefined) {
    if (scope?.role === "district_admin" && parsed.data.districtId !== scope.districtId) {
      sendError(res, 403, "You cannot move a school outside your district");
      return;
    }
    updates.districtId = parsed.data.districtId;
  }

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

  const denied = await assertSchoolAccess(req.auth!, params.data.schoolId);
  if (denied) { sendAccessDenied(res, denied); return; }

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

  const denied = await assertSchoolAccess(req.auth!, params.data.schoolId);
  if (denied) { sendAccessDenied(res, denied); return; }

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
    .leftJoin(profilesTable, eq(studentsTable.guardianId, profilesTable.id))
    .where(
      or(
        eq(studentsTable.schoolId, params.data.schoolId),
        eq(profilesTable.schoolId, params.data.schoolId),
      ),
    )
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

  const denied = await assertSchoolAccess(req.auth!, params.data.schoolId);
  if (denied) { sendAccessDenied(res, denied); return; }

  const scope = await resolveOrgScope(req.auth!);
  if (scope?.role === "district_admin") {
    sendError(res, 403, "Only principals can assign teachers to a school");
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
router.get("/schools/:schoolId/seat-allocation", async (req, res): Promise<void> => {
  const params = SchoolIdParam.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "Invalid school ID");
    return;
  }

  const denied = await assertSchoolAccess(req.auth!, params.data.schoolId);
  if (denied) { sendAccessDenied(res, denied); return; }

  const { schoolId } = params.data;

  const allocResult = await db.execute(sql`
    select coalesce(sum(seats_allocated), 0) as total_allocated
    from district_seat_allocations
    where school_id = ${schoolId}
  `);
  const seatsAllocated = Number(
    (allocResult.rows as Record<string, unknown>[])[0]?.total_allocated ?? 0,
  );

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

  const denied = await assertSchoolAccess(req.auth!, params.data.schoolId);
  if (denied) { sendAccessDenied(res, denied); return; }

  const scope = await resolveOrgScope(req.auth!);
  if (scope?.role === "district_admin") {
    sendError(res, 403, "Only principals can remove teachers from a school");
    return;
  }

  const [guardian] = await db
    .update(profilesTable)
    .set({ schoolId: null })
    .where(
      and(
        eq(profilesTable.id, params.data.teacherId),
        eq(profilesTable.schoolId, params.data.schoolId),
      ),
    )
    .returning({ id: profilesTable.id });

  if (!guardian) {
    sendError(res, 404, "Teacher not found in this school");
    return;
  }

  sendSuccess(res, { ok: true });
});

export default router;
