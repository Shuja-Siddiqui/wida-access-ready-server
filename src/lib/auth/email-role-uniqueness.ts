import bcrypt from "bcryptjs";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, invitationsTable, usersTable } from "../../../db";

/** Roles created through invitation or role-specific signup. */
export type AccountRole =
  | "student"
  | "teacher"
  | "principal"
  | "district_admin"
  | "parent"
  | "super_admin";

const ROLE_LABEL: Record<string, string> = {
  student: "student",
  teacher: "teacher",
  principal: "principal",
  district_admin: "district administrator",
  parent: "parent",
  super_admin: "super admin",
};

export function roleLabelForAccount(role: string): string {
  return ROLE_LABEL[role] ?? role.replace(/_/g, " ");
}

/** Parse role from Postgres `users_email_role_unique` violation detail. */
export function parseRoleFromEmailRoleUniqueDetail(detail?: string): AccountRole | null {
  if (!detail) return null;
  const match = detail.match(/\(email,\s*role\)=\([^,]+,\s*([^)]+)\)/i);
  const raw = match?.[1]?.trim();
  if (!raw) return null;
  if (raw in ROLE_LABEL) {
    return raw as AccountRole;
  }
  return null;
}

export function messageForEmailRoleConflict(role?: string | null): string {
  if (role) {
    return `An account with this email already exists as a ${roleLabelForAccount(role)}.`;
  }
  return "An account with this email already exists for this user type.";
}

export async function findUserByEmailAndRole(
  email: string,
  role: AccountRole,
): Promise<{ id: string } | undefined> {
  const normalized = email.trim().toLowerCase();
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.email, normalized), eq(usersTable.role, role)))
    .limit(1);
  return row;
}

export async function findActiveInvitationByEmailAndRole(
  email: string,
  inviteeRole: string,
): Promise<{ id: string } | undefined> {
  const normalized = email.trim().toLowerCase();
  const [row] = await db
    .select({ id: invitationsTable.id })
    .from(invitationsTable)
    .where(
      and(
        eq(invitationsTable.inviteeEmail, normalized),
        eq(invitationsTable.inviteeRole, inviteeRole),
        isNull(invitationsTable.acceptedAt),
        gt(invitationsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row;
}

export type EmailRoleConflict =
  | { ok: true }
  | { ok: false; status: 409; message: string };

/**
 * Ensures this email can receive an invitation (or signup) for the given role.
 * Same email may be used for a different role (e.g. teacher vs principal).
 */
export async function assertEmailAvailableForRole(
  email: string,
  role: AccountRole,
  options?: { inviteeRole?: string },
): Promise<EmailRoleConflict> {
  const inviteRole = options?.inviteeRole ?? role;
  const existing = await findUserByEmailAndRole(email, role);
  if (existing) {
    return {
      ok: false,
      status: 409,
      message: messageForEmailRoleConflict(role),
    };
  }

  const pending = await findActiveInvitationByEmailAndRole(email, inviteRole);
  if (pending) {
    return {
      ok: false,
      status: 409,
      message: `An active invitation for this email as ${roleLabelForAccount(inviteRole)} already exists.`,
    };
  }

  return { ok: true };
}

/** Maps verification / password-reset `userType` to `users.role`. */
export function accountRoleForAuthUserType(userType: string): AccountRole {
  switch (userType) {
    case "parent":
      return "parent";
    case "teacher":
      return "teacher";
    case "student":
    default:
      return "student";
  }
}

export function userRolesForLoginApiRole(apiRole: string): AccountRole[] {
  switch (apiRole) {
    case "student":
      return ["student"];
    case "parent":
      return ["parent"];
    case "administrator":
      return ["district_admin", "principal", "teacher", "parent"];
    case "teacher":
      return ["teacher", "principal"];
    default:
      return [];
  }
}

export async function findUsersForLoginApiRole(
  email: string,
  apiRole: string,
): Promise<(typeof usersTable.$inferSelect)[]> {
  const normalized = email.trim().toLowerCase();
  const allowed = userRolesForLoginApiRole(apiRole);
  if (!allowed.length) return [];

  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, normalized));

  return rows.filter((row) => allowed.includes(row.role as AccountRole));
}

/** Account exists for this login role but has no password yet (initial setup required). */
export function pickUserNeedingPasswordSetup(
  candidates: (typeof usersTable.$inferSelect)[],
  apiRole: string,
): (typeof usersTable.$inferSelect) | null {
  const allowed = userRolesForLoginApiRole(apiRole);
  const pending = candidates.filter((u) => !u.passwordHash);
  if (!pending.length) return null;
  pending.sort(
    (a, b) => allowed.indexOf(a.role as AccountRole) - allowed.indexOf(b.role as AccountRole),
  );
  return pending[0] ?? null;
}

export async function findAuthenticatedUserForLogin(
  email: string,
  password: string,
  apiRole: string,
): Promise<(typeof usersTable.$inferSelect) | null> {
  const normalized = email.trim().toLowerCase();
  const allowed = userRolesForLoginApiRole(apiRole);
  if (!allowed.length) return null;

  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, normalized));

  const matches: (typeof usersTable.$inferSelect)[] = [];
  for (const row of rows) {
    if (!row.passwordHash) continue;
    const valid = await bcrypt.compare(password, row.passwordHash);
    if (!valid) continue;
    if (row.isActive === false) continue;
    if (allowed.includes(row.role as AccountRole)) {
      matches.push(row);
    }
  }

  if (!matches.length) return null;

  matches.sort(
    (a, b) => allowed.indexOf(a.role as AccountRole) - allowed.indexOf(b.role as AccountRole),
  );
  return matches[0]!;
}
