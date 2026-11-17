/**
 * Grant a manual active org subscription (default 100 seats) on AWS for a district admin.
 * Writes stripe.* rows via _raw_data (generated columns) + owner_stripe_customers.
 *
 * Usage: node --env-file=.env scripts/grant-district-admin-subscription-aws.mjs <email> [seatCount]
 */
import crypto from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const email = process.argv[2]?.trim().toLowerCase();
const seatCount = Math.max(1, Number(process.argv[3] ?? 100));

if (!email) {
  console.error("Usage: node scripts/grant-district-admin-subscription-aws.mjs <email> [seatCount]");
  process.exit(1);
}

const client = new pg.Client({
  host: process.env.POSTGRES_HOST,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DATABASE ?? "postgres",
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const daResult = await client.query(
  `SELECT da.id AS district_admin_id, u.name, u.email
   FROM district_admins da
   JOIN users u ON u.id = da.user_id
   WHERE lower(u.email) = $1`,
  [email],
);
if (daResult.rows.length !== 1) {
  console.error("District admin not found for", email);
  process.exit(1);
}
const { district_admin_id: ownerId, name, email: userEmail } = daResult.rows[0];

const priceResult = await client.query(`
  SELECT pr.id AS price_id
  FROM stripe.products p
  JOIN stripe.prices pr ON pr.product = p.id
  WHERE p.metadata->>'planId' = 'organization'
  LIMIT 1
`);
if (!priceResult.rows.length) {
  console.error("No organization price in stripe.products/prices.");
  process.exit(1);
}
const { price_id: priceId } = priceResult.rows[0];

const templateSub = await client.query(
  `SELECT _raw_data, _account_id FROM stripe.subscriptions WHERE status = 'active' LIMIT 1`,
);
const templateItem = await client.query(
  `SELECT _raw_data FROM stripe.subscription_items LIMIT 1`,
);
if (!templateSub.rows.length || !templateItem.rows.length) {
  console.error("Need at least one synced Stripe subscription in DB as a template.");
  process.exit(1);
}

const accountId = templateSub.rows[0]._account_id;
const nowSec = Math.floor(Date.now() / 1000);
const periodEndSec = nowSec + 365 * 24 * 60 * 60;

const metadata = {
  planId: "organization",
  ownerId,
  ownerType: "organization",
  manualGrant: "true",
};

const existingOwner = await client.query(
  `SELECT stripe_customer_id FROM owner_stripe_customers WHERE owner_id = $1 AND owner_type = 'organization'`,
  [ownerId],
);

let customerId = existingOwner.rows[0]?.stripe_customer_id;

if (!customerId) {
  customerId = `cus_manual_${crypto.randomBytes(8).toString("hex")}`;
  const customerRaw = {
    id: customerId,
    object: "customer",
    email: userEmail,
    name: name ?? userEmail,
    created: nowSec,
    livemode: false,
    metadata: { ownerId, ownerType: "organization", manualGrant: "true" },
  };
  await client.query(`INSERT INTO stripe.customers (_raw_data, _account_id) VALUES ($1::jsonb, $2)`, [
    JSON.stringify(customerRaw),
    accountId,
  ]);
  await client.query(
    `INSERT INTO owner_stripe_customers (owner_id, owner_type, stripe_customer_id)
     VALUES ($1, 'organization', $2)
     ON CONFLICT (owner_id, owner_type) DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id`,
    [ownerId, customerId],
  );
}

const existingSub = await client.query(
  `SELECT id, status FROM stripe.subscriptions WHERE customer = $1 ORDER BY created DESC NULLS LAST LIMIT 1`,
  [customerId],
);

let subscriptionId = existingSub.rows[0]?.id;
let itemId;

if (existingSub.rows[0]?.status === "active") {
  subscriptionId = existingSub.rows[0].id;
  const itemRow = await client.query(
    `SELECT id FROM stripe.subscription_items WHERE subscription = $1 LIMIT 1`,
    [subscriptionId],
  );
  itemId = itemRow.rows[0]?.id;
} else {
  subscriptionId = `sub_manual_${crypto.randomBytes(8).toString("hex")}`;
  itemId = `si_manual_${crypto.randomBytes(8).toString("hex")}`;

  const subTemplate = structuredClone(templateSub.rows[0]._raw_data);
  subTemplate.id = subscriptionId;
  subTemplate.customer = customerId;
  subTemplate.status = "active";
  subTemplate.created = nowSec;
  subTemplate.start_date = nowSec;
  subTemplate.billing_cycle_anchor = nowSec;
  subTemplate.metadata = metadata;
  subTemplate.cancel_at_period_end = false;
  subTemplate.quantity = seatCount;

  if (subTemplate.items?.data?.[0]) {
    subTemplate.items.data[0].id = itemId;
    subTemplate.items.data[0].subscription = subscriptionId;
    subTemplate.items.data[0].quantity = seatCount;
    subTemplate.items.data[0].price = priceId;
    subTemplate.items.data[0].current_period_start = nowSec;
    subTemplate.items.data[0].current_period_end = periodEndSec;
  }

  await client.query(`INSERT INTO stripe.subscriptions (_raw_data, _account_id) VALUES ($1::jsonb, $2)`, [
    JSON.stringify(subTemplate),
    accountId,
  ]);

  const itemTemplate = structuredClone(templateItem.rows[0]._raw_data);
  itemTemplate.id = itemId;
  itemTemplate.subscription = subscriptionId;
  itemTemplate.quantity = seatCount;
  itemTemplate.price = priceId;
  itemTemplate.created = nowSec;
  itemTemplate.current_period_start = nowSec;
  itemTemplate.current_period_end = periodEndSec;

  await client.query(`INSERT INTO stripe.subscription_items (_raw_data, _account_id) VALUES ($1::jsonb, $2)`, [
    JSON.stringify(itemTemplate),
    accountId,
  ]);
}

if (existingSub.rows[0]?.status === "active" && itemId) {
  const itemRow = await client.query(`SELECT _raw_data FROM stripe.subscription_items WHERE id = $1`, [itemId]);
  if (itemRow.rows[0]) {
    const raw = structuredClone(itemRow.rows[0]._raw_data);
    raw.quantity = seatCount;
    raw.current_period_end = periodEndSec;
    raw.price = priceId;
    await client.query(`UPDATE stripe.subscription_items SET _raw_data = $1::jsonb WHERE id = $2`, [
      JSON.stringify(raw),
      itemId,
    ]);
  }
  const subRow = await client.query(`SELECT _raw_data FROM stripe.subscriptions WHERE id = $1`, [subscriptionId]);
  if (subRow.rows[0]) {
    const raw = structuredClone(subRow.rows[0]._raw_data);
    raw.metadata = metadata;
    raw.status = "active";
    raw.quantity = seatCount;
    if (raw.items?.data?.[0]) {
      raw.items.data[0].quantity = seatCount;
      raw.items.data[0].current_period_end = periodEndSec;
    }
    await client.query(`UPDATE stripe.subscriptions SET _raw_data = $1::jsonb WHERE id = $2`, [
      JSON.stringify(raw),
      subscriptionId,
    ]);
  }
}

const verify = await client.query(
  `
  SELECT s.status, si.quantity
  FROM stripe.subscriptions s
  LEFT JOIN stripe.subscription_items si ON si.subscription = s.id
  WHERE s.customer = $1 AND s.status = 'active'
  ORDER BY s.created DESC NULLS LAST
  LIMIT 1
`,
  [customerId],
);

console.log("Granted active organization subscription on AWS:");
console.log({
  email: userEmail,
  districtAdminId: ownerId,
  stripeCustomerId: customerId,
  subscriptionId,
  seatCount,
  verified: verify.rows[0],
});

await client.end();
