import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db, studentTeacherAssignmentsTable, studentsTable, type Student } from "../../../db";

export async function teacherIsAssignedToStudent(
  teacherProfileId: string,
  studentId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ studentId: studentTeacherAssignmentsTable.studentId })
    .from(studentTeacherAssignmentsTable)
    .where(
      and(
        eq(studentTeacherAssignmentsTable.teacherProfileId, teacherProfileId),
        eq(studentTeacherAssignmentsTable.studentId, studentId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function fetchAssignedTeacherIdsByStudentIds(
  studentIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (studentIds.length === 0) return map;

  const rows = await db
    .select({
      studentId: studentTeacherAssignmentsTable.studentId,
      teacherProfileId: studentTeacherAssignmentsTable.teacherProfileId,
    })
    .from(studentTeacherAssignmentsTable)
    .where(inArray(studentTeacherAssignmentsTable.studentId, studentIds));

  for (const row of rows) {
    const list = map.get(row.studentId) ?? [];
    list.push(row.teacherProfileId);
    map.set(row.studentId, list);
  }
  return map;
}

export async function fetchStudentsForTeacherProfile(teacherProfileId: string): Promise<Student[]> {
  const links = await db
    .select({ studentId: studentTeacherAssignmentsTable.studentId })
    .from(studentTeacherAssignmentsTable)
    .where(eq(studentTeacherAssignmentsTable.teacherProfileId, teacherProfileId));

  const studentIds = links.map((l) => l.studentId);
  if (studentIds.length === 0) return [];

  return db
    .select()
    .from(studentsTable)
    .where(inArray(studentsTable.id, studentIds))
    .orderBy(studentsTable.name);
}

/** Add teacher to student roster without removing other teachers. */
export async function ensureStudentTeacherAssignment(
  studentId: string,
  teacherProfileId: string,
  schoolId?: string | null,
): Promise<void> {
  await db
    .insert(studentTeacherAssignmentsTable)
    .values({ studentId, teacherProfileId })
    .onConflictDoNothing();

  const [row] = await db
    .select({ guardianId: studentsTable.guardianId })
    .from(studentsTable)
    .where(eq(studentsTable.id, studentId))
    .limit(1);

  const patch: Partial<typeof studentsTable.$inferInsert> = { accountType: "teacher_managed" };
  if (schoolId) patch.schoolId = schoolId;
  if (!row?.guardianId) patch.guardianId = teacherProfileId;

  await db.update(studentsTable).set(patch).where(eq(studentsTable.id, studentId));
}

/**
 * Principal sync: studentIds = full set assigned to this teacher.
 * Does not remove the student from other teachers' rosters.
 */
export async function syncTeacherStudentAssignments(
  teacherProfileId: string,
  studentIds: string[],
  schoolId: string,
): Promise<number> {
  if (studentIds.length === 0) {
    await db
      .delete(studentTeacherAssignmentsTable)
      .where(eq(studentTeacherAssignmentsTable.teacherProfileId, teacherProfileId));
    return 0;
  }

  await db
    .delete(studentTeacherAssignmentsTable)
    .where(
      and(
        eq(studentTeacherAssignmentsTable.teacherProfileId, teacherProfileId),
        notInArray(studentTeacherAssignmentsTable.studentId, studentIds),
      ),
    );

  let assigned = 0;
  for (const studentId of studentIds) {
    await ensureStudentTeacherAssignment(studentId, teacherProfileId, schoolId);
    assigned += 1;
  }
  return assigned;
}

/** After guardian_id changes, keep junction in sync for the primary teacher. */
export async function syncPrimaryGuardianAssignment(
  studentId: string,
  guardianId: string | null,
): Promise<void> {
  if (!guardianId) return;
  await db
    .insert(studentTeacherAssignmentsTable)
    .values({ studentId, teacherProfileId: guardianId })
    .onConflictDoNothing();
}