import { eq, and, sql } from "drizzle-orm";
import { db, ownerStripeCustomersTable, studentsTable, profilesTable, usersTable, districtAdminsTable, schoolsTable } from "../../db";

export type AccessReason =
  | "solo_active"
  | "guardian_active"
  | "no_plan"
  | "plan_inactive";

export interface StudentAccessResult {
  canPractice: boolean;
  accessReason: AccessReason;
}

async function hasActiveStripeSubscription(
  ownerId: string,
  ownerType: "solo" | "organization",
): Promise<boolean> {
  const [row] = await db
    .select({ stripeCustomerId: ownerStripeCustomersTable.stripeCustomerId })
    .from(ownerStripeCustomersTable)
    .where(
      and(
        eq(ownerStripeCustomersTable.ownerId, ownerId),
        eq(ownerStripeCustomersTable.ownerType, ownerType),
      ),
    )
    .limit(1);

  if (!row?.stripeCustomerId) return false;

  const result = await db.execute(sql`
    select s.id
    from "stripe"."subscriptions" s
    where s.customer = ${row.stripeCustomerId}
      and s.status = 'active'
    limit 1
  `);
  return (result.rows as unknown[]).length > 0;
}

/**
 * Check if any principal at the same school as `guardianId` has an active
 * org subscription. Used so that students assigned to a teacher are still
 * covered by the principal's school-level subscription.
 */
async function schoolPrincipalHasActivePlan(guardianId: string): Promise<boolean> {
  const [guardian] = await db
    .select({ schoolId: profilesTable.schoolId })
    .from(profilesTable)
    .where(eq(profilesTable.id, guardianId))
    .limit(1);

  if (!guardian?.schoolId) return false;

  const principals = await db
    .select({ id: profilesTable.id })
    .from(profilesTable)
    .innerJoin(usersTable, eq(profilesTable.userId, usersTable.id))
    .where(
      and(
        eq(profilesTable.schoolId, guardian.schoolId),
        eq(usersTable.role, "principal"),
      ),
    );

  for (const principal of principals) {
    if (await hasActiveStripeSubscription(principal.id, "organization")) {
      return true;
    }
  }

  return false;
}

/**
 * Check if the district that a student belongs to has an active org subscription
 * purchased by any district admin for that district.
 */
async function districtHasActivePlan(districtId: string): Promise<boolean> {
  const districtAdmins = await db
    .select({ id: districtAdminsTable.id })
    .from(districtAdminsTable)
    .where(eq(districtAdminsTable.districtId, districtId));

  for (const admin of districtAdmins) {
    if (await hasActiveStripeSubscription(admin.id, "organization")) {
      return true;
    }
  }
  return false;
}

/**
 * Resolve the effective districtId for a student using multiple fallback paths:
 *   1. students.districtId (set directly for district_managed students)
 *   2. students.schoolId → schools.districtId
 *   3. students.guardianId → guardians.schoolId → schools.districtId
 *      (teacher-managed students: districtId is null on the student row,
 *       the district is only reachable through the teacher's school)
 */
async function resolveDistrictId(student: {
  districtId: string | null;
  schoolId: string | null;
  guardianId: string | null;
}): Promise<string | null> {
  if (student.districtId) return student.districtId;

  // Try student's own schoolId
  const schoolId = student.schoolId ?? await (async () => {
    if (!student.guardianId) return null;
    const [g] = await db
      .select({ schoolId: profilesTable.schoolId })
      .from(profilesTable)
      .where(eq(profilesTable.id, student.guardianId))
      .limit(1);
    return g?.schoolId ?? null;
  })();

  if (!schoolId) return null;

  const [school] = await db
    .select({ districtId: schoolsTable.districtId })
    .from(schoolsTable)
    .where(eq(schoolsTable.id, schoolId))
    .limit(1);

  return school?.districtId ?? null;
}

/**
 * Resolve whether a student may start a practice session.
 *
 * Priority:
 *   1. Student has their own active solo Stripe subscription → solo_active
 *   2. Student's direct guardian has an active org subscription → guardian_active
 *   3. A principal at the guardian's school has an active org subscription → guardian_active
 *      (covers students that a principal assigned to a teacher in a school)
 *   4. The district the student's school belongs to has an active org subscription → guardian_active
 *      (covers teacher-managed students whose teacher's school is in a district with a plan;
 *       districtId is derived via guardian → school → district when not set directly on the student)
 *   5. No active coverage → blocked
 */
export async function resolveStudentAccess(
  studentId: string,
): Promise<StudentAccessResult> {
  const [student] = await db
    .select({
      guardianId: studentsTable.guardianId,
      schoolId: studentsTable.schoolId,
      districtId: studentsTable.districtId,
    })
    .from(studentsTable)
    .where(eq(studentsTable.id, studentId))
    .limit(1);

  if (!student) return { canPractice: false, accessReason: "no_plan" };

  // 1. Student's own solo plan
  if (await hasActiveStripeSubscription(studentId, "solo")) {
    return { canPractice: true, accessReason: "solo_active" };
  }

  const guardianId = student.guardianId;
  if (guardianId) {
    // 2. Direct guardian's org plan
    if (await hasActiveStripeSubscription(guardianId, "organization")) {
      return { canPractice: true, accessReason: "guardian_active" };
    }

    // 3. School principal's org plan (student assigned to teacher by principal)
    if (await schoolPrincipalHasActivePlan(guardianId)) {
      return { canPractice: true, accessReason: "guardian_active" };
    }
  }

  // 4. District-level plan — walk guardian → school → district when districtId is not
  //    set directly on the student (e.g. teacher-managed students).
  const districtId = await resolveDistrictId(student);
  if (districtId && await districtHasActivePlan(districtId)) {
    return { canPractice: true, accessReason: "guardian_active" };
  }

  return { canPractice: false, accessReason: guardianId ? "plan_inactive" : "no_plan" };
}
