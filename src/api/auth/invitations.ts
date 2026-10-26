import type { IRouter, Request, Response } from "express";
import { createApiRouter } from "../../lib/http/create-api-router";
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
  districtsTable,
  districtAdminsTable,
} from "../../../db";
import { ensureStudentLevels } from "../students/students";
import { deliverTransactionalEmail } from "../../lib/mail/deliver-email";
import {
  educatorInvitationEmail,
  invitationEmail,
  userInvitationSubject,
} from "../../lib/mail/email-templates";
import { config } from "../../config/index";
import type { Assessment } from "../../lib/assessments";
import { sendError, sendSuccess } from "../../lib/http/api-response";
import { getFrontendAppUrl } from "../../lib/http/request-origin";
import {
  createSessionPair as createAuthSessionPair,
  sessionContextFromRequest,
  sha256Token,
} from "../../lib/auth/session";
import {
  assertEmailAvailableForRole,
  findUserByEmailAndRole,
} from "../../lib/auth/email-role-uniqueness";

const router: IRouter = createApiRouter();

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BCRYPT_ROUNDS = 12;

function sha256(raw: string): string {
  return sha256Token(raw);
}
function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
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

  const emailCheck = await assertEmailAvailableForRole(normalizedEmail, "student", {
    inviteeRole: "student",
  });
  if (!emailCheck.ok) {
    sendError(res, emailCheck.status, emailCheck.message);
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

  const inviteUrl = `${getFrontendAppUrl(req)}/accept-invite?token=${token}`;

  const invitationEmailDelivery = await deliverTransactionalEmail(
    {
      to: normalizedEmail,
      subject: userInvitationSubject(inviter.name),
      html: invitationEmail({
        inviteeName: name.trim(),
        inviterName: inviter.name,
        inviterRole: inviter.type,
        assessment: stateAssessment,
        message: message?.trim(),
        inviteUrl,
      }),
    },
    req.log,
    { to: normalizedEmail, inviterId: inviter.id, kind: "student_invite" },
  );

  req.log.info({ to: normalizedEmail, inviterId: inviter.id, invitationEmailSent: invitationEmailDelivery.sent }, "Invitation created");
  sendSuccess(res, { ok: true, invitationEmailSent: invitationEmailDelivery.sent }, 201);
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

  let districtName: string | undefined;
  if (invite.inviteeRole === "district_admin" && invite.metadata) {
    try {
      const meta = JSON.parse(invite.metadata) as { districtName?: string };
      districtName = meta.districtName;
    } catch {
      /* ignore */
    }
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
    districtName,
  });
});

// ── POST /auth/invite/educator — principal invites a teacher ────────────────
router.post("/auth/invite/educator", async (req: Request, res: Response): Promise<void> => {
  const inviter = await resolveInviter(req);
  if (!inviter) {
    sendError(res, 401, "Authentication required");
    return;
  }

  const { firstName, lastName, email, emailVerified: markEmailVerified } = req.body as {
    firstName?: string;
    lastName?: string;
    email?: string;
    /** Principal attests the email is correct; teacher still sets password via invite link. */
    emailVerified?: boolean;
  };

  if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
    sendError(res, 400, "firstName, lastName, and email are required");
    return;
  }

  const name = `${firstName.trim()} ${lastName.trim()}`;
  const normalizedEmail = email.trim().toLowerCase();

  const emailCheck = await assertEmailAvailableForRole(normalizedEmail, "teacher", {
    inviteeRole: "teacher",
  });
  if (!emailCheck.ok) {
    sendError(res, emailCheck.status, emailCheck.message);
    return;
  }

  const [inviterGuardian] = await db
    .select({ schoolId: profilesTable.schoolId })
    .from(profilesTable)
    .where(eq(profilesTable.id, inviter.id))
    .limit(1);

  const emailVerified = markEmailVerified === true;

  const [user] = await db
    .insert(usersTable)
    .values({
      email: normalizedEmail,
      name,
      passwordHash: null,
      role: "teacher",
      emailVerified,
    })
    .returning();

  const [guardian] = await db
    .insert(profilesTable)
    .values({
      userId: user.id,
      schoolId: inviterGuardian?.schoolId ?? null,
    })
    .returning();

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
    metadata: JSON.stringify({
      userId: user.id,
      profileId: guardian.id,
      emailVerified,
    }),
  });

  const inviteUrl = `${getFrontendAppUrl(req)}/accept-invite?token=${token}`;

  const invitationEmailDelivery = await deliverTransactionalEmail(
    {
      to: normalizedEmail,
      subject: userInvitationSubject(inviter.name),
      html: educatorInvitationEmail({ inviteeName: name, inviterName: inviter.name, inviteUrl }),
    },
    req.log,
    { to: normalizedEmail, inviterId: inviter.id, kind: "teacher_invite" },
  );

  req.log.info({ to: normalizedEmail, inviterId: inviter.id, invitationEmailSent: invitationEmailDelivery.sent }, "Educator invitation created");
  sendSuccess(res, { ok: true, invitationEmailSent: invitationEmailDelivery.sent }, 201);
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
    type PrincipalInviteMeta = {
      schoolId?: string;
      schoolName: string;
      state?: string | null;
      schoolCode?: string | null;
      districtId: string;
      userId?: string;
      profileId?: string;
    };

    let schoolMeta: PrincipalInviteMeta;
    try {
      schoolMeta = JSON.parse(invite.metadata ?? "{}") as PrincipalInviteMeta;
    } catch {
      sendError(res, 400, "Invitation data is corrupt — ask your district admin to re-send.");
      return;
    }

    if (!schoolMeta.schoolName || !schoolMeta.districtId) {
      sendError(res, 400, "Invitation is missing school details — ask your district admin to re-send.");
      return;
    }

    const result = await db.transaction(async (tx) => {
      if (schoolMeta.schoolId && schoolMeta.userId && schoolMeta.profileId) {
        const [school] = await tx
          .select()
          .from(schoolsTable)
          .where(eq(schoolsTable.id, schoolMeta.schoolId))
          .limit(1);
        if (!school) {
          throw new Error("School not found for this invitation");
        }

        const [existingUser] = await tx
          .select({
            id: usersTable.id,
            isActive: usersTable.isActive,
            passwordHash: usersTable.passwordHash,
          })
          .from(usersTable)
          .where(eq(usersTable.id, schoolMeta.userId))
          .limit(1);

        if (!existingUser) {
          throw new Error("Principal account not found for this invitation");
        }
        if (existingUser.isActive === false) {
          throw new Error("ACCOUNT_INACTIVE");
        }
        if (existingUser.passwordHash) {
          throw new Error("PASSWORD_ALREADY_SET");
        }

        const [user] = await tx
          .update(usersTable)
          .set({
            passwordHash,
            emailVerified: true,
            name: invite.inviteeName,
          })
          .where(eq(usersTable.id, schoolMeta.userId))
          .returning();

        if (!user) {
          throw new Error("Principal account not found for this invitation");
        }

        const [guardian] = await tx
          .select()
          .from(profilesTable)
          .where(eq(profilesTable.id, schoolMeta.profileId))
          .limit(1);

        if (!guardian || guardian.schoolId !== school.id) {
          throw new Error("Principal profile not found for this invitation");
        }

        return { school, user, guardian };
      }

      const existingUser = await findUserByEmailAndRole(invite.inviteeEmail, "principal");
      if (existingUser) {
        throw new Error("ACCOUNT_EXISTS");
      }

      const [school] = await tx
        .insert(schoolsTable)
        .values({
          name: schoolMeta.schoolName,
          districtId: schoolMeta.districtId,
          state: schoolMeta.state ?? null,
          schoolCode: schoolMeta.schoolCode ?? null,
        })
        .returning();

      const [user] = await tx
        .insert(usersTable)
        .values({
          email: invite.inviteeEmail,
          name: invite.inviteeName,
          passwordHash,
          role: "principal",
          emailVerified: true,
        })
        .returning();

      const [guardian] = await tx
        .insert(profilesTable)
        .values({ userId: user.id, schoolId: school.id })
        .returning();

      return { school, user, guardian };
    }).catch((err: unknown) => {
      if (err instanceof Error) {
        if (err.message === "ACCOUNT_EXISTS") return null;
        if (err.message === "ACCOUNT_INACTIVE") return { inactive: true as const };
        if (err.message === "PASSWORD_ALREADY_SET") return { passwordSet: true as const };
      }
      throw err;
    });

    if (result && "inactive" in result && result.inactive) {
      sendError(
        res,
        403,
        "This account has been deactivated. Contact your district administrator before accepting the invitation.",
        { accountInactive: true },
      );
      return;
    }
    if (result && "passwordSet" in result && result.passwordSet) {
      sendError(res, 409, "A password is already set for this account. Please log in instead.");
      return;
    }

    if (!result || !("school" in result)) {
      sendError(res, 409, "An account with this email already exists as a principal. Please log in instead.");
      return;
    }

    await db
      .update(invitationsTable)
      .set({ acceptedAt: now })
      .where(eq(invitationsTable.id, invite.id));

    const { token: sessionToken } = await createAuthSessionPair({
      userId:   result.guardian.id,
      userType: "principal",
      context:  sessionContextFromRequest(req),
      enforceSingleSession: false,
    });

    req.log.info(
      { guardianId: result.guardian.id, schoolId: result.school.id },
      "Principal invitation accepted — school + account created",
    );
    sendSuccess(
      res,
      {
        token: sessionToken,
        teacherId: result.guardian.id,
        userType: "principal",
        role: "principal",
      },
      201,
    );
    return;
  }

  // ── Educator (teacher) invite path ──────────────────────────────────────────
  if (invite.inviteeRole === "teacher") {
    type TeacherInviteMeta = {
      userId?: string;
      profileId?: string;
      emailVerified?: boolean;
    };

    let teacherMeta: TeacherInviteMeta = {};
    try {
      teacherMeta = JSON.parse(invite.metadata ?? "{}") as TeacherInviteMeta;
    } catch {
      teacherMeta = {};
    }

    if (teacherMeta.userId && teacherMeta.profileId) {
      const [existingUser] = await db
        .select({
          id: usersTable.id,
          isActive: usersTable.isActive,
          passwordHash: usersTable.passwordHash,
        })
        .from(usersTable)
        .where(eq(usersTable.id, teacherMeta.userId))
        .limit(1);

      if (!existingUser) {
        sendError(res, 400, "Teacher account not found for this invitation");
        return;
      }
      if (existingUser.isActive === false) {
        sendError(
          res,
          403,
          "This account has been deactivated. Contact your district administrator before accepting the invitation.",
          { accountInactive: true },
        );
        return;
      }
      if (existingUser.passwordHash) {
        sendError(res, 409, "A password is already set for this account. Please log in instead.");
        return;
      }

      const [guardian] = await db
        .select()
        .from(profilesTable)
        .where(eq(profilesTable.id, teacherMeta.profileId))
        .limit(1);

      if (!guardian || guardian.userId !== teacherMeta.userId) {
        sendError(res, 400, "Teacher profile not found for this invitation");
        return;
      }

      await db
        .update(usersTable)
        .set({
          passwordHash,
          name: invite.inviteeName,
          emailVerified: true,
        })
        .where(eq(usersTable.id, teacherMeta.userId));

      await db
        .update(invitationsTable)
        .set({ acceptedAt: now })
        .where(eq(invitationsTable.id, invite.id));

      const { token: sessionToken } = await createAuthSessionPair({
        userId: guardian.id,
        userType: "teacher",
        context: sessionContextFromRequest(req),
        enforceSingleSession: false,
      });

      req.log.info({ guardianId: guardian.id }, "Educator invitation accepted — password set");
      sendSuccess(res, { token: sessionToken, teacherId: guardian.id, userType: "teacher" }, 201);
      return;
    }

    const existingUser = await findUserByEmailAndRole(invite.inviteeEmail, "teacher");
    if (existingUser) {
      sendError(res, 409, "An account with this email already exists as a teacher. Please log in instead.");
      return;
    }

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

    const { token: sessionToken } = await createAuthSessionPair({
      userId: guardian.id,
      userType: "teacher",
      context: sessionContextFromRequest(req),
      enforceSingleSession: false,
    });

    req.log.info({ guardianId: guardian.id }, "Educator invitation accepted — account created");
    sendSuccess(res, { token: sessionToken, teacherId: guardian.id, userType: "teacher" }, 201);
    return;
  }

  // ── District admin invite path (super admin created district) ───────────────
  if (invite.inviteeRole === "district_admin") {
    const existingUser = await findUserByEmailAndRole(invite.inviteeEmail, "district_admin");
    if (existingUser) {
      sendError(
        res,
        409,
        "An account with this email already exists as a district administrator. Please log in instead.",
      );
      return;
    }

    let districtMeta: { districtId: string; districtName?: string };
    try {
      districtMeta = JSON.parse(invite.metadata ?? "{}") as typeof districtMeta;
    } catch {
      sendError(res, 400, "Invitation data is corrupt — ask your platform admin to re-send.");
      return;
    }

    if (!districtMeta.districtId) {
      sendError(res, 400, "Invitation is missing district details — ask your platform admin to re-send.");
      return;
    }

    const [districtRow] = await db
      .select({ id: districtsTable.id, adminId: districtsTable.adminId })
      .from(districtsTable)
      .where(eq(districtsTable.id, districtMeta.districtId))
      .limit(1);

    if (!districtRow) {
      sendError(res, 400, "This district no longer exists.");
      return;
    }
    if (districtRow.adminId) {
      sendError(res, 409, "This district already has an administrator.");
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(usersTable)
        .values({
          email: invite.inviteeEmail,
          name: invite.inviteeName,
          passwordHash,
          role: "district_admin",
          emailVerified: true,
        })
        .returning();

      const [da] = await tx
        .insert(districtAdminsTable)
        .values({
          userId: user.id,
          districtId: districtMeta.districtId,
        })
        .returning();

      await tx
        .update(districtsTable)
        .set({ adminId: user.id })
        .where(eq(districtsTable.id, districtMeta.districtId));

      return { user, da };
    });

    await db
      .update(invitationsTable)
      .set({ acceptedAt: now })
      .where(eq(invitationsTable.id, invite.id));

    const { token: sessionToken } = await createAuthSessionPair({
      userId: result.da.id,
      userType: "district_admin",
      context: sessionContextFromRequest(req),
      enforceSingleSession: false,
    });

    req.log.info(
      { districtAdminId: result.da.id, districtId: districtMeta.districtId },
      "District admin invitation accepted",
    );
    sendSuccess(
      res,
      {
        token: sessionToken,
        teacherId: result.da.id,
        districtId: result.da.districtId,
        userType: "district_admin",
        role: "district_admin",
      },
      201,
    );
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
    const existingStudentUser = await findUserByEmailAndRole(invite.inviteeEmail, "student");
    if (existingStudentUser) {
      sendError(res, 409, "An account with this email already exists as a student. Please log in instead.");
      return;
    }

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

  const { token: sessionToken } = await createAuthSessionPair({
    userId:   student.id,
    userType: "student",
    context:  sessionContextFromRequest(req),
  });

  req.log.info({ studentId: student.id }, "Invitation accepted — account created");
  sendSuccess(res, { token: sessionToken, studentId: student.id, teacherId: invite.inviterId }, 201);
});

export default router;
