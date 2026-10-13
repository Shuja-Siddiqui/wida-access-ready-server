import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, and, gt, isNull } from "drizzle-orm";
import {
  db,
  invitationsTable,
  studentsTable,
  profilesTable,
  usersTable,
  userSessionsTable,
  schoolsTable,
} from "../../../db";
import { ensureStudentLevels } from "../students/students";
import { sendHtmlEmail } from "../../lib/mail/mailer";
import { invitationEmail, educatorInvitationEmail } from "../../lib/mail/email-templates";
import { config } from "../../config/index";
import type { Assessment } from "../../lib/assessments";
import { sendError, sendSuccess } from "../../lib/http/api-response";

const router: IRouter = Router();

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BCRYPT_ROUNDS = 12;

function sha256(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
function appUrl(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim() ?? req.protocol;
  const host = (req.headers["x-forwarded-host"] as string)?.split(",")[0]?.trim() ?? req.get("host") ?? "";
  return `${proto}://${host}`;
}
function extractBearer(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}

// ── Resolve the caller from their bearer token ──────────────────────────────
async function resolveInviter(req: Request): Promise<{
  id: string;
  name: string;
  type: "teacher";
} | null> {
  const raw = extractBearer(req);
  if (!raw) return null;
  const tokenHash = sha256(raw);
  const now = new Date();

  const [session] = await db
    .select()
    .from(userSessionsTable)
    .where(and(eq(userSessionsTable.tokenHash, tokenHash), gt(userSessionsTable.expiresAt, now)))
    .limit(1);

  if (!session || (session.userType !== "teacher" && session.userType !== "principal")) return null;

  const [result] = await db
    .select({ id: profilesTable.id, name: usersTable.name })
    .from(profilesTable)
    .innerJoin(usersTable, eq(profilesTable.userId, usersTable.id))
    .where(eq(profilesTable.id, session.userId))
    .limit(1);

  if (!result) return null;
  return { id: result.id, name: result.name, type: "teacher" };
}

// ── POST /auth/invite — send invitation email ───────────────────────────────
router.post("/auth/invite", async (req: Request, res: Response): Promise<void> => {
  const inviter = await resolveInviter(req);
  if (!inviter) {
    sendError(res, 401, "Authentication required");
    return;
  }

  const { email, name, gradeBand, stateAssessment, homeLanguage, message } = req.body as {
    email?: string;
    name?: string;
    gradeBand?: string;
    stateAssessment?: string;
    homeLanguage?: string;
    message?: string;
  };

  if (!email?.trim() || !name?.trim() || !gradeBand || !stateAssessment) {
    sendError(res, 400, "email, name, gradeBand, and stateAssessment are required");
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Check for existing non-expired invite
  const [existing] = await db
    .select({ id: invitationsTable.id })
    .from(invitationsTable)
    .where(
      and(
        eq(invitationsTable.inviteeEmail, normalizedEmail),
        isNull(invitationsTable.acceptedAt),
        gt(invitationsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (existing) {
    sendError(res, 409, "An active invitation has already been sent to this email");
    return;
  }

  const token = generateToken();
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await db.insert(invitationsTable).values({
    inviterId: inviter.id,
    inviterType: inviter.type,
    inviterName: inviter.name,
    inviteeEmail: normalizedEmail,
    inviteeName: name.trim(),
    gradeBand,
    stateAssessment,
    homeLanguage: homeLanguage?.trim() || null,
    message: message?.trim() || null,
    tokenHash,
    expiresAt,
  });

  const inviteUrl = `${appUrl(req)}/accept-invite?token=${token}`;

  // Email delivery failure is non-fatal — the invitation record is still created
  try {
    await sendHtmlEmail({
      to: normalizedEmail,
      subject: `${inviter.name} invited you to ACCESS Ready`,
      html: invitationEmail({
        inviteeName: name.trim(),
        inviterName: inviter.name,
        inviterRole: inviter.type,
        assessment: stateAssessment,
        message: message?.trim(),
        inviteUrl,
      }),
    });
  } catch (err) {
    req.log.warn({ err, to: normalizedEmail }, "Failed to deliver invitation email");
  }

  req.log.info({ to: normalizedEmail, inviterId: inviter.id }, "Invitation sent");
  sendSuccess(res, { ok: true }, 201);
});

// ── GET /auth/invite/check?token=xxx — validate token before showing form ──
router.get("/auth/invite/check", async (req: Request, res: Response): Promise<void> => {
  const token = typeof req.query.token === "string" ? req.query.token : null;
  if (!token) {
    sendError(res, 400, "token is required");
    return;
  }

  const tokenHash = sha256(token);
  const now = new Date();

  const [invite] = await db
    .select()
    .from(invitationsTable)
    .where(
      and(
        eq(invitationsTable.tokenHash, tokenHash),
        gt(invitationsTable.expiresAt, now),
        isNull(invitationsTable.acceptedAt),
      ),
    )
    .limit(1);

  if (!invite) {
    sendError(res, 404, "This invitation is invalid or has expired");
    return;
  }

  sendSuccess(res, {
    inviteeName: invite.inviteeName,
    inviteeEmail: invite.inviteeEmail,
    inviterName: invite.inviterName,
    inviterRole: invite.inviterType,
    inviteeRole: invite.inviteeRole,
    gradeBand: invite.gradeBand,
    stateAssessment: invite.stateAssessment,
    homeLanguage: invite.homeLanguage,
  });
});

// ── POST /auth/invite/educator — principal invites a teacher ────────────────
router.post("/auth/invite/educator", async (req: Request, res: Response): Promise<void> => {
  const inviter = await resolveInviter(req);
  if (!inviter) {
    sendError(res, 401, "Authentication required");
    return;
  }

  const { firstName, lastName, email } = req.body as {
    firstName?: string;
    lastName?: string;
    email?: string;
  };

  if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
    sendError(res, 400, "firstName, lastName, and email are required");
    return;
  }

  const name = `${firstName.trim()} ${lastName.trim()}`;
  const normalizedEmail = email.trim().toLowerCase();

  // Block if active educator invite already sent to this address
  const [existing] = await db
    .select({ id: invitationsTable.id })
    .from(invitationsTable)
    .where(
      and(
        eq(invitationsTable.inviteeEmail, normalizedEmail),
        eq(invitationsTable.inviteeRole, "teacher"),
        isNull(invitationsTable.acceptedAt),
        gt(invitationsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (existing) {
    sendError(res, 409, "An active invitation has already been sent to this email");
    return;
  }

  const token = generateToken();
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await db.insert(invitationsTable).values({
    inviterId: inviter.id,
    inviterType: inviter.type,
    inviterName: inviter.name,
    inviteeEmail: normalizedEmail,
    inviteeName: name,
    inviteeRole: "teacher",
    tokenHash,
    expiresAt,
  });

  const inviteUrl = `${appUrl(req)}/accept-invite?token=${token}`;

  try {
    await sendHtmlEmail({
      to: normalizedEmail,
      subject: `${inviter.name} invited you to ACCESS Ready`,
      html: educatorInvitationEmail({ inviteeName: name, inviterName: inviter.name, inviteUrl }),
    });
  } catch (err) {
    req.log.warn({ err, to: normalizedEmail }, "Failed to deliver educator invitation email");
  }

  req.log.info({ to: normalizedEmail, inviterId: inviter.id }, "Educator invitation sent");
  sendSuccess(res, { ok: true }, 201);
});

// ── POST /auth/invite/accept — student OR teacher sets password and activates ──
router.post("/auth/invite/accept", async (req: Request, res: Response): Promise<void> => {
  const { token, password } = req.body as { token?: string; password?: string };

  if (!token || !password) {
    sendError(res, 400, "token and password are required");
    return;
  }
  if (password.length < 8) {
    sendError(res, 400, "Password must be at least 8 characters");
    return;
  }

  const tokenHash = sha256(token);
  const now = new Date();

  const [invite] = await db
    .select()
    .from(invitationsTable)
    .where(
      and(
        eq(invitationsTable.tokenHash, tokenHash),
        gt(invitationsTable.expiresAt, now),
        isNull(invitationsTable.acceptedAt),
      ),
    )
    .limit(1);

  if (!invite) {
    sendError(res, 400, "This invitation is invalid or has expired");
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // ── Principal invite path ────────────────────────────────────────────────────
  // Creates school + principal user + guardian in one transaction on acceptance.
  if (invite.inviteeRole === "principal") {
    const [existingUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, invite.inviteeEmail))
      .limit(1);

    if (existingUser) {
      sendError(res, 409, "An account already exists with this email. Please log in instead.");
      return;
    }

    // Parse school details that were stored when the invitation was created
    let schoolMeta: { schoolName: string; state?: string | null; schoolCode?: string | null; districtId: string };
    try {
      schoolMeta = JSON.parse(invite.metadata ?? "{}") as typeof schoolMeta;
    } catch {
      sendError(res, 400, "Invitation data is corrupt — ask your district admin to re-send.");
      return;
    }

    if (!schoolMeta.schoolName || !schoolMeta.districtId) {
      sendError(res, 400, "Invitation is missing school details — ask your district admin to re-send.");
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [school] = await tx
        .insert(schoolsTable)
        .values({
          name:       schoolMeta.schoolName,
          districtId: schoolMeta.districtId,
          state:      schoolMeta.state ?? null,
          schoolCode: schoolMeta.schoolCode ?? null,
        })
        .returning();

      const [user] = await tx
        .insert(usersTable)
        .values({
          email:        invite.inviteeEmail,
          name:         invite.inviteeName,
          passwordHash,
          role:         "principal",
          emailVerified: true,
        })
        .returning();

      const [guardian] = await tx
        .insert(profilesTable)
        .values({ userId: user.id, schoolId: school.id })
        .returning();

      return { school, user, guardian };
    });

    await db
      .update(invitationsTable)
      .set({ acceptedAt: now })
      .where(eq(invitationsTable.id, invite.id));

    const sessionToken = generateToken();
    const sessionHash = sha256(sessionToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(userSessionsTable).values({
      userId:   result.guardian.id,
      userType: "teacher",          // principals are backed by a guardians row, same as teachers
      tokenHash: sessionHash,
      expiresAt,
    });

    req.log.info(
      { guardianId: result.guardian.id, schoolId: result.school.id },
      "Principal invitation accepted — school + account created",
    );
    sendSuccess(res, { token: sessionToken, teacherId: result.guardian.id, userType: "teacher" }, 201);
    return;
  }

  // ── Educator (teacher) invite path ──────────────────────────────────────────
  if (invite.inviteeRole === "teacher") {
    const [existingUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, invite.inviteeEmail))
      .limit(1);

    if (existingUser) {
      sendError(res, 409, "An account already exists with this email. Please log in instead.");
      return;
    }

    // Resolve the inviter's school so the new teacher is linked automatically
    const [inviterGuardian] = await db
      .select({ schoolId: profilesTable.schoolId })
      .from(profilesTable)
      .where(eq(profilesTable.id, invite.inviterId))
      .limit(1);

    const [user] = await db
      .insert(usersTable)
      .values({
        email: invite.inviteeEmail,
        name: invite.inviteeName,
        passwordHash,
        role: "teacher",
        emailVerified: true,
      })
      .returning();

    const [guardian] = await db
      .insert(profilesTable)
      .values({
        userId: user.id,
        schoolId: inviterGuardian?.schoolId ?? null,
      })
      .returning();

    await db
      .update(invitationsTable)
      .set({ acceptedAt: now })
      .where(eq(invitationsTable.id, invite.id));

    const sessionToken = generateToken();
    const sessionHash = sha256(sessionToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(userSessionsTable).values({
      userId: guardian.id,
      userType: "teacher",
      tokenHash: sessionHash,
      expiresAt,
    });

    req.log.info({ guardianId: guardian.id }, "Educator invitation accepted — account created");
    sendSuccess(res, { token: sessionToken, teacherId: guardian.id, userType: "teacher" }, 201);
    return;
  }

  // ── Student invite path ──────────────────────────────────────────────────────
  // Check if a pre-created student record already exists (teacher added them manually)
  const [existingStudent] = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.email, invite.inviteeEmail))
    .limit(1);

  let student: typeof existingStudent;

  if (existingStudent) {
    if (existingStudent.userId) {
      // Fully activated account — they should log in instead
      sendError(res, 409, "An account with this email already exists. Please log in.");
      return;
    }

    // Pre-created student: create user record and activate the existing student row
    const [user] = await db
      .insert(usersTable)
      .values({
        email: invite.inviteeEmail,
        name: invite.inviteeName,
        passwordHash,
        role: "student",
        emailVerified: true,
      })
      .returning();

    const [updated] = await db
      .update(studentsTable)
      .set({ userId: user.id, passwordHash, emailVerified: true, accountType: "teacher_managed" })
      .where(eq(studentsTable.id, existingStudent.id))
      .returning();

    student = updated;
    await ensureStudentLevels(student.id, (invite.stateAssessment ?? "WIDA") as Assessment);
  } else {
    // No pre-existing student — create user + student from scratch
    const [user] = await db
      .insert(usersTable)
      .values({
        email: invite.inviteeEmail,
        name: invite.inviteeName,
        passwordHash,
        role: "student",
        emailVerified: true,
      })
      .returning();

    const [created] = await db
      .insert(studentsTable)
      .values({
        userId: user.id,
        guardianId: invite.inviterId,
        name: invite.inviteeName,
        email: invite.inviteeEmail,
        gradeBand: invite.gradeBand ?? "6-8",
        stateAssessment: invite.stateAssessment ?? "WIDA",
        homeLanguage: invite.homeLanguage ?? null,
        passwordHash,
        emailVerified: true,
        accountType: "teacher_managed",
      })
      .returning();

    student = created;
    await ensureStudentLevels(student.id, (invite.stateAssessment ?? "WIDA") as Assessment);
  }

  // Mark invitation as accepted
  await db
    .update(invitationsTable)
    .set({ acceptedAt: now })
    .where(eq(invitationsTable.id, invite.id));

  // Issue session
  const sessionToken = generateToken();
  const sessionHash = sha256(sessionToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(userSessionsTable).values({
    userId: student.id,
    userType: "student",
    tokenHash: sessionHash,
    expiresAt,
  });

  req.log.info({ studentId: student.id }, "Invitation accepted — account created");
  sendSuccess(res, { token: sessionToken, studentId: student.id, teacherId: invite.inviterId }, 201);
});

export default router;
