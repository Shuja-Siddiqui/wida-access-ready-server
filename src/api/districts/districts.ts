import type { IRouter } from "express";
import { createApiRouter } from "../../lib/http/create-api-router";
import crypto from "node:crypto";
import { and, eq, count, gt, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  districtsTable,
  schoolsTable,
  usersTable,
  profilesTable,
  invitationsTable,
} from "../../../db";
import { sendError, sendSuccess } from "../../lib/http/api-response";
import { requireAuth } from "../../middlewares/auth";
import {
  assertDistrictAccess,
  requireOrgStaff,
  resolveOrgScope,
  sendAccessDenied,
} from "../../lib/auth/org-access";
import { assertEmailAvailableForRole } from "../../lib/auth/email-role-uniqueness";
import { deliverTransactionalEmail } from "../../lib/mail/deliver-email";
import { getFrontendAppUrl } from "../../lib/http/request-origin";
import {
  districtAdminInvitationEmail,
  districtAdminInvitationSubject,
  principalInvitationEmail,
  principalInvitationSubject,
} from "../../lib/mail/email-templates";

const router: IRouter = createApiRouter();

router.use("/districts", requireAuth, requireOrgStaff);

const CreateDistrictBody = z.object({
  name: z.string().min(1),
  state: z.string().optional(),
  districtCode: z.string().optional(),
  districtAdmin: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
});

const DistrictIdParam = z.object({ districtId: z.string().uuid() });

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const districtListQuery = db
  .select({
    id: districtsTable.id,
    name: districtsTable.name,
    state: districtsTable.state,
    districtCode: districtsTable.districtCode,
    adminId: districtsTable.adminId,
    createdAt: districtsTable.createdAt,
    schoolCount: count(schoolsTable.id),
  })
  .from(districtsTable)
  .leftJoin(schoolsTable, eq(schoolsTable.districtId, districtsTable.id))
  .groupBy(districtsTable.id)
  .orderBy(districtsTable.name);

// List districts — super_admin sees all; district_admin sees their own
router.get("/districts", async (req, res): Promise<void> => {
  const scope = await resolveOrgScope(req.auth!);
  if (!scope) {
    sendError(res, 403, "Organization access required");
    return;
  }

  if (scope.role === "super_admin") {
    sendSuccess(res, await districtListQuery);
    return;
  }

  if (scope.role === "district_admin") {
    const rows = await districtListQuery.where(eq(districtsTable.id, scope.districtId));
    sendSuccess(res, rows);
    return;
  }

  sendError(res, 403, "You do not have access to district listings");
});

// Create a district — super_admin only
router.post("/districts", async (req, res): Promise<void> => {
  const scope = await resolveOrgScope(req.auth!);
  if (scope?.role !== "super_admin") {
    sendError(res, 403, "Super admin access required to create districts");
    return;
  }

  const parsed = CreateDistrictBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return;
  }

  const { name, state, districtCode, districtAdmin } = parsed.data;
  const normalizedEmail = districtAdmin.email.toLowerCase();

  const emailCheck = await assertEmailAvailableForRole(normalizedEmail, "district_admin", {
    inviteeRole: "district_admin",
  });
  if (!emailCheck.ok) {
    sendError(res, emailCheck.status, emailCheck.message);
    return;
  }

  const [adminUser] = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, req.auth!.userId))
    .limit(1);
  const inviterName = adminUser?.name ?? "ACCESS Ready";

  const [district] = await db
    .insert(districtsTable)
    .values({
      name,
      state: state ?? null,
      districtCode: districtCode ?? null,
      adminId: null,
    })
    .returning();

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  const metadata = JSON.stringify({
    districtId: district.id,
    districtName: name,
  });

  await db.insert(invitationsTable).values({
    inviterId: req.auth!.id,
    inviterType: "super_admin",
    inviterName,
    inviteeEmail: normalizedEmail,
    inviteeName: districtAdmin.name,
    inviteeRole: "district_admin",
    metadata,
    tokenHash,
    expiresAt,
  });

  const inviteUrl = `${getFrontendAppUrl(req)}/accept-invite?token=${token}`;

  const invitationEmail = await deliverTransactionalEmail(
    {
      to: normalizedEmail,
      subject: districtAdminInvitationSubject(name),
      html: districtAdminInvitationEmail({
        inviteeName: districtAdmin.name,
        inviterName,
        districtName: name,
        inviteUrl,
      }),
    },
    req.log,
    { email: normalizedEmail, districtId: district.id, kind: "district_admin_invite" },
  );
  if (invitationEmail.sent) {
    req.log.info({ email: normalizedEmail, districtId: district.id }, "District admin invitation email sent");
  }

  sendSuccess(res, { ...district, inviteeEmail: normalizedEmail, invitationEmailSent: invitationEmail.sent }, 201);
});

// Get a single district
router.get("/districts/:districtId", async (req, res): Promise<void> => {
  const params = DistrictIdParam.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "Invalid district ID");
    return;
  }

  const denied = await assertDistrictAccess(req.auth!, params.data.districtId);
  if (denied) { sendAccessDenied(res, denied); return; }

  const [district] = await db
    .select({
      id: districtsTable.id,
      name: districtsTable.name,
      state: districtsTable.state,
      districtCode: districtsTable.districtCode,
      adminId: districtsTable.adminId,
      createdAt: districtsTable.createdAt,
      schoolCount: count(schoolsTable.id),
    })
    .from(districtsTable)
    .leftJoin(schoolsTable, eq(schoolsTable.districtId, districtsTable.id))
    .where(eq(districtsTable.id, params.data.districtId))
    .groupBy(districtsTable.id)
    .limit(1);

  if (!district) {
    sendError(res, 404, "District not found");
    return;
  }

  sendSuccess(res, district);
});

// List schools in a district
router.get("/districts/:districtId/schools", async (req, res): Promise<void> => {
  const params = DistrictIdParam.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "Invalid district ID");
    return;
  }

  const denied = await assertDistrictAccess(req.auth!, params.data.districtId);
  if (denied) { sendAccessDenied(res, denied); return; }

  const schools = await db
    .select()
    .from(schoolsTable)
    .where(eq(schoolsTable.districtId, params.data.districtId))
    .orderBy(schoolsTable.name);

  sendSuccess(res, schools);
});

// Update a district — super_admin any; district_admin own district only
router.patch("/districts/:districtId", async (req, res): Promise<void> => {
  const params = DistrictIdParam.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "Invalid district ID");
    return;
  }

  const denied = await assertDistrictAccess(req.auth!, params.data.districtId);
  if (denied) { sendAccessDenied(res, denied); return; }

  const parsed = CreateDistrictBody.partial().safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return;
  }

  const updates: Partial<typeof districtsTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.state !== undefined) updates.state = parsed.data.state;
  if (parsed.data.districtCode !== undefined) updates.districtCode = parsed.data.districtCode;

  if (Object.keys(updates).length === 0) {
    sendError(res, 400, "No fields to update");
    return;
  }

  const [district] = await db
    .update(districtsTable)
    .set(updates)
    .where(eq(districtsTable.id, params.data.districtId))
    .returning();

  if (!district) {
    sendError(res, 404, "District not found");
    return;
  }

  sendSuccess(res, district);
});

// ── POST /districts/:districtId/schools ──────────────────────────────────────
// Creates the school + principal profile immediately (district can manage active
// status). Invitation email lets the principal set their password and sign in.
const CreateDistrictSchoolBody = z.object({
  name:       z.string().min(1),
  state:      z.string().optional(),
  schoolCode: z.string().optional(),
  principal: z.object({
    name:  z.string().min(1),
    email: z.string().email(),
  }),
});

router.post("/districts/:districtId/schools", async (req, res): Promise<void> => {
  const params = DistrictIdParam.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "Invalid district ID");
    return;
  }

  const scope = await resolveOrgScope(req.auth!);
  if (scope?.role === "principal") {
    sendError(res, 403, "Only district administrators can invite principals");
    return;
  }

  const denied = await assertDistrictAccess(req.auth!, params.data.districtId);
  if (denied) { sendAccessDenied(res, denied); return; }

  const parsed = CreateDistrictSchoolBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return;
  }

  const { name, state, schoolCode, principal } = parsed.data;
  const { districtId } = params.data;

  const [district] = await db
    .select({ id: districtsTable.id })
    .from(districtsTable)
    .where(eq(districtsTable.id, districtId))
    .limit(1);
  if (!district) {
    sendError(res, 404, "District not found");
    return;
  }

  const normalizedEmail = principal.email.toLowerCase();

  const emailCheck = await assertEmailAvailableForRole(normalizedEmail, "principal", {
    inviteeRole: "principal",
  });
  if (!emailCheck.ok) {
    sendError(res, emailCheck.status, emailCheck.message);
    return;
  }

  const [adminUser] = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, req.auth!.userId))
    .limit(1);

  const inviterName = adminUser?.name ?? "Your district administrator";

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  const provisioned = await db.transaction(async (tx) => {
    const [school] = await tx
      .insert(schoolsTable)
      .values({
        name,
        districtId,
        state: state ?? null,
        schoolCode: schoolCode ?? null,
      })
      .returning();

    const [user] = await tx
      .insert(usersTable)
      .values({
        email: normalizedEmail,
        name: principal.name,
        role: "principal",
        passwordHash: null,
        emailVerified: false,
        isActive: true,
      })
      .returning();

    const [profile] = await tx
      .insert(profilesTable)
      .values({ userId: user.id, schoolId: school.id })
      .returning();

    const metadata = JSON.stringify({
      schoolId: school.id,
      schoolName: name,
      state: state ?? null,
      schoolCode: schoolCode ?? null,
      districtId,
      userId: user.id,
      profileId: profile.id,
    });

    await tx.insert(invitationsTable).values({
      inviterId: req.auth!.id,
      inviterType: "district_admin",
      inviterName,
      inviteeEmail: normalizedEmail,
      inviteeName: principal.name,
      inviteeRole: "principal",
      metadata,
      tokenHash,
      expiresAt,
    });

    return { school, profile };
  });

  const inviteUrl = `${getFrontendAppUrl(req)}/accept-invite?token=${token}`;

  const invitationEmail = await deliverTransactionalEmail(
    {
      to: normalizedEmail,
      subject: principalInvitationSubject(name),
      html: principalInvitationEmail({
        inviteeName: principal.name,
        inviterName,
        schoolName: name,
        inviteUrl,
      }),
    },
    req.log,
    { email: normalizedEmail, districtId, kind: "principal_invite" },
  );
  if (invitationEmail.sent) {
    req.log.info({ email: normalizedEmail }, "Principal invitation email sent");
  }

  sendSuccess(
    res,
    {
      ok: true,
      invitationEmailSent: invitationEmail.sent,
      schoolId: provisioned.school.id,
      principalProfileId: provisioned.profile.id,
    },
    201,
  );
});

export default router;
