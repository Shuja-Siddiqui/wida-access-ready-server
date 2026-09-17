import { and, eq, or } from "drizzle-orm";
import { db, districtAdminsTable, profilesTable, schoolsTable, studentsTable } from "../../../db";
import type { AuthContext } from "../../middlewares/auth";
import {
  ObjectPermission,
  canAccessObject,
  type S3ObjectRef,
} from "./objectAcl";

const UPLOADS_KEY_PREFIX = "uploads/";

/** Canonical `/objects/<s3-key>` path used in the DB and API. */
export function normalizeStorageObjectPath(rawPath: string): string {
  if (rawPath.startsWith("/objects/")) return rawPath;
  if (rawPath.startsWith("objects/")) return `/${rawPath}`;
  return `/objects/${rawPath.replace(/^\/+/, "")}`;
}

export function s3KeyFromObjectPath(objectPath: string): string {
  const normalized = normalizeStorageObjectPath(objectPath);
  if (!normalized.startsWith("/objects/")) {
    throw new Error("Invalid object path");
  }
  return normalized.slice("/objects/".length);
}

export function isUserUploadKey(key: string): boolean {
  return key.startsWith(UPLOADS_KEY_PREFIX);
}

/** Student owns their avatar (logged-in student account). */
async function isStudentAvatarOwner(auth: AuthContext, objectPath: string): Promise<boolean> {
  const [row] = await db
    .select({ id: studentsTable.id })
    .from(studentsTable)
    .where(and(eq(studentsTable.avatarUrl, objectPath), eq(studentsTable.userId, auth.userId)))
    .limit(1);
  return !!row;
}

/** Teacher or parent who manages the student on their roster. */
async function isGuardianOfStudentAvatar(auth: AuthContext, objectPath: string): Promise<boolean> {
  const [row] = await db
    .select({ id: studentsTable.id })
    .from(studentsTable)
    .where(and(eq(studentsTable.avatarUrl, objectPath), eq(studentsTable.guardianId, auth.id)))
    .limit(1);
  return !!row;
}

/** Educator/parent profile owns their avatar. */
async function isProfileAvatarOwner(auth: AuthContext, objectPath: string): Promise<boolean> {
  const [row] = await db
    .select({ id: profilesTable.id })
    .from(profilesTable)
    .where(and(eq(profilesTable.avatarUrl, objectPath), eq(profilesTable.userId, auth.userId)))
    .limit(1);
  return !!row;
}

async function canPrincipalViewAvatar(auth: AuthContext, objectPath: string): Promise<boolean> {
  const [principal] = await db
    .select({ schoolId: profilesTable.schoolId })
    .from(profilesTable)
    .where(eq(profilesTable.id, auth.id))
    .limit(1);
  if (!principal?.schoolId) return false;

  const schoolId = principal.schoolId;

  const [studentMatch] = await db
    .select({ id: studentsTable.id })
    .from(studentsTable)
    .leftJoin(profilesTable, eq(studentsTable.guardianId, profilesTable.id))
    .where(
      and(
        eq(studentsTable.avatarUrl, objectPath),
        or(eq(studentsTable.schoolId, schoolId), eq(profilesTable.schoolId, schoolId)),
      ),
    )
    .limit(1);
  if (studentMatch) return true;

  const [profileMatch] = await db
    .select({ id: profilesTable.id })
    .from(profilesTable)
    .where(and(eq(profilesTable.avatarUrl, objectPath), eq(profilesTable.schoolId, schoolId)))
    .limit(1);
  return !!profileMatch;
}

async function canDistrictAdminViewAvatar(auth: AuthContext, objectPath: string): Promise<boolean> {
  const [admin] = await db
    .select({ districtId: districtAdminsTable.districtId })
    .from(districtAdminsTable)
    .where(eq(districtAdminsTable.id, auth.id))
    .limit(1);
  if (!admin?.districtId) return false;

  const districtId = admin.districtId;

  const [studentMatch] = await db
    .select({ id: studentsTable.id })
    .from(studentsTable)
    .leftJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
    .where(
      and(
        eq(studentsTable.avatarUrl, objectPath),
        or(eq(studentsTable.districtId, districtId), eq(schoolsTable.districtId, districtId)),
      ),
    )
    .limit(1);
  if (studentMatch) return true;

  const [profileMatch] = await db
    .select({ id: profilesTable.id })
    .from(profilesTable)
    .innerJoin(schoolsTable, eq(profilesTable.schoolId, schoolsTable.id))
    .where(and(eq(profilesTable.avatarUrl, objectPath), eq(schoolsTable.districtId, districtId)))
    .limit(1);
  return !!profileMatch;
}

/**
 * View access for avatar paths registered in the DB.
 * Owner, roster guardian (teacher/parent), or staff above them in the org chart.
 */
async function canViewAvatarRecord(auth: AuthContext, objectPath: string): Promise<boolean> {
  if (await isStudentAvatarOwner(auth, objectPath)) return true;
  if (await isProfileAvatarOwner(auth, objectPath)) return true;
  if (await isGuardianOfStudentAvatar(auth, objectPath)) return true;
  if (auth.userType === "principal") return canPrincipalViewAvatar(auth, objectPath);
  if (auth.userType === "district_admin") return canDistrictAdminViewAvatar(auth, objectPath);
  return false;
}

export async function canAccessPrivateObject(
  auth: AuthContext,
  objectFile: S3ObjectRef,
  objectPath: string,
): Promise<boolean> {
  if (auth.role === "super_admin") return true;

  const normalizedPath = normalizeStorageObjectPath(objectPath);

  const aclAllowed = await canAccessObject({
    userId: auth.userId,
    objectFile,
    requestedPermission: ObjectPermission.READ,
  });
  if (aclAllowed) return true;

  // ACL owner is the uploader — staff can still view when the path is a registered
  // avatar in their school/district (legacy uploads may have no ACL metadata at all).
  if (isUserUploadKey(objectFile.key)) {
    return canViewAvatarRecord(auth, normalizedPath);
  }

  return false;
}
