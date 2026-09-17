import type { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, districtAdminsTable, profilesTable, schoolsTable, usersTable } from "../../../db";
import type { AuthContext } from "../../middlewares/auth";
import { sendError } from "../http/api-response";

export type StudentOrgRow = {
  schoolId: string | null;
  districtId: string | null;
  guardianId: string | null;
};

export type OrgScope =
  | { role: "super_admin" }
  | { role: "district_admin"; districtId: string }
  | { role: "principal"; schoolId: string };

type AccessDenied = { ok: false; status: 400 | 403 | 404; message: string };

/** principal, district_admin, or super_admin with a resolvable org scope. */
export async function resolveOrgScope(auth: AuthContext): Promise<OrgScope | null> {
  if (auth.role === "super_admin") return { role: "super_admin" };

  if (auth.userType === "district_admin") {
    const [admin] = await db
      .select({ districtId: districtAdminsTable.districtId })
      .from(districtAdminsTable)
      .where(eq(districtAdminsTable.id, auth.id))
      .limit(1);
    if (!admin?.districtId) return null;
    return { role: "district_admin", districtId: admin.districtId };
  }

  if (auth.userType === "principal") {
    const [profile] = await db
      .select({ schoolId: profilesTable.schoolId })
      .from(profilesTable)
      .where(eq(profilesTable.id, auth.id))
      .limit(1);
    if (!profile?.schoolId) return null;
    return { role: "principal", schoolId: profile.schoolId };
  }

  return null;
}

export async function assertDistrictAccess(
  auth: AuthContext,
  districtId: string,
): Promise<AccessDenied | null> {
  const scope = await resolveOrgScope(auth);
  if (!scope) {
    return { ok: false, status: 403, message: "Organization access required" };
  }
  if (scope.role === "super_admin") return null;
  if (scope.role === "district_admin" && scope.districtId === districtId) return null;

  return { ok: false, status: 403, message: "You do not have access to this district" };
}

export async function assertSchoolAccess(
  auth: AuthContext,
  schoolId: string,
): Promise<AccessDenied | null> {
  const scope = await resolveOrgScope(auth);
  if (!scope) {
    return { ok: false, status: 403, message: "Organization access required" };
  }
  if (scope.role === "super_admin") return null;

  const [school] = await db
    .select({ id: schoolsTable.id, districtId: schoolsTable.districtId })
    .from(schoolsTable)
    .where(eq(schoolsTable.id, schoolId))
    .limit(1);

  if (!school) {
    return { ok: false, status: 404, message: "School not found" };
  }

  if (scope.role === "principal") {
    if (scope.schoolId !== schoolId) {
      return { ok: false, status: 403, message: "You do not have access to this school" };
    }
    return null;
  }

  if (scope.role === "district_admin") {
    if (school.districtId !== scope.districtId) {
      return { ok: false, status: 403, message: "You do not have access to this school" };
    }
    return null;
  }

  return { ok: false, status: 403, message: "You do not have access to this school" };
}

/** Reject students, teachers, and parents before org-scoped routes. */
export async function requireOrgStaff(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.auth) {
    sendError(res, 401, "Authentication required");
    return;
  }

  const scope = await resolveOrgScope(req.auth);
  if (!scope) {
    sendError(res, 403, "Organization access required (principal, district admin, or super admin)");
    return;
  }

  next();
}

export function sendAccessDenied(res: Response, denied: AccessDenied): void {
  sendError(res, denied.status, denied.message);
}

/** Principal (same school), district admin (district), or super admin — for bulk roster assign. */
export async function assertTeacherBulkAssignAccess(
  auth: AuthContext,
  teacherSchoolId: string | null,
): Promise<AccessDenied | null> {
  if (!teacherSchoolId) {
    return { ok: false, status: 400, message: "Teacher must belong to a school" };
  }
  return assertSchoolAccess(auth, teacherSchoolId);
}

/** Resolve effective school/district for a student row (mirrors billing fallback). */
export async function resolveStudentOrgIds(student: StudentOrgRow): Promise<{
  schoolId: string | null;
  districtId: string | null;
}> {
  let schoolId = student.schoolId;
  let districtId = student.districtId;

  if (!schoolId && student.guardianId) {
    const [guardian] = await db
      .select({ schoolId: profilesTable.schoolId })
      .from(profilesTable)
      .where(eq(profilesTable.id, student.guardianId))
      .limit(1);
    schoolId = guardian?.schoolId ?? null;
  }

  if (!districtId && schoolId) {
    const [school] = await db
      .select({ districtId: schoolsTable.districtId })
      .from(schoolsTable)
      .where(eq(schoolsTable.id, schoolId))
      .limit(1);
    districtId = school?.districtId ?? null;
  }

  return { schoolId, districtId };
}

/** Principal (same school) or district admin (same district) — for student routes. */
export async function assertStudentOrgAccess(
  auth: AuthContext,
  student: StudentOrgRow,
): Promise<AccessDenied | null> {
  if (auth.role === "super_admin") return null;

  const scope = await resolveOrgScope(auth);
  if (!scope || scope.role === "super_admin") return null;

  const { schoolId, districtId } = await resolveStudentOrgIds(student);

  if (scope.role === "principal") {
    if (!schoolId || schoolId !== scope.schoolId) {
      return { ok: false, status: 403, message: "You do not have access to this student" };
    }
    return null;
  }

  if (scope.role === "district_admin") {
    if (districtId === scope.districtId) return null;
    if (schoolId) {
      const [school] = await db
        .select({ districtId: schoolsTable.districtId })
        .from(schoolsTable)
        .where(eq(schoolsTable.id, schoolId))
        .limit(1);
      if (school?.districtId === scope.districtId) return null;
    }
    return { ok: false, status: 403, message: "You do not have access to this student" };
  }

  return { ok: false, status: 403, message: "You do not have access to this student" };
}

/** Org staff may only view teachers linked to a school in their scope. */
export async function assertTeacherProfileOrgAccess(
  auth: AuthContext,
  teacherProfileId: string,
): Promise<AccessDenied | null> {
  if (auth.role === "super_admin") return null;

  const [teacher] = await db
    .select({ schoolId: profilesTable.schoolId, role: usersTable.role })
    .from(profilesTable)
    .innerJoin(usersTable, eq(profilesTable.userId, usersTable.id))
    .where(eq(profilesTable.id, teacherProfileId))
    .limit(1);

  if (!teacher || teacher.role !== "teacher") {
    return { ok: false, status: 404, message: "Teacher not found" };
  }
  if (!teacher.schoolId) {
    return { ok: false, status: 403, message: "Teacher is not linked to a school" };
  }

  return assertSchoolAccess(auth, teacher.schoolId);
}

/** School-scoped teacher for roster assign / bulk import (must belong to the school). */
export async function resolveSchoolTeacherForAssign(
  guardianId: string,
  schoolId: string,
): Promise<string | null> {
  const [row] = await db
    .select({
      id: profilesTable.id,
      role: usersTable.role,
      profileSchoolId: profilesTable.schoolId,
    })
    .from(profilesTable)
    .innerJoin(usersTable, eq(profilesTable.userId, usersTable.id))
    .where(eq(profilesTable.id, guardianId))
    .limit(1);

  if (!row || row.role !== "teacher") return null;
  if (!row.profileSchoolId || row.profileSchoolId !== schoolId) return null;
  return row.id;
}

/** District-scoped school teacher for bulk import (must belong to a school in the district). */
export async function resolveDistrictSchoolTeacherForAssign(
  guardianId: string,
  districtId: string,
): Promise<{ guardianId: string; schoolId: string } | null> {
  const [row] = await db
    .select({
      id: profilesTable.id,
      role: usersTable.role,
      profileSchoolId: profilesTable.schoolId,
    })
    .from(profilesTable)
    .innerJoin(usersTable, eq(profilesTable.userId, usersTable.id))
    .where(eq(profilesTable.id, guardianId))
    .limit(1);

  if (!row || row.role !== "teacher") return null;
  if (!row.profileSchoolId) return null;

  const [school] = await db
    .select({ districtId: schoolsTable.districtId })
    .from(schoolsTable)
    .where(and(eq(schoolsTable.id, row.profileSchoolId), eq(schoolsTable.districtId, districtId)))
    .limit(1);
  if (!school) return null;

  return { guardianId: row.id, schoolId: row.profileSchoolId };
}
