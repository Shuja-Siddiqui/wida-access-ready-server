import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, and, gt, isNull } from "drizzle-orm";
import {
  db,
  studentsTable,
  profilesTable,
  districtAdminsTable,
  usersTable,
  userSessionsTable,
  refreshTokensTable,
  studentLevelsTable,
  passwordResetTokensTable,
  emailVerificationTokensTable,
} from "../../../db";
import { ensureStudentLevels } from "../students/students";
import { getAssessmentConfig, getExitThreshold, getExitThresholdForTrack, type Assessment, type Domain, type StudentTrack } from "../../lib/assessments";
import { sendHtmlEmail } from "../../lib/mail/mailer";
import { verificationEmail, passwordResetEmail } from "../../lib/mail/email-templates";
import { config } from "../../config/index";
import { sendError, sendSuccess } from "../../lib/http/api-response";
import { getRequestOrigin } from "../../lib/http/request-origin";

const router: IRouter = Router();

// ── Constants ──────────────────────────────────────────────────────────────
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

const STATE_COOKIE = "g_oauth_state";
const DEFAULT_GRADE_BAND = "6-8";
const DEFAULT_ASSESSMENT: Assessment = "WIDA";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const RESET_TTL_MS = 60 * 60 * 1000;             // 1 hour
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;       // 24 hours
const BCRYPT_ROUNDS = 12;

// ── Helpers ────────────────────────────────────────────────────────────────
function googleConfigured(): boolean {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

function origin(req: Request): string {
  return getRequestOrigin(req);
}

function getRedirectUri(req: Request): string {
  if (config.google.redirectUri) return config.google.redirectUri;
  return `${origin(req)}/api/auth/google/callback`;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function sha256(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function getAppUrl(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim() ?? req.protocol;
  const host = (req.headers["x-forwarded-host"] as string)?.split(",")[0]?.trim() ?? req.get("host") ?? "";
  return `${proto}://${host}`;
}

async function sendVerificationEmailTo(
  req: Request,
  email: string,
  name: string,
  userType: "student" | "teacher" | "parent",
): Promise<void> {
  const token = generateToken();
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + VERIFY_TTL_MS);

  // Invalidate any previous unused tokens for this email
  await db
    .delete(emailVerificationTokensTable)
    .where(
      and(
        eq(emailVerificationTokensTable.email, email),
        eq(emailVerificationTokensTable.userType, userType),
        isNull(emailVerificationTokensTable.usedAt),
      ),
    );

  await db.insert(emailVerificationTokensTable).values({ email, userType, tokenHash, expiresAt });

  const verifyUrl = `${getAppUrl(req)}/verify-email?token=${token}`;
  // In development, log the full URL so developers and automated tests can complete verification
  // without a working SMTP relay.  Never logged in production to prevent token leakage.
  if (process.env.NODE_ENV !== "production") {
    req.log.info({ verifyUrl, email, userType }, "Email verification link generated");
  }
  // Email delivery failure is non-fatal — account is created, user can request a resend
  try {
    await sendHtmlEmail({
      to: email,
      subject: "Verify your ACCESS Ready email",
      html: verificationEmail(name, verifyUrl),
    });
  } catch (err) {
    req.log.warn({ err, email }, "Failed to deliver verification email — user can resend");
  }
}

async function createSessionPair(
  userId: string,
  userType: "student" | "teacher" | "parent" | "principal" | "district_admin",
): Promise<{ token: string; refreshToken: string }> {
  const token        = generateToken();
  const refreshToken = generateToken();
  const expiresAt        = new Date(Date.now() + SESSION_TTL_MS);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await Promise.all([
    db.insert(userSessionsTable).values({ userId, userType, tokenHash: sha256(token), expiresAt }),
    db.insert(refreshTokensTable).values({ userId, userType, tokenHash: sha256(refreshToken), expiresAt: refreshExpiresAt }),
  ]);
  return { token, refreshToken };
}

function extractBearer(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const raw = auth.slice(7).trim();
    if (raw) return raw;
  }
  // Fallback for requests that can't set an Authorization header themselves —
  // notably the frontend's SSR server, which forwards the browser's Cookie
  // header to the API when prefetching auth-gated data for `/billing`.
  const cookieToken = req.cookies?.authToken;
  return typeof cookieToken === "string" && cookieToken.length > 0 ? cookieToken : null;
}

const AUTH_COOKIE_NAME = "authToken";

/**
 * Mirrors the session token into an httpOnly cookie alongside the token
 * returned in the JSON body. The client keeps using the body token
 * (sessionStorage + Authorization header) for all its own API calls; the
 * cookie exists solely so the SSR server can identify the caller when
 * prefetching `/billing` — see `extractBearer`'s cookie fallback above.
 */
function setSessionCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
}

// ── Public config ──────────────────────────────────────────────────────────
router.get("/auth/config", (_req, res): void => {
  sendSuccess(res, { googleEnabled: googleConfigured() });
});

// ── Email / Password: Register ─────────────────────────────────────────────
// Creates a new student account with email + password.
// Source of truth is the users table; students table holds the profile.
router.post("/auth/register", async (req: Request, res: Response): Promise<void> => {
  const { name, email, password, gradeBand, stateAssessment, homeLanguage, teacherCode, track } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    gradeBand?: string;
    stateAssessment?: string;
    homeLanguage?: string;
    teacherCode?: string;
    track?: StudentTrack;
  };

  if (!name?.trim() || !email?.trim() || !password || !gradeBand || !stateAssessment) {
    sendError(res, 400, "name, email, password, gradeBand, and stateAssessment are required");
    return;
  }

  const resolvedTrack: StudentTrack = track === "general" ? "general" : "academic";

  if (password.length < 8) {
    sendError(res, 400, "Password must be at least 8 characters");
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = name.trim();

  // Check email not already taken
  const [existingUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail))
    .limit(1);
  if (existingUser) {
    sendError(res, 409, "An account with this email already exists");
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // 1. Create unified user record (source of truth)
  const [user] = await db
    .insert(usersTable)
    .values({ email: normalizedEmail, name: normalizedName, passwordHash, role: "student", emailVerified: false })
    .returning();

  // 2. Optionally link to a real educator via teacherCode (no stubs created)
  let guardianId: string | null = null;

  if (teacherCode?.trim()) {
    const [educatorUser] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.email, teacherCode.trim().toLowerCase()), eq(usersTable.role, "teacher")))
      .limit(1);

    if (educatorUser) {
      const [guardian] = await db
        .select({ id: profilesTable.id })
        .from(profilesTable)
        .where(eq(profilesTable.userId, educatorUser.id))
        .limit(1);
      if (guardian) guardianId = guardian.id;
    } else {
      req.log.info({ teacherCode: teacherCode.trim() }, "Teacher code not found — student registered without teacher link");
    }
  }

  // 3. Create student profile
  const [student] = await db
    .insert(studentsTable)
    .values({
      userId: user.id,
      guardianId,
      name: normalizedName,
      gradeBand,
      stateAssessment,
      homeLanguage: homeLanguage?.trim() || null,
      track: resolvedTrack,
      email: normalizedEmail,
      accountType: guardianId ? "teacher_managed" : "solo",
      emailVerified: false,
    })
    .returning();

  await ensureStudentLevels(student.id, stateAssessment as Assessment, resolvedTrack);

  // Send verification email — account is inactive until verified
  await sendVerificationEmailTo(req, normalizedEmail, normalizedName, "student");

  sendSuccess(res, { ok: true, requiresVerification: true, studentId: student.id }, 201);
});

// ── Email / Password: Login ────────────────────────────────────────────────
router.post("/auth/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password, role } = req.body as {
    email?: string;
    password?: string;
    role?: string;
  };

  if (!email?.trim() || !password || !role) {
    sendError(res, 400, "email, password, and role are required");
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Check unified users table first (new accounts)
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail))
    .limit(1);

  if (user) {
    if (!user.passwordHash) {
      sendError(res, 401, "Invalid email or password");
      return;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      sendError(res, 401, "Invalid email or password");
      return;
    }
    if (!user.emailVerified) {
      sendError(res, 403, "Please verify your email before logging in", { requiresVerification: true });
      return;
    }

    if (role === "teacher" && (user.role === "teacher" || user.role === "principal" || user.role === "district_admin")) {
      const [guardian] = await db
        .select()
        .from(profilesTable)
        .where(eq(profilesTable.userId, user.id))
        .limit(1);
      if (!guardian) {
        req.log.warn({ userId: user.id, email: user.email }, "Login succeeded but no matching guardians row found — possible incomplete registration");
        sendError(res, 401, "Account setup incomplete. Please contact support if this problem persists.");
        return;
      }
      const { token, refreshToken } = await createSessionPair(guardian.id, "teacher");
      setSessionCookie(res, token);
      sendSuccess(res, { token, refreshToken, teacherId: guardian.id, userType: "teacher" });
      return;
    }

    if (role === "parent" && user.role === "parent") {
      if (!user.emailVerified) {
        sendError(res, 403, "Please verify your email before logging in", { requiresVerification: true });
        return;
      }
      const [guardian] = await db
        .select()
        .from(profilesTable)
        .where(eq(profilesTable.userId, user.id))
        .limit(1);
      if (!guardian) {
        req.log.warn({ userId: user.id, email: user.email }, "Login succeeded but no matching guardians row found — possible incomplete registration");
        sendError(res, 401, "Account setup incomplete. Please contact support if this problem persists.");
        return;
      }
      const { token, refreshToken } = await createSessionPair(guardian.id, "parent");
      setSessionCookie(res, token);
      sendSuccess(res, { token, refreshToken, userId: guardian.id, userType: "parent" });
      return;
    }

    if (role === "student" && user.role === "student") {
      const [student] = await db
        .select()
        .from(studentsTable)
        .where(eq(studentsTable.userId, user.id))
        .limit(1);
      if (!student) {
        sendError(res, 401, "Invalid email or password");
        return;
      }
      await db.update(studentsTable).set({ lastLoginAt: new Date() }).where(eq(studentsTable.id, student.id));
      const { token, refreshToken } = await createSessionPair(student.id, "student");
      setSessionCookie(res, token);
      sendSuccess(res, { token, refreshToken, studentId: student.id, teacherId: student.guardianId, userType: "student" });
      return;
    }

    // "administrator" covers teacher, parent, principal, district_admin — actual role
    // is determined from users.role so the client doesn't need to know the exact sub-role upfront.
    if (role === "administrator") {
      if (user.role === "teacher" || user.role === "principal") {
        const [guardian] = await db
          .select()
          .from(profilesTable)
          .where(eq(profilesTable.userId, user.id))
          .limit(1);
        if (!guardian) {
          req.log.warn({ userId: user.id }, "Administrator login: no guardian row found");
          sendError(res, 401, "Account setup incomplete. Please contact support.");
          return;
        }
        const { token, refreshToken } = await createSessionPair(guardian.id, user.role as "teacher" | "principal");
        setSessionCookie(res, token);
        sendSuccess(res, { token, refreshToken, teacherId: guardian.id, userType: user.role });
        return;
      }

      if (user.role === "district_admin") {
        const [da] = await db
          .select()
          .from(districtAdminsTable)
          .where(eq(districtAdminsTable.userId, user.id))
          .limit(1);
        if (!da) {
          req.log.warn({ userId: user.id }, "Administrator login: no district_admins row found");
          sendError(res, 401, "Account setup incomplete. Please contact support.");
          return;
        }
        const { token, refreshToken } = await createSessionPair(da.id, "district_admin");
        setSessionCookie(res, token);
        sendSuccess(res, { token, refreshToken, teacherId: da.id, districtId: da.districtId, userType: "district_admin" });
        return;
      }

      if (user.role === "parent") {
        const [guardian] = await db
          .select()
          .from(profilesTable)
          .where(eq(profilesTable.userId, user.id))
          .limit(1);
        if (!guardian) {
          req.log.warn({ userId: user.id }, "Administrator login: no guardian row found for parent");
          sendError(res, 401, "Account setup incomplete. Please contact support.");
          return;
        }
        const { token, refreshToken } = await createSessionPair(guardian.id, "parent");
        setSessionCookie(res, token);
        sendSuccess(res, { token, refreshToken, teacherId: guardian.id, userType: "parent", role: user.role });
        return;
      }

      // super_admin is backed by a guardians row (registered via educator signup).
      if (user.role === "super_admin") {
        const [guardian] = await db
          .select()
          .from(profilesTable)
          .where(eq(profilesTable.userId, user.id))
          .limit(1);
        if (!guardian) {
          req.log.warn({ userId: user.id }, "Super admin login: no guardian row found");
          sendError(res, 401, "Account setup incomplete. Please contact support.");
          return;
        }
        const { token, refreshToken } = await createSessionPair(guardian.id, "teacher");
        setSessionCookie(res, token);
        sendSuccess(res, { token, refreshToken, teacherId: guardian.id, userType: "super_admin", role: "super_admin" });
        return;
      }
    }

    sendError(res, 401, "Invalid email or password");
    return;
  }

  // No account found
  sendError(res, 401, "Invalid email or password");
});

// ── Session: Me ────────────────────────────────────────────────────────────
router.get("/auth/me", async (req: Request, res: Response): Promise<void> => {
  const raw = extractBearer(req);
  if (!raw) {
    sendError(res, 401, "No token");
    return;
  }

  const tokenHash = sha256(raw);
  const now = new Date();

  const [session] = await db
    .select()
    .from(userSessionsTable)
    .where(and(eq(userSessionsTable.tokenHash, tokenHash), gt(userSessionsTable.expiresAt, now)))
    .limit(1);

  if (!session) {
    sendError(res, 401, "Invalid or expired session");
    return;
  }

  if (session.userType === "student") {
    const [student] = await db
      .select()
      .from(studentsTable)
      .where(eq(studentsTable.id, session.userId))
      .limit(1);
    if (!student) {
      sendError(res, 401, "User not found");
      return;
    }
    sendSuccess(res, { userType: "student", studentId: student.id, teacherId: student.guardianId });
    return;
  }

  if (session.userType === "parent") {
    const [guardian] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.id, session.userId))
      .limit(1);
    if (!guardian) {
      sendError(res, 401, "User not found");
      return;
    }
    sendSuccess(res, { userType: "parent", userId: guardian.id, teacherId: guardian.id });
    return;
  }

  if (session.userType === "principal") {
    const [guardian] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.id, session.userId))
      .limit(1);
    if (!guardian) {
      sendError(res, 401, "User not found");
      return;
    }
    sendSuccess(res, { userType: "principal", teacherId: guardian.id });
    return;
  }

  if (session.userType === "district_admin") {
    const [da] = await db
      .select()
      .from(districtAdminsTable)
      .where(eq(districtAdminsTable.id, session.userId))
      .limit(1);
    if (!da) {
      sendError(res, 401, "User not found");
      return;
    }
    sendSuccess(res, { userType: "district_admin", teacherId: da.id, districtId: da.districtId });
    return;
  }

  // teacher / parent
  const [teacher] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.id, session.userId))
    .limit(1);
  if (!teacher) {
    sendError(res, 401, "User not found");
    return;
  }
  sendSuccess(res, { userType: session.userType ?? "teacher", teacherId: teacher.id });
});

// ── Session: Logout ────────────────────────────────────────────────────────
router.post("/auth/logout", async (req: Request, res: Response): Promise<void> => {
  const raw = extractBearer(req);
  if (raw) {
    const tokenHash = sha256(raw);
    await db.delete(userSessionsTable).where(eq(userSessionsTable.tokenHash, tokenHash));
  }
  // Also revoke the refresh token if the client sends it in the body
  const bodyRefreshToken = (req.body as { refreshToken?: string }).refreshToken;
  if (bodyRefreshToken) {
    await db
      .delete(refreshTokensTable)
      .where(eq(refreshTokensTable.tokenHash, sha256(bodyRefreshToken)));
  }
  clearSessionCookie(res);
  sendSuccess(res, { ok: true });
});

// ── Refresh session ────────────────────────────────────────────────────────
// Exchange a valid, unused refresh token for a new session + refresh pair.
// The old refresh token is marked as used (single-use rotation), so even if
// it leaks the attacker gets at most one new session before it's invalidated.
router.post("/auth/refresh", async (req: Request, res: Response): Promise<void> => {
  const { refreshToken: raw } = req.body as { refreshToken?: string };

  if (!raw) {
    sendError(res, 400, "refreshToken is required");
    return;
  }

  const tokenHash = sha256(raw);
  const now = new Date();

  const [record] = await db
    .select()
    .from(refreshTokensTable)
    .where(
      and(
        eq(refreshTokensTable.tokenHash, tokenHash),
        gt(refreshTokensTable.expiresAt, now),
      ),
    )
    .limit(1);

  if (!record) {
    sendError(res, 401, "Invalid or expired refresh token");
    return;
  }

  // Delete the consumed refresh token immediately — no accumulation in the DB.
  await db
    .delete(refreshTokensTable)
    .where(eq(refreshTokensTable.id, record.id));

  // Issue a new session + refresh pair
  const { token, refreshToken: newRefreshToken } = await createSessionPair(
    record.userId,
    record.userType as "student" | "teacher" | "parent" | "principal" | "district_admin",
  );

  setSessionCookie(res, token);
  sendSuccess(res, {
    token,
    refreshToken: newRefreshToken,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
});

// ── Educator Register ──────────────────────────────────────────────────────
// Creates a unified user record + educator profile + teacher profile row.
router.post("/auth/register/educator", async (req: Request, res: Response): Promise<void> => {
  const { name, email, password, school } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    school?: string;
  };

  if (!name?.trim() || !email?.trim() || !password) {
    sendError(res, 400, "name, email, and password are required");
    return;
  }
  if (password.length < 8) {
    sendError(res, 400, "Password must be at least 8 characters");
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = name.trim();

  const [existingUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail))
    .limit(1);
  if (existingUser) {
    sendError(res, 409, "An account with this email already exists");
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // 1. Create unified user record (source of truth)
  const [user] = await db
    .insert(usersTable)
    .values({
      email: normalizedEmail,
      name: normalizedName,
      passwordHash,
      role: "teacher",
      emailVerified: false,
      school: school?.trim() || null,
    })
    .returning();

  // 2. Create guardian profile row (linked to users via userId)
  const [guardian] = await db
    .insert(profilesTable)
    .values({
      userId: user.id,
      school: school?.trim() || null,
    })
    .returning();

  await sendVerificationEmailTo(req, normalizedEmail, normalizedName, "teacher");

  sendSuccess(res, { ok: true, requiresVerification: true, teacherId: guardian.id }, 201);
});

// ── Verify Email ───────────────────────────────────────────────────────────
router.get("/auth/verify-email", async (req: Request, res: Response): Promise<void> => {
  const token = typeof req.query.token === "string" ? req.query.token : null;
  if (!token) {
    sendError(res, 400, "token is required");
    return;
  }

  const tokenHash = sha256(token);
  const now = new Date();

  const [record] = await db
    .select()
    .from(emailVerificationTokensTable)
    .where(
      and(
        eq(emailVerificationTokensTable.tokenHash, tokenHash),
        gt(emailVerificationTokensTable.expiresAt, now),
        isNull(emailVerificationTokensTable.usedAt),
      ),
    )
    .limit(1);

  if (!record) {
    sendError(res, 400, "This verification link is invalid or has expired");
    return;
  }

  // Mark the token as used
  await db
    .update(emailVerificationTokensTable)
    .set({ usedAt: now })
    .where(eq(emailVerificationTokensTable.id, record.id));

  // Mark emailVerified on users table (source of truth)
  await db
    .update(usersTable)
    .set({ emailVerified: true })
    .where(eq(usersTable.email, record.email));

  if (record.userType === "student") {
    await db
      .update(studentsTable)
      .set({ emailVerified: true })
      .where(eq(studentsTable.email, record.email));

    const [student] = await db
      .select()
      .from(studentsTable)
      .where(eq(studentsTable.email, record.email))
      .limit(1);

    if (student) {
      const { token: sessionToken, refreshToken } = await createSessionPair(student.id, "student");
      setSessionCookie(res, sessionToken);
      sendSuccess(res, { ok: true, userType: "student", token: sessionToken, refreshToken, studentId: student.id, teacherId: student.guardianId });
      return;
    }
  } else if (record.userType === "parent") {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, record.email))
      .limit(1);

    if (user) {
      const [guardian] = await db
        .select()
        .from(profilesTable)
        .where(eq(profilesTable.userId, user.id))
        .limit(1);

      if (guardian) {
        const { token: sessionToken, refreshToken } = await createSessionPair(guardian.id, "parent");
        setSessionCookie(res, sessionToken);
        sendSuccess(res, { ok: true, userType: "parent", token: sessionToken, refreshToken, userId: guardian.id, teacherId: guardian.id });
        return;
      }
    }
  } else {
    // usersTable already updated above — find teacher via userId
    const [verifiedUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, record.email))
      .limit(1);

    if (verifiedUser) {
      const [teacher] = await db
        .select()
        .from(profilesTable)
        .where(eq(profilesTable.userId, verifiedUser.id))
        .limit(1);

      if (teacher) {
        const { token: sessionToken, refreshToken } = await createSessionPair(teacher.id, "teacher");
        setSessionCookie(res, sessionToken);
        sendSuccess(res, { ok: true, userType: "teacher", token: sessionToken, refreshToken, teacherId: teacher.id });
        return;
      }
    }
  }

  sendSuccess(res, { ok: true });
});

// ── Resend Verification Email ──────────────────────────────────────────────
router.post("/auth/resend-verification", async (req: Request, res: Response): Promise<void> => {
  const { email, role } = req.body as { email?: string; role?: string };

  // Always 200 to prevent enumeration
  if (!email?.trim()) {
    sendSuccess(res, { ok: true });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const userType: "student" | "teacher" | "parent" =
    role === "teacher" ? "teacher" : role === "parent" ? "parent" : "student";

  const expectedRole = userType === "teacher" ? "teacher" : userType === "parent" ? "parent" : "student";
  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.email, normalizedEmail), eq(usersTable.role, expectedRole)))
    .limit(1);
  if (user && !user.emailVerified) {
    await sendVerificationEmailTo(req, normalizedEmail, user.name, userType);
  }

  sendSuccess(res, { ok: true });
});

// ── Forgot Password ────────────────────────────────────────────────────────
router.post("/auth/forgot-password", async (req: Request, res: Response): Promise<void> => {
  const { email, role } = req.body as { email?: string; role?: string };

  // Always respond 200 to prevent email enumeration
  if (!email?.trim()) {
    sendSuccess(res, { ok: true });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const userType = role === "teacher" ? "teacher" : "student";

  const [userRecord] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail))
    .limit(1);
  const userFound = !!userRecord;

  if (userFound) {
    const token = generateToken();
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);

    await db.insert(passwordResetTokensTable).values({
      email: normalizedEmail,
      userType,
      tokenHash,
      expiresAt,
    });

    const resetUrl = `${getAppUrl(req)}/reset-password?token=${token}`;

    req.log.info({ email: normalizedEmail }, "Password reset link generated");

    await sendHtmlEmail({
      to: normalizedEmail,
      subject: "Reset your ACCESS Ready password",
      html: passwordResetEmail(resetUrl),
    });
  }

  sendSuccess(res, { ok: true });
});

// ── Reset Password ─────────────────────────────────────────────────────────
router.post("/auth/reset-password", async (req: Request, res: Response): Promise<void> => {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };

  if (!token || !newPassword) {
    sendError(res, 400, "token and newPassword are required");
    return;
  }

  if (newPassword.length < 8) {
    sendError(res, 400, "Password must be at least 8 characters");
    return;
  }

  const tokenHash = sha256(token);
  const now = new Date();

  const [record] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(
      and(
        eq(passwordResetTokensTable.tokenHash, tokenHash),
        gt(passwordResetTokensTable.expiresAt, now),
      ),
    )
    .limit(1);

  if (!record || record.usedAt) {
    sendError(res, 400, "This reset link is invalid or has expired");
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  // Update users table (source of truth)
  await db
    .update(usersTable)
    .set({ passwordHash })
    .where(eq(usersTable.email, record.email));

  await db
    .update(passwordResetTokensTable)
    .set({ usedAt: now })
    .where(eq(passwordResetTokensTable.id, record.id));

  sendSuccess(res, { ok: true });
});

// ── Google: Complete Profile (new users sent through onboarding) ───────────
// Called after a new Google user finishes onboarding to save their real
// gradeBand, stateAssessment, and homeLanguage, then re-initialize levels.
router.post("/auth/google/complete-profile", async (req: Request, res: Response): Promise<void> => {
  const raw = extractBearer(req);
  if (!raw) {
    sendError(res, 401, "No token");
    return;
  }

  const tokenHash = sha256(raw);
  const now = new Date();

  const [session] = await db
    .select()
    .from(userSessionsTable)
    .where(and(eq(userSessionsTable.tokenHash, tokenHash), gt(userSessionsTable.expiresAt, now)))
    .limit(1);

  if (!session || session.userType !== "student") {
    sendError(res, 401, "Invalid or expired session");
    return;
  }

  const { gradeBand, stateAssessment, homeLanguage, track } = req.body as {
    gradeBand?: string;
    stateAssessment?: string;
    homeLanguage?: string;
    track?: StudentTrack;
  };

  if (!gradeBand || !stateAssessment) {
    sendError(res, 400, "gradeBand and stateAssessment are required");
    return;
  }

  const resolvedTrack: StudentTrack = track === "general" ? "general" : "academic";

  const [student] = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.id, session.userId))
    .limit(1);

  if (!student) {
    sendError(res, 404, "Student not found");
    return;
  }

  await db
    .update(studentsTable)
    .set({
      gradeBand,
      stateAssessment,
      homeLanguage: homeLanguage?.trim() || null,
      track: resolvedTrack,
    })
    .where(eq(studentsTable.id, student.id));

  // Re-initialize levels for the chosen assessment and track
  const DOMAINS: Domain[] = ["listening", "speaking", "reading", "writing"];
  const assessmentConfig = getAssessmentConfig(stateAssessment as Assessment);

  for (const domain of DOMAINS) {
    const exitThreshold = getExitThresholdForTrack(stateAssessment as Assessment, domain, resolvedTrack);
    await db
      .update(studentLevelsTable)
      .set({
        currentLevel: assessmentConfig.scale.min.toString(),
        exitThreshold: exitThreshold.toString(),
        atExit: false,
        consecutivePassCount: "0",
        consecutiveFailCount: "0",
      })
      .where(and(eq(studentLevelsTable.studentId, student.id), eq(studentLevelsTable.domain, domain)));
  }

  sendSuccess(res, { ok: true, studentId: student.id, teacherId: student.guardianId });
});

// ── Google OAuth ───────────────────────────────────────────────────────────
router.get("/auth/google/start", (req, res): void => {
  if (!googleConfigured()) {
    res.redirect("/login?authError=google_not_configured");
    return;
  }

  const oauthRole = typeof req.query.role === "string" ? req.query.role : "student";
  const state = crypto.randomBytes(16).toString("hex");
  const secure = getRequestOrigin(req).startsWith("https://");

  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: 10 * 60 * 1000,
    path: "/",
  });

  res.cookie("g_oauth_role", oauthRole, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: 10 * 60 * 1000,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: getRedirectUri(req),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });

  res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
});

router.get("/auth/google/callback", async (req, res): Promise<void> => {
  if (!googleConfigured()) {
    res.redirect("/login?authError=google_not_configured");
    return;
  }

  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;
  const cookies = parseCookies(req.headers.cookie);
  const expectedState = cookies[STATE_COOKIE];
  const oauthRole = cookies["g_oauth_role"] ?? "student";

  res.clearCookie(STATE_COOKIE, { path: "/" });
  res.clearCookie("g_oauth_role", { path: "/" });

  if (!code || !state || !expectedState || state !== expectedState) {
    req.log.warn("Google OAuth callback failed state/code validation");
    res.redirect("/login?authError=google");
    return;
  }

  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: getRedirectUri(req),
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenRes.ok) {
      req.log.error({ status: tokenRes.status }, "Google token exchange failed");
      res.redirect("/login?authError=google");
      return;
    }

    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) {
      res.redirect("/login?authError=google");
      return;
    }

    const profileRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });

    if (!profileRes.ok) {
      req.log.error({ status: profileRes.status }, "Google userinfo fetch failed");
      res.redirect("/login?authError=google");
      return;
    }

    const profile = (await profileRes.json()) as {
      sub?: string;
      email?: string;
      name?: string;
    };

    if (!profile.sub) {
      res.redirect("/login?authError=google");
      return;
    }

    if (oauthRole === "educator" || oauthRole === "district") {
      const { teacherId, isNewUser } = await findOrCreateGoogleEducator(profile, oauthRole);
      const { token: sessionToken, refreshToken: sessionRefreshToken } = await createSessionPair(teacherId, "teacher");
      // SSR (e.g. `/billing`) authenticates via the `authToken` cookie, not the
      // hash params below — without this, Google-authenticated users would
      // hit SSR routes as anonymous even though they hold a valid session.
      setSessionCookie(res, sessionToken);
      const params = new URLSearchParams({ teacherId, token: sessionToken, refreshToken: sessionRefreshToken, role: oauthRole });
      if (isNewUser) params.set("isNewUser", "true");
      res.redirect(`/auth/callback#${params.toString()}`);
      return;
    }

    if (oauthRole === "parent") {
      const { guardianId, isNewUser } = await findOrCreateGoogleParent(profile);
      const { token: sessionToken, refreshToken: sessionRefreshToken } = await createSessionPair(guardianId, "parent");
      setSessionCookie(res, sessionToken);
      const params = new URLSearchParams({ userId: guardianId, token: sessionToken, refreshToken: sessionRefreshToken, role: "parent" });
      if (isNewUser) params.set("isNewUser", "true");
      res.redirect(`/auth/callback#${params.toString()}`);
      return;
    }

    // Default: student
    const { studentId, teacherId, isNewUser } = await findOrCreateGoogleStudent(profile);

    await db.update(studentsTable).set({ lastLoginAt: new Date() }).where(eq(studentsTable.id, studentId));
    const { token: sessionToken, refreshToken: sessionRefreshToken } = await createSessionPair(studentId, "student");
    setSessionCookie(res, sessionToken);

    const params = new URLSearchParams({ studentId, token: sessionToken, refreshToken: sessionRefreshToken, role: "student" });
    if (teacherId) params.set("teacherId", teacherId);
    if (isNewUser) params.set("isNewUser", "true");
    res.redirect(`/auth/callback#${params.toString()}`);
  } catch (err) {
    req.log.error({ err }, "Google OAuth callback error");
    res.redirect("/login?authError=google");
  }
});

// ── Google: Complete Profile — Educator/District ───────────────────────────
router.post("/auth/google/complete-profile/educator", async (req: Request, res: Response): Promise<void> => {
  const raw = extractBearer(req);
  if (!raw) { sendError(res, 401, "No token"); return; }

  const tokenHash = sha256(raw);
  const now = new Date();
  const [session] = await db
    .select()
    .from(userSessionsTable)
    .where(and(eq(userSessionsTable.tokenHash, tokenHash), gt(userSessionsTable.expiresAt, now)))
    .limit(1);

  if (!session || session.userType !== "teacher") {
    sendError(res, 401, "Invalid or expired session");
    return;
  }

  const { school, title } = req.body as { school?: string; title?: string };

  const [teacher] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.id, session.userId))
    .limit(1);
  if (!teacher) { sendError(res, 404, "Account not found"); return; }

  await db.update(profilesTable).set({ school: school?.trim() || null }).where(eq(profilesTable.id, teacher.id));
  await db.update(usersTable).set({ school: school?.trim() || null }).where(eq(usersTable.id, teacher.userId));
  if (title?.trim()) {
    // store title in users table via the name field isn't right — skip title for now
  }

  sendSuccess(res, { ok: true, teacherId: teacher.id });
});

// ── Google: Complete Profile — Parent ─────────────────────────────────────
router.post("/auth/google/complete-profile/parent", async (req: Request, res: Response): Promise<void> => {
  const raw = extractBearer(req);
  if (!raw) { sendError(res, 401, "No token"); return; }

  const tokenHash = sha256(raw);
  const now = new Date();
  const [session] = await db
    .select()
    .from(userSessionsTable)
    .where(and(eq(userSessionsTable.tokenHash, tokenHash), gt(userSessionsTable.expiresAt, now)))
    .limit(1);

  if (!session || session.userType !== "parent") {
    sendError(res, 401, "Invalid or expired session");
    return;
  }

  sendSuccess(res, { ok: true, userId: session.userId });
});

// ── District Admin Register ────────────────────────────────────────────────
router.post("/auth/register/district", async (req: Request, res: Response): Promise<void> => {
  const { name, email, password, district, title } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    district?: string;
    title?: string;
  };

  if (!name?.trim() || !email?.trim() || !password) {
    sendError(res, 400, "name, email, and password are required");
    return;
  }
  if (password.length < 8) {
    sendError(res, 400, "Password must be at least 8 characters");
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = name.trim();

  const [existingUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail))
    .limit(1);
  if (existingUser) {
    sendError(res, 409, "An account with this email already exists");
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const [user] = await db
    .insert(usersTable)
    .values({
      email: normalizedEmail,
      name: normalizedName,
      passwordHash,
      role: "district_admin",
      emailVerified: false,
      school: district?.trim() || null,
    })
    .returning();

  const [guardian] = await db
    .insert(profilesTable)
    .values({
      userId: user.id,
      school: district?.trim() || null,
    })
    .returning();

  await sendVerificationEmailTo(req, normalizedEmail, normalizedName, "teacher");

  sendSuccess(res, { ok: true, requiresVerification: true, teacherId: guardian.id }, 201);
});

// ── Parent Register ────────────────────────────────────────────────────────
router.post("/auth/register/parent", async (req: Request, res: Response): Promise<void> => {
  const { name, email, password } = req.body as {
    name?: string;
    email?: string;
    password?: string;
  };

  if (!name?.trim() || !email?.trim() || !password) {
    sendError(res, 400, "name, email, and password are required");
    return;
  }
  if (password.length < 8) {
    sendError(res, 400, "Password must be at least 8 characters");
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = name.trim();

  const [existingUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail))
    .limit(1);
  if (existingUser) {
    sendError(res, 409, "An account with this email already exists");
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const [user] = await db
    .insert(usersTable)
    .values({
      email: normalizedEmail,
      name: normalizedName,
      passwordHash,
      role: "parent",
      emailVerified: false,
    })
    .returning();

  await db.insert(profilesTable).values({ userId: user.id });

  await sendVerificationEmailTo(req, normalizedEmail, normalizedName, "parent");

  sendSuccess(res, { ok: true, requiresVerification: true }, 201);
});

async function findOrCreateGoogleStudent(profile: {
  sub?: string;
  email?: string;
  name?: string;
}): Promise<{ studentId: string; teacherId: string | null; isNewUser: boolean }> {
  const googleId = profile.sub!;
  const email = profile.email ?? null;
  const displayName = profile.name?.trim() || email?.split("@")[0] || "Student";

  // 1. Check unified users table by googleId
  const [userByGoogle] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.googleId, googleId))
    .limit(1);
  if (userByGoogle) {
    const [student] = await db
      .select()
      .from(studentsTable)
      .where(eq(studentsTable.userId, userByGoogle.id))
      .limit(1);
    if (student) return { studentId: student.id, teacherId: student.guardianId ?? null, isNewUser: false };
  }

  // 2. Check students table by googleId
  const [byGoogle] = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.googleId, googleId))
    .limit(1);
  if (byGoogle) {
    return { studentId: byGoogle.id, teacherId: byGoogle.guardianId ?? null, isNewUser: false };
  }

  // 3. Check by email (link Google to existing email/password account)
  if (email) {
    const [userByEmail] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    if (userByEmail) {
      await db.update(usersTable).set({ googleId, emailVerified: true }).where(eq(usersTable.id, userByEmail.id));
      const [student] = await db
        .select()
        .from(studentsTable)
        .where(eq(studentsTable.userId, userByEmail.id))
        .limit(1);
      if (student) {
        await db.update(studentsTable).set({ googleId, emailVerified: true }).where(eq(studentsTable.id, student.id));
        return { studentId: student.id, teacherId: student.guardianId ?? null, isNewUser: false };
      }
    }

    const [byEmail] = await db
      .select()
      .from(studentsTable)
      .where(eq(studentsTable.email, email))
      .limit(1);
    if (byEmail) {
      if (byEmail.userId) {
        // users row already exists (invite was accepted) — just link googleId
        await db.update(usersTable).set({ googleId, emailVerified: true }).where(eq(usersTable.id, byEmail.userId));
        await db.update(studentsTable).set({ googleId, emailVerified: true }).where(eq(studentsTable.id, byEmail.id));
      } else {
        // Pre-created student (teacher added, invite not yet accepted) — create the users row now
        const [user] = await db
          .insert(usersTable)
          .values({
            email,
            name: byEmail.name,
            googleId,
            role: "student",
            emailVerified: true,
          })
          .returning();
        await db
          .update(studentsTable)
          .set({ userId: user.id, googleId, emailVerified: true, accountType: "teacher_managed" })
          .where(eq(studentsTable.id, byEmail.id));
      }
      return { studentId: byEmail.id, teacherId: byEmail.guardianId ?? null, isNewUser: false };
    }
  }

  // 4. Brand new Google user — create user + student with placeholder data.
  //    The frontend will redirect to onboarding so the user fills in their real grade/assessment/language.
  const [user] = await db
    .insert(usersTable)
    .values({
      email: email ?? `google-${googleId}@access.local`,
      name: displayName,
      googleId,
      role: "student",
      emailVerified: true,
    })
    .returning();

  const [student] = await db
    .insert(studentsTable)
    .values({
      userId: user.id,
      guardianId: null,                    // no teacher until student links one in onboarding
      name: displayName,
      gradeBand: DEFAULT_GRADE_BAND,       // placeholder — overwritten in onboarding
      stateAssessment: DEFAULT_ASSESSMENT, // placeholder — overwritten in onboarding
      email,
      googleId,
      emailVerified: true,
      accountType: "solo",
    })
    .returning();

  await ensureStudentLevels(student.id, DEFAULT_ASSESSMENT);

  return { studentId: student.id, teacherId: null, isNewUser: true };
}

async function findOrCreateGoogleEducator(
  profile: { sub?: string; email?: string; name?: string },
  role: string,
): Promise<{ teacherId: string; isNewUser: boolean }> {
  const googleId = profile.sub!;
  const email = profile.email ?? null;
  const displayName = profile.name?.trim() || email?.split("@")[0] || "Educator";
  const userRole = role === "district" ? "district_admin" : "teacher";

  // 1. Check by googleId in users table
  const [userByGoogle] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.googleId, googleId))
    .limit(1);
  if (userByGoogle) {
    const [teacher] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.userId, userByGoogle.id))
      .limit(1);
    if (teacher) return { teacherId: teacher.id, isNewUser: false };
  }

  // 2. Check by email in users table
  if (email) {
    const [userByEmail] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    if (userByEmail) {
      await db.update(usersTable).set({ googleId, emailVerified: true }).where(eq(usersTable.id, userByEmail.id));
      const [teacher] = await db
        .select()
        .from(profilesTable)
        .where(eq(profilesTable.userId, userByEmail.id))
        .limit(1);
      if (teacher) return { teacherId: teacher.id, isNewUser: false };
    }
  }

  // 3. Brand new — create user + guardian rows
  const [user] = await db
    .insert(usersTable)
    .values({
      email: email ?? `google-${googleId}@access.local`,
      name: displayName,
      googleId,
      role: userRole as "teacher" | "district_admin",
      emailVerified: true,
      school: null,
    })
    .returning();

  const [teacher] = await db
    .insert(profilesTable)
    .values({
      userId: user.id,
      school: null,
    })
    .returning();

  return { teacherId: teacher.id, isNewUser: true };
}

async function findOrCreateGoogleParent(
  profile: { sub?: string; email?: string; name?: string },
): Promise<{ guardianId: string; isNewUser: boolean }> {
  const googleId = profile.sub!;
  const email = profile.email ?? null;
  const displayName = profile.name?.trim() || email?.split("@")[0] || "Parent";

  // 1. Check by googleId
  const [userByGoogle] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.googleId, googleId))
    .limit(1);
  if (userByGoogle && userByGoogle.role === "parent") {
    const [guardian] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.userId, userByGoogle.id))
      .limit(1);
    if (guardian) return { guardianId: guardian.id, isNewUser: false };
  }

  // 2. Check by email
  if (email) {
    const [userByEmail] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    if (userByEmail && userByEmail.role === "parent") {
      await db.update(usersTable).set({ googleId, emailVerified: true }).where(eq(usersTable.id, userByEmail.id));
      const [guardian] = await db
        .select()
        .from(profilesTable)
        .where(eq(profilesTable.userId, userByEmail.id))
        .limit(1);
      if (guardian) return { guardianId: guardian.id, isNewUser: false };
    }
  }

  // 3. Brand new parent
  const [user] = await db
    .insert(usersTable)
    .values({
      email: email ?? `google-${googleId}@access.local`,
      name: displayName,
      googleId,
      role: "parent",
      emailVerified: true,
    })
    .returning();

  const [guardian] = await db.insert(profilesTable).values({ userId: user.id }).returning();

  return { guardianId: guardian.id, isNewUser: true };
}

export default router;
