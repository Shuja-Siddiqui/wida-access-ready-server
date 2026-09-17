import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  districtAdminsTable,
  districtSeatAllocationsTable,
  schoolsTable,
  usersTable,
  ownerStripeCustomersTable,
} from "../../../db";
import { sendError, sendSuccess } from "../../lib/http/api-response";
import { requireAuth } from "../../middlewares/auth";

const router: IRouter = Router();

router.use("/district", requireAuth);

const AllocateBody = z.object({
  seatsAllocated: z.number().int().min(0),
});
const SchoolIdParam = z.object({ schoolId: z.string().uuid() });

// ── Resolve district admin from the session teacherId ─────────────────────
async function resolveDistrictAdmin(
  teacherId: string,
): Promise<{ id: string; districtId: string | null } | null> {
  const [row] = await db
    .select({ id: districtAdminsTable.id, districtId: districtAdminsTable.districtId })
    .from(districtAdminsTable)
    .where(eq(districtAdminsTable.id, teacherId))
    .limit(1);
  return row ?? null;
}

// ── GET /api/district/plan ────────────────────────────────────────────────
// Returns the active subscription for the district admin (seat count purchased,
// total seats allocated to schools, and remaining available seats).
router.get("/district/plan", async (req, res): Promise<void> => {
  const adminId = req.auth?.id;
  if (!adminId) {
    sendError(res, 401, "Not authenticated");
    return;
  }

  const admin = await resolveDistrictAdmin(adminId);
  if (!admin) {
    sendError(res, 403, "District admin not found");
    return;
  }

  // Look up their Stripe customer
  const [customerRow] = await db
    .select({ stripeCustomerId: ownerStripeCustomersTable.stripeCustomerId })
    .from(ownerStripeCustomersTable)
    .where(
      and(
        eq(ownerStripeCustomersTable.ownerId, admin.id),
        eq(ownerStripeCustomersTable.ownerType, "organization"),
      ),
    )
    .limit(1);

  let subscription: {
    status: string;
    seatCount: number;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null = null;

  if (customerRow?.stripeCustomerId) {
    const result = await db.execute(sql`
      select
        s.status,
        s.cancel_at_period_end,
        si.current_period_end,
        si.quantity
      from "stripe"."subscriptions" s
      left join "stripe"."subscription_items" si on si.subscription = s.id
      where s.customer = ${customerRow.stripeCustomerId}
        and s.status = 'active'
      order by s.created desc
      limit 1
    `);
    const row = (result.rows as Record<string, unknown>[])[0];
    if (row) {
      subscription = {
        status: row.status as string,
        seatCount: Number(row.quantity ?? 0),
        currentPeriodEnd: row.current_period_end
          ? new Date(Number(row.current_period_end) * 1000).toISOString()
          : null,
        cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      };
    }
  }

  // Compute allocated seats (sum across all school allocations)
  const allocResult = await db.execute(sql`
    select coalesce(sum(seats_allocated), 0) as total_allocated
    from district_seat_allocations
    where district_admin_id = ${admin.id}
  `);
  const totalAllocated = Number(
    (allocResult.rows as Record<string, unknown>[])[0]?.total_allocated ?? 0,
  );

  const seatsPurchased = subscription?.seatCount ?? 0;
  const seatsRemaining = Math.max(0, seatsPurchased - totalAllocated);

  sendSuccess(res, {
    hasActivePlan: subscription?.status === "active",
    subscription,
    seatsPurchased,
    seatsAllocated: totalAllocated,
    seatsRemaining,
  });
});

// ── GET /api/district/allocations ─────────────────────────────────────────
// Returns the per-school seat allocations for this district admin.
router.get("/district/allocations", async (req, res): Promise<void> => {
  const adminId = req.auth?.id;
  if (!adminId) {
    sendError(res, 401, "Not authenticated");
    return;
  }

  const admin = await resolveDistrictAdmin(adminId);
  if (!admin) {
    sendError(res, 403, "District admin not found");
    return;
  }

  const allocations = await db
    .select({
      id: districtSeatAllocationsTable.id,
      schoolId: districtSeatAllocationsTable.schoolId,
      schoolName: schoolsTable.name,
      seatsAllocated: districtSeatAllocationsTable.seatsAllocated,
      updatedAt: districtSeatAllocationsTable.updatedAt,
    })
    .from(districtSeatAllocationsTable)
    .innerJoin(schoolsTable, eq(districtSeatAllocationsTable.schoolId, schoolsTable.id))
    .where(eq(districtSeatAllocationsTable.districtAdminId, admin.id))
    .orderBy(schoolsTable.name);

  sendSuccess(res, allocations);
});

// ── PUT /api/district/schools/:schoolId/allocate ──────────────────────────
// Upsert the seat allocation for a school. Validates that total allocated seats
// across all schools never exceeds the number of seats purchased.
router.put("/district/schools/:schoolId/allocate", async (req, res): Promise<void> => {
  const adminId = req.auth?.id;
  if (!adminId) {
    sendError(res, 401, "Not authenticated");
    return;
  }

  const params = SchoolIdParam.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "Invalid school ID");
    return;
  }

  const body = AllocateBody.safeParse(req.body);
  if (!body.success) {
    sendError(res, 400, body.error.message);
    return;
  }

  const admin = await resolveDistrictAdmin(adminId);
  if (!admin) {
    sendError(res, 403, "District admin not found");
    return;
  }

  if (!admin.districtId) {
    sendError(res, 403, "Your account is not assigned to a district. Please contact support.");
    return;
  }

  // Verify the school belongs to this district
  const [school] = await db
    .select({ id: schoolsTable.id, name: schoolsTable.name })
    .from(schoolsTable)
    .where(
      and(
        eq(schoolsTable.id, params.data.schoolId),
        eq(schoolsTable.districtId, admin.districtId),
      ),
    )
    .limit(1);

  if (!school) {
    sendError(res, 404, "School not found in this district");
    return;
  }

  // Get current allocation for this school (so we can compute the delta)
  const [existing] = await db
    .select({ seatsAllocated: districtSeatAllocationsTable.seatsAllocated })
    .from(districtSeatAllocationsTable)
    .where(
      and(
        eq(districtSeatAllocationsTable.districtAdminId, admin.id),
        eq(districtSeatAllocationsTable.schoolId, params.data.schoolId),
      ),
    )
    .limit(1);

  const currentForSchool = existing?.seatsAllocated ?? 0;
  const delta = body.data.seatsAllocated - currentForSchool;

  if (delta > 0) {
    // Only need to validate when increasing allocation
    const [customerRow] = await db
      .select({ stripeCustomerId: ownerStripeCustomersTable.stripeCustomerId })
      .from(ownerStripeCustomersTable)
      .where(
        and(
          eq(ownerStripeCustomersTable.ownerId, admin.id),
          eq(ownerStripeCustomersTable.ownerType, "organization"),
        ),
      )
      .limit(1);

    let seatsPurchased = 0;
    if (customerRow?.stripeCustomerId) {
      const subResult = await db.execute(sql`
        select si.quantity
        from "stripe"."subscriptions" s
        left join "stripe"."subscription_items" si on si.subscription = s.id
        where s.customer = ${customerRow.stripeCustomerId}
          and s.status = 'active'
        order by s.created desc
        limit 1
      `);
      seatsPurchased = Number(
        (subResult.rows as Record<string, unknown>[])[0]?.quantity ?? 0,
      );
    }

    const totalResult = await db.execute(sql`
      select coalesce(sum(seats_allocated), 0) as total_allocated
      from district_seat_allocations
      where district_admin_id = ${admin.id}
    `);
    const currentTotal = Number(
      (totalResult.rows as Record<string, unknown>[])[0]?.total_allocated ?? 0,
    );

    const newTotal = currentTotal + delta;
    if (newTotal > seatsPurchased) {
      sendError(
        res,
        422,
        `Cannot allocate ${body.data.seatsAllocated} seats to ${school.name}: only ${seatsPurchased - currentTotal + currentForSchool} seats available.`,
      );
      return;
    }
  }

  // Upsert
  const [row] = await db
    .insert(districtSeatAllocationsTable)
    .values({
      districtAdminId: admin.id,
      schoolId: params.data.schoolId,
      seatsAllocated: body.data.seatsAllocated,
    })
    .onConflictDoUpdate({
      target: [
        districtSeatAllocationsTable.districtAdminId,
        districtSeatAllocationsTable.schoolId,
      ],
      set: {
        seatsAllocated: body.data.seatsAllocated,
        updatedAt: new Date(),
      },
    })
    .returning();

  sendSuccess(res, {
    schoolId: params.data.schoolId,
    schoolName: school.name,
    seatsAllocated: row.seatsAllocated,
  });
});

export default router;
