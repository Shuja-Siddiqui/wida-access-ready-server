import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { and, eq, count, gt, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  districtsTable,
  schoolsTable,
  usersTable,
  invitationsTable,
} from "../../../db";
import { sendError, sendSuccess } from "../../lib/api-response";
import { requireAuth } from "../../middlewares/auth";
import { sendHtmlEmail } from "../../lib/mailer";
import { educatorInvitationEmail } from "../../lib/email-templates";

const router: IRouter = Router();

router.use("/districts", requireAuth);

const CreateDistrictBody = z.object({
  name: z.string().min(1),
  state: z.string().optional(),
  districtCode: z.string().optional(),
});

const DistrictIdParam = z.object({ districtId: z.string().uuid() });

// List all districts
router.get("/districts", async (_req, res): Promise<void> => {
  const rows = await db
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

  sendSuccess(res, rows);
});

// Create a district
router.post("/districts", async (req, res): Promise<void> => {
  const parsed = CreateDistrictBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return;
  }

  const userId = (req as any).user?.id as string | undefined;

  const [district] = await db
    .insert(districtsTable)
    .values({
      name: parsed.data.name,
      state: parsed.data.state ?? null,
      districtCode: parsed.data.districtCode ?? null,
      adminId: userId ?? null,
    })
    .returning();

  sendSuccess(res, district, 201);
});

// Get a single district
router.get("/districts/:districtId", async (req, res): Promise<void> => {
  const params = DistrictIdParam.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "Invalid district ID");
    return;
  }

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

  const schools = await db
    .select()
    .from(schoolsTable)
    .where(eq(schoolsTable.districtId, params.data.districtId))
    .orderBy(schoolsTable.name);

  sendSuccess(res, schools);
});

// Update a district
router.patch("/districts/:districtId", async (req, res): Promise<void> => {
  const params = DistrictIdParam.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "Invalid district ID");
    return;
  }

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
// Sends a principal invitation — school + principal are only created in the DB
// after the principal accepts the invite and sets their password.
const CreateDistrictSchoolBody = z.object({
  name:       z.string().min(1),
  state:      z.string().optional(),
  schoolCode: z.string().optional(),
  principal: z.object({
    name:  z.string().min(1),
    email: z.string().email(),
  }),
});

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

router.post("/districts/:districtId/schools", async (req, res): Promise<void> => {
  const params = DistrictIdParam.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "Invalid district ID");
    return;
  }

  const parsed = CreateDistrictSchoolBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return;
  }

  const { name, state, schoolCode, principal } = parsed.data;
  const { districtId } = params.data;

  // Verify the district exists
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

  // Block if principal already has an account
  const [existingUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail))
    .limit(1);
  if (existingUser) {
    sendError(res, 409, "A user with that email already exists.");
    return;
  }

  // Block if an active principal invitation has already been sent to this email
  const [existingInvite] = await db
    .select({ id: invitationsTable.id })
    .from(invitationsTable)
    .where(
      and(
        eq(invitationsTable.inviteeEmail, normalizedEmail),
        eq(invitationsTable.inviteeRole, "principal"),
        isNull(invitationsTable.acceptedAt),
        gt(invitationsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (existingInvite) {
    sendError(res, 409, "An active invitation has already been sent to this email.");
    return;
  }

  // Resolve the district admin's name for the invitation
  const [adminUser] = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, req.auth!.userId))
    .limit(1);

  const inviterName = adminUser?.name ?? "Your district administrator";

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  // Store school details in metadata — the accept handler reads these to create everything
  const metadata = JSON.stringify({
    schoolName: name,
    state: state ?? null,
    schoolCode: schoolCode ?? null,
    districtId,
  });

  await db.insert(invitationsTable).values({
    inviterId:    req.auth!.id,
    inviterType:  "district_admin",
    inviterName,
    inviteeEmail: normalizedEmail,
    inviteeName:  principal.name,
    inviteeRole:  "principal",
    metadata,
    tokenHash,
    expiresAt,
  });

  // Send invitation email (non-fatal)
  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim() ?? req.protocol;
  const host  = (req.headers["x-forwarded-host"] as string)?.split(",")[0]?.trim() ?? req.get("host") ?? "";
  const inviteUrl = `${proto}://${host}/accept-invite?token=${token}`;

  try {
    await sendHtmlEmail({
      to: normalizedEmail,
      subject: `${inviterName} invited you to ACCESS Ready`,
      html: educatorInvitationEmail({
        inviteeName: principal.name,
        inviterName,
        inviteUrl,
      }),
    });
    req.log.info({ email: normalizedEmail }, "Principal invitation email sent");
  } catch (err) {
    req.log.warn({ err, email: normalizedEmail }, "Failed to deliver principal invitation email");
  }

  sendSuccess(res, { ok: true }, 201);
});

export default router;
