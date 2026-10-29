/**
 * Demo-only roster visibility for district teachers.
 *
 * When DISTRICT_DEMO_SHARED_ROSTER is enabled, school-linked teachers see every
 * student in their district on existing teacher dashboard / list / export APIs.
 * `students.guardianId` remains the single assigned teacher (production behavior).
 * Turn the flag off to restore guardian-only rosters with no API changes.
 */

import { eq, inArray, or } from "drizzle-orm";
import { db, profilesTable, schoolsTable, studentsTable, type Student } from "../../../db";
import { resolveStudentOrgIds, type StudentOrgRow } from "./org-access";

export function isDistrictDemoSharedRoster(): boolean {
  const v = process.env.DISTRICT_DEMO_SHARED_ROSTER?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export async function getTeacherDistrictId(teacherProfileId: string): Promise<string | null> {
  const [profile] = await db
    .select({ schoolId: profilesTable.schoolId })
    .from(profilesTable)
    .where(eq(profilesTable.id, teacherProfileId))
    .limit(1);

  if (!profile?.schoolId) return null;

  const [school] = await db
    .select({ districtId: schoolsTable.districtId })
    .from(schoolsTable)
    .where(eq(schoolsTable.id, profile.schoolId))
    .limit(1);

  return school?.districtId ?? null;
}

/** Read-only demo access: teacher in same district as the student. */
export async function teacherCanViewStudentInDistrictDemo(
  teacherProfileId: string,
  student: StudentOrgRow,
): Promise<boolean> {
  if (!isDistrictDemoSharedRoster()) return false;

  const teacherDistrictId = await getTeacherDistrictId(teacherProfileId);
  if (!teacherDistrictId) return false;

  const { schoolId, districtId: studentDistrictId } = await resolveStudentOrgIds(student);
  if (studentDistrictId === teacherDistrictId) return true;

  if (schoolId) {
    const [school] = await db
      .select({ districtId: schoolsTable.districtId })
      .from(schoolsTable)
      .where(eq(schoolsTable.id, schoolId))
      .limit(1);
    if (school?.districtId === teacherDistrictId) return true;
  }

  return false;
}

/** Students shown on GET …/dashboard, …/students, and …/export for a teacher. */
export async function fetchStudentsForTeacherRoster(teacherId: string): Promise<Student[]> {
  if (!isDistrictDemoSharedRoster()) {
    return db.select().from(studentsTable).where(eq(studentsTable.guardianId, teacherId));
  }

  const districtId = await getTeacherDistrictId(teacherId);
  if (!districtId) {
    return db.select().from(studentsTable).where(eq(studentsTable.guardianId, teacherId));
  }

  const schoolsInDistrict = await db
    .select({ id: schoolsTable.id })
    .from(schoolsTable)
    .where(eq(schoolsTable.districtId, districtId));

  const schoolIds = schoolsInDistrict.map((s) => s.id);
  const districtMatch = eq(studentsTable.districtId, districtId);
  if (schoolIds.length === 0) {
    return db.select().from(studentsTable).where(districtMatch);
  }

  return db
    .select()
    .from(studentsTable)
    .where(or(districtMatch, inArray(studentsTable.schoolId, schoolIds)));
}
