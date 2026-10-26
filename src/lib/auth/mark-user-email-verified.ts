import { and, eq, isNull } from "drizzle-orm";
import { db, studentsTable, usersTable } from "../../../db";

export async function markUserEmailVerified(userId: string): Promise<
  | { ok: true; email: string; role: string; emailVerified: true; hasPassword: boolean }
  | { ok: false; status: 404; message: string }
> {
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      role: usersTable.role,
      passwordHash: usersTable.passwordHash,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    return { ok: false, status: 404, message: "User not found" };
  }

  await db.update(usersTable).set({ emailVerified: true }).where(eq(usersTable.id, userId));

  if (user.role === "student") {
    await db
      .update(studentsTable)
      .set({ emailVerified: true, userId })
      .where(eq(studentsTable.userId, userId));

    if (user.email) {
      await db
        .update(studentsTable)
        .set({ emailVerified: true, userId })
        .where(and(eq(studentsTable.email, user.email), isNull(studentsTable.userId)));
    }
  }

  return {
    ok: true,
    email: user.email,
    role: user.role,
    emailVerified: true,
    hasPassword: Boolean(user.passwordHash),
  };
}
