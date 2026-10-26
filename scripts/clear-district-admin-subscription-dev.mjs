/**
 * Remove org subscription + seat allocations for a district admin (dev retest purchase).
 * Usage: node scripts/clear-district-admin-subscription-dev.mjs [email]
 */
import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const email = (process.argv[2] ?? "dadmin@gmail.com").trim().toLowerCase();
const conn = process.env.DATABASE_URL ?? process.env.LOCAL_DATABASE_URL;
if (!conn) {
  console.error("DATABASE_URL or LOCAL_DATABASE_URL required");
  process.exit(1);
}

const client = new pg.Client({ connectionString: conn });
await client.connect();

try {
  const da = await client.query(
    `SELECT da.id AS district_admin_id, u.email
     FROM district_admins da
     JOIN users u ON u.id = da.user_id
     WHERE lower(u.email) = $1`,
    [email],
  );
  if (da.rows.length !== 1) {
    console.error("District admin not found:", email);
    process.exit(1);
  }
  const { district_admin_id: adminId } = da.rows[0];

  const owner = await client.query(
    `SELECT stripe_customer_id FROM owner_stripe_customers
     WHERE owner_id = $1 AND owner_type = 'organization'`,
    [adminId],
  );
  const customerId = owner.rows[0]?.stripe_customer_id;

  await client.query("BEGIN");

  const alloc = await client.query(
    `DELETE FROM district_seat_allocations WHERE district_admin_id = $1`,
    [adminId],
  );

  const ownerDel = await client.query(
    `DELETE FROM owner_stripe_customers WHERE owner_id = $1 AND owner_type = 'organization'`,
    [adminId],
  );

  let subIds = [];
  if (customerId) {
    const subs = await client.query(
      `SELECT id FROM stripe.subscriptions WHERE customer = $1`,
      [customerId],
    );
    subIds = subs.rows.map((r) => r.id);

    if (subIds.length) {
      await client.query(`DELETE FROM stripe.subscription_items WHERE subscription = ANY($1::text[])`, [
        subIds,
      ]);
      await client.query(`DELETE FROM stripe.subscriptions WHERE id = ANY($1::text[])`, [subIds]);
    }

    await client.query(`DELETE FROM stripe.customers WHERE id = $1`, [customerId]);
  }

  await client.query("COMMIT");

  console.log("Cleared subscription data for district admin:", email);
  console.log({
    districtAdminId: adminId,
    stripeCustomerId: customerId ?? null,
    seatAllocationsRemoved: alloc.rowCount,
    ownerStripeRowsRemoved: ownerDel.rowCount,
    subscriptionsRemoved: subIds.length,
  });
} catch (e) {
  await client.query("ROLLBACK");
  console.error(e);
  process.exit(1);
} finally {
  await client.end();
}
