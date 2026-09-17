// Authentication + ownership guards shared across all protected routes.
//
// resolveSession()  — core: token → AuthContext | null  (one source of truth)
// requireAuth       — gates the route; 401 if no valid session
// optionalAuth      — always continues; attaches req.auth when a valid session exists
// requireSuperAdmin — role check after requireAuth
// requireStudentAccess / requireTeacherAccess / requireOwnerAccess — ownership guards

import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db, districtAdminsTable, profilesTable, studentsTable, userSessionsTable, usersTable } from "../../db";
import {
  assertStudentOrgAccess,
  assertTeacherProfileOrgAccess,
  sendAccessDenied,
} from "../lib/auth/org-access";
import { sendError } from "../lib/http/api-response";

export type UserType = "student" | "teacher" | "parent" | "principal" | "district_admin";

export interface AuthContext {
  /** guardians.id (teacher/parent) or students.id (student) — matches route :studentId/:teacherId params. */
  id: string;
  /** users.id — the unified identity row. */
  userId: string;
  userType: UserType;
  /** Full role from users.role (student | parent | teacher | principal | district_admin | super_admin). */
  role: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const raw = header.slice(7).trim();
    if (raw) return raw;
  }
  // Fallback for requests that can't set an Authorization header (e.g. SSR
  // server forwarding the browser's Cookie header to prefetch auth-gated data).
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.authToken;
  return typeof cookieToken === "string" && cookieToken.length > 0 ? cookieToken : null;
}

function sha256(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Core session resolver — the single source of truth for turning a bearer
 * token into an AuthContext.  Returns null if the token is missing, expired,
 * or can't be matched to a live user row.  Never throws.
 */
async function resolveSession(req: Request): Promise<AuthContext | null> {
  const raw = extractBearer(req);
  if (!raw) return null;

  const tokenHash = sha256(raw);
  const now = new Date();

  const [session] = await db
    .select()
    .from(userSessionsTable)
    .where(and(eq(userSessionsTable.tokenHash, tokenHash), gt(userSessionsTable.expiresAt, now)))
    .limit(1);

  if (!session) return null;

  const userType = session.userType as UserType;

  if (userType === "student") {
    const [row] = await db
      .select({ userId: studentsTable.userId, role: usersTable.role })
      .from(studentsTable)
      .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
      .where(eq(studentsTable.id, session.userId))
      .limit(1);
    if (!row?.userId) return null;
    return { id: session.userId, userId: row.userId, userType, role: row.role };
  }

  if (userType === "district_admin") {
    const [row] = await db
      .select({ userId: districtAdminsTable.userId, role: usersTable.role })
      .from(districtAdminsTable)
      .innerJoin(usersTable, eq(districtAdminsTable.userId, usersTable.id))
      .where(eq(districtAdminsTable.id, session.userId))
      .limit(1);
    if (!row) return null;
    return { id: session.userId, userId: row.userId, userType, role: row.role };
  }

  // "teacher" | "parent" | "principal" — all backed by a profiles/guardians row
  const [row] = await db
    .select({ userId: profilesTable.userId, role: usersTable.role })
    .from(profilesTable)
    .innerJoin(usersTable, eq(profilesTable.userId, usersTable.id))
    .where(eq(profilesTable.id, session.userId))
    .limit(1);
  if (!row) return null;
  return { id: session.userId, userId: row.userId, userType, role: row.role };
}

// ── Exported middleware ───────────────────────────────────────────────────────

/**
 * Resolves the bearer token and attaches `req.auth`.
 * Responds 401 and stops the chain if no valid session exists.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const raw = extractBearer(req);
  if (!raw) {
    sendError(res, 401, "Authentication required");
    return;
  }

  const auth = await resolveSession(req);
  if (!auth) {
    sendError(res, 401, "Invalid or expired session");
    return;
  }

  req.auth = auth;
  next();
}

/**
 * Best-effort auth — attaches `req.auth` when a valid session is present,
 * but always calls next().  Use on routes that work anonymously but should
 * still record the caller's identity when signed in (e.g. the detect page).
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = await resolveSession(req);
    if (auth) req.auth = auth;
  } catch {
    // Never block the request over an auth resolution failure
  }
  next();
}

/**
 * Allows only `super_admin` role. Must run after `requireAuth`.
 */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) { sendError(res, 401, "Authentication required"); return; }
  if (req.auth.role !== "super_admin") { sendError(res, 403, "Super admin access required"); return; }
  next();
}

/**
 * Guards a `:studentId`-shaped route. Allows:
 *  - the student themselves (unless `allowSelf: false`, e.g. destructive actions),
 *  - the guardian (teacher/parent) that owns that student,
 *  - a super_admin.
 * Must run after `requireAuth`. Responds 404 if the student doesn't exist,
 * 403 if the caller isn't authorized for it.
 */
export function requireStudentAccess(paramName = "studentId", options: { allowSelf?: boolean } = {}) {
  const { allowSelf = true } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const auth = req.auth;
    if (!auth) { sendError(res, 401, "Authentication required"); return; }
    if (auth.role === "super_admin") { next(); return; }

    const studentId = req.params[paramName] as string | undefined;
    if (!studentId) { sendError(res, 400, `Missing ${paramName}`); return; }

    if (auth.userType === "student") {
      if (!allowSelf || auth.id !== studentId) {
        sendError(res, 403, "You do not have access to this student's data");
        return;
      }
      next();
      return;
    }

    const [student] = await db
      .select({
        guardianId: studentsTable.guardianId,
        schoolId: studentsTable.schoolId,
        districtId: studentsTable.districtId,
      })
      .from(studentsTable)
      .where(eq(studentsTable.id, studentId))
      .limit(1);

    if (!student) { sendError(res, 404, "Student not found"); return; }

    if (student.guardianId && student.guardianId === auth.id) {
      next();
      return;
    }

    if (auth.userType === "principal" || auth.userType === "district_admin") {
      const denied = await assertStudentOrgAccess(auth, student);
      if (denied) {
        sendAccessDenied(res, denied);
        return;
      }
      next();
      return;
    }

    sendError(res, 403, "You do not have access to this student's data");
  };
}

/**
 * Guards a `:teacherId`-shaped route (guardian id). Allows:
 *  - the guardian themselves
 *  - super_admin, principal, district_admin
 *  - a student whose guardianId matches the requested teacherId
 * Must run after `requireAuth`.
 */
export function requireTeacherAccess(paramName = "teacherId") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const auth = req.auth;
    if (!auth) { sendError(res, 401, "Authentication required"); return; }
    if (auth.role === "super_admin") { next(); return; }

    const teacherId = req.params[paramName] as string | undefined;
    if (!teacherId) { sendError(res, 403, "You do not have access to this teacher's data"); return; }

    if (auth.userType === "principal" || auth.userType === "district_admin") {
      const denied = await assertTeacherProfileOrgAccess(auth, teacherId);
      if (denied) {
        sendAccessDenied(res, denied);
        return;
      }
      next();
      return;
    }

    if (auth.userType !== "student" && auth.id === teacherId) { next(); return; }

    if (auth.userType === "student") {
      const [row] = await db
        .select({ guardianId: studentsTable.guardianId })
        .from(studentsTable)
        .where(eq(studentsTable.id, auth.id))
        .limit(1);

      if (row?.guardianId && row.guardianId === teacherId) { next(); return; }
    }

    sendError(res, 403, "You do not have access to this teacher's data");
  };
}

/**
 * Guards resources identified by a polymorphic `ownerId`.
 * Allows the matching owner or a super_admin. Must run after `requireAuth`.
 */
export function requireOwnerAccess(getOwnerId: (req: Request) => string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (!auth) { sendError(res, 401, "Authentication required"); return; }
    if (auth.role === "super_admin") { next(); return; }

    const ownerId = getOwnerId(req);
    if (!ownerId || ownerId !== auth.id) {
      sendError(res, 403, "You do not have access to this resource");
      return;
    }

    next();
  };
}
