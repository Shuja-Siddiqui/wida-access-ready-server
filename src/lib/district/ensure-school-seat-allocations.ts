import { and, count, eq, or, sql } from "drizzle-orm";
import {
  db,
  districtSeatAllocationsTable,
  ownerStripeCustomersTable,
  profilesTable,
  schoolsTable,
  studentsTable,
} from "../../../db";

export async function getDistrictSeatsPurchased(districtAdminId: string): Promise<number> {
  const [customerRow] = await db
    .select({ stripeCustomerId: ownerStripeCustomersTable.stripeCustomerId })
    .from(ownerStripeCustomersTable)
    .where(
      and(
        eq(ownerStripeCustomersTable.ownerId, districtAdminId),
        eq(ownerStripeCustomersTable.ownerType, "organization"),
      ),
    )
    .limit(1);

  if (!customerRow?.stripeCustomerId) return 0;

  const subResult = await db.execute(sql`
    select si.quantity
    from "stripe"."subscriptions" s
    left join "stripe"."subscription_items" si on si.subscription = s.id
    where s.customer = ${customerRow.stripeCustomerId}
      and s.status = 'active'
    order by s.created desc
    limit 1
  `);
  return Number((subResult.rows as Record<string, unknown>[])[0]?.quantity ?? 0);
}

async function getTotalAllocatedSeats(districtAdminId: string): Promise<number> {
  const totalResult = await db.execute(sql`
    select coalesce(sum(seats_allocated), 0) as total_allocated
    from district_seat_allocations
    where district_admin_id = ${districtAdminId}
  `);
  return Number((totalResult.rows as Record<string, unknown>[])[0]?.total_allocated ?? 0);
}

export async function getSchoolSeatsEnrolled(schoolId: string): Promise<number> {
  const [countRow] = await db
    .select({ n: count(studentsTable.id) })
    .from(studentsTable)
    .leftJoin(profilesTable, eq(studentsTable.guardianId, profilesTable.id))
    .where(or(eq(studentsTable.schoolId, schoolId), eq(profilesTable.schoolId, schoolId)));
  return Number(countRow?.n ?? 0);
}

export type EnsureAllocationsResult =
  | { ok: true; adjusted: { schoolId: string; schoolName: string; seatsAllocated: number }[] }
  | { ok: false; error: string };

/**
 * Before district bulk import: bump each school's allocation so enrolled + incoming fit.
 * Uses unassigned purchased seats (district pool) when needed.
 */
export async function ensureSchoolSeatAllocationsForImport(
  districtAdminId: string,
  incomingBySchool: Map<string, number>,
): Promise<EnsureAllocationsResult> {
  if (incomingBySchool.size === 0) {
    return { ok: false, error: "Select a school or set School ID on rows so seats can be assigned." };
  }

  const seatsPurchased = await getDistrictSeatsPurchased(districtAdminId);
  if (seatsPurchased <= 0) {
    return {
      ok: false,
      error: "Your district does not have an active seat plan. Purchase seats before importing students.",
    };
  }

  let currentTotal = await getTotalAllocatedSeats(districtAdminId);
  const adjusted: { schoolId: string; schoolName: string; seatsAllocated: number }[] = [];

  for (const [schoolId, incoming] of incomingBySchool) {
    if (incoming <= 0) continue;

    const [school] = await db
      .select({ name: schoolsTable.name })
      .from(schoolsTable)
      .where(eq(schoolsTable.id, schoolId))
      .limit(1);
    const schoolName = school?.name ?? "School";

    const [existing] = await db
      .select({ seatsAllocated: districtSeatAllocationsTable.seatsAllocated })
      .from(districtSeatAllocationsTable)
      .where(
        and(
          eq(districtSeatAllocationsTable.districtAdminId, districtAdminId),
          eq(districtSeatAllocationsTable.schoolId, schoolId),
        ),
      )
      .limit(1);

    const currentForSchool = existing?.seatsAllocated ?? 0;
    const enrolled = await getSchoolSeatsEnrolled(schoolId);
    const target = Math.max(currentForSchool, enrolled + incoming);
    const delta = target - currentForSchool;

    if (delta <= 0) continue;

    const newTotal = currentTotal + delta;
    if (newTotal > seatsPurchased) {
      const availableInPool = seatsPurchased - currentTotal;
      return {
        ok: false,
        error:
          `Not enough purchased seats for this import. ${schoolName} needs ${target} seat${target !== 1 ? "s" : ""} assigned (${enrolled} enrolled + ${incoming} in file), but only ${availableInPool} seat${availableInPool !== 1 ? "s" : ""} remain in your district pool. Assign seats manually or purchase more.`,
      };
    }

    const [row] = await db
      .insert(districtSeatAllocationsTable)
      .values({
        districtAdminId,
        schoolId,
        seatsAllocated: target,
      })
      .onConflictDoUpdate({
        target: [
          districtSeatAllocationsTable.districtAdminId,
          districtSeatAllocationsTable.schoolId,
        ],
        set: {
          seatsAllocated: target,
          updatedAt: new Date(),
        },
      })
      .returning({ seatsAllocated: districtSeatAllocationsTable.seatsAllocated });

    currentTotal = newTotal;
    adjusted.push({
      schoolId,
      schoolName,
      seatsAllocated: row.seatsAllocated,
    });
  }

  return { ok: true, adjusted };
}
