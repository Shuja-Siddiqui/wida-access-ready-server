import { and, eq } from "drizzle-orm";
import { db, userSessionsTable, usersTable } from "../../../db";

export async function setUserActive(userId: string, isActive: boolean): Promise<void> {
  await db.update(usersTable).set({ isActive }).where(eq(usersTable.id, userId));
}

/** Sessions store profile id (staff) or student id — not users.id. */
export async function revokeStaffSessions(
  profileId: string,
  userType: "teacher" | "principal" | "district_admin",
): Promise<void> {
  await db
    .delete(userSessionsTable)
    .where(and(eq(userSessionsTable.userId, profileId), eq(userSessionsTable.userType, userType)));
}

export async function revokeStudentSessions(studentId: string): Promise<void> {
  await db
    .delete(userSessionsTable)
    .where(and(eq(userSessionsTable.userId, studentId), eq(userSessionsTable.userType, "student")));
}
