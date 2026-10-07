/**
 * Auth session management — opaque tokens stored in Postgres.
 *
 * Students get single-device enforcement: a new login revokes all prior
 * sessions and refresh tokens for that student profile id.
 */

import crypto from "node:crypto";
import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import { db, refreshTokensTable, userSessionsTable } from "../../../db";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export type SessionUserType = "student" | "teacher" | "parent" | "principal" | "district_admin";

export function sha256Token(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export interface SessionContext {
  userAgent: string | null;
  ipAddress: string | null;
}

export function sessionContextFromRequest(req: Request): SessionContext {
  const headers = req.headers ?? {};
  const userAgent = typeof headers["user-agent"] === "string"
    ? headers["user-agent"].slice(0, 512)
    : null;
  const forwarded = headers["x-forwarded-for"];
  const ipRaw = typeof forwarded === "string"
    ? forwarded.split(",")[0]?.trim()
    : req.socket?.remoteAddress;
  const ipAddress = ipRaw ? ipRaw.slice(0, 64) : null;
  return { userAgent, ipAddress };
}

/** Students may only hold one active session at a time. */
export function isSingleSessionUserType(userType: SessionUserType): boolean {
  return userType === "student";
}

export async function revokeUserSessions(
  userId: string,
  userType: SessionUserType,
): Promise<void> {
  await Promise.all([
    db
      .delete(userSessionsTable)
      .where(and(eq(userSessionsTable.userId, userId), eq(userSessionsTable.userType, userType))),
    db
      .delete(refreshTokensTable)
      .where(and(eq(refreshTokensTable.userId, userId), eq(refreshTokensTable.userType, userType))),
  ]);
}

export async function createSessionPair(params: {
  userId: string;
  userType: SessionUserType;
  context?: SessionContext;
  enforceSingleSession?: boolean;
}): Promise<{
  token: string;
  refreshToken: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
}> {
  const {
    userId,
    userType,
    context,
    enforceSingleSession = isSingleSessionUserType(userType),
  } = params;

  if (enforceSingleSession) {
    await revokeUserSessions(userId, userType);
  }

  const token = generateOpaqueToken();
  const refreshToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  const now = new Date();

  await Promise.all([
    db.insert(userSessionsTable).values({
      userId,
      userType,
      tokenHash: sha256Token(token),
      expiresAt,
      userAgent: context?.userAgent ?? null,
      ipAddress: context?.ipAddress ?? null,
      lastActiveAt: now,
    }),
    db.insert(refreshTokensTable).values({
      userId,
      userType,
      tokenHash: sha256Token(refreshToken),
      expiresAt: refreshExpiresAt,
    }),
  ]);

  return { token, refreshToken, expiresAt, refreshExpiresAt };
}

export async function touchSessionActivity(tokenHash: string): Promise<void> {
  await db
    .update(userSessionsTable)
    .set({ lastActiveAt: new Date() })
    .where(eq(userSessionsTable.tokenHash, tokenHash));
}
