import type Stripe from "stripe";
import { eq, and, sql } from "drizzle-orm";
import { db, ownerStripeCustomersTable, studentsTable, profilesTable, usersTable } from "../../db";
import { sendHtmlEmail } from "./mailer";
import { billingConfirmationEmail } from "./email-templates";
import { config } from "../config/index";
import { logger } from "../config/logger";

type OwnerType = "solo" | "organization";

function formatCentsDisplay(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

function formatPeriodDisplay(unit: string): string {
  return `/ ${unit.replace(/^per\s+/i, "").replace(/\//g, " / ")}`;
}

async function resolveOwner(
  stripeCustomerId: string,
): Promise<{ email: string; name: string; ownerId: string; ownerType: OwnerType } | undefined> {
  const [mapping] = await db
    .select({ ownerId: ownerStripeCustomersTable.ownerId, ownerType: ownerStripeCustomersTable.ownerType })
    .from(ownerStripeCustomersTable)
    .where(eq(ownerStripeCustomersTable.stripeCustomerId, stripeCustomerId))
    .limit(1);
  if (!mapping) return undefined;

  const ownerType = mapping.ownerType as OwnerType;

  if (ownerType === "solo") {
    const [row] = await db
      .select({ email: usersTable.email, name: studentsTable.name })
      .from(studentsTable)
      .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
      .where(eq(studentsTable.id, mapping.ownerId))
      .limit(1);
    if (!row) return undefined;
    return { email: row.email, name: row.name ?? row.email, ownerId: mapping.ownerId, ownerType };
  }

  const [row] = await db
    .select({ email: usersTable.email })
    .from(profilesTable)
    .innerJoin(usersTable, eq(profilesTable.userId, usersTable.id))
    .where(eq(profilesTable.id, mapping.ownerId))
    .limit(1);
  if (!row) return undefined;
  return { email: row.email, name: row.email, ownerId: mapping.ownerId, ownerType };
}

async function resolvePlanName(priceId: string | undefined): Promise<string | undefined> {
  if (!priceId) return undefined;
  const result = await db.execute(sql`
    select p.name as name
    from "stripe"."prices" pr
    join "stripe"."products" p on p.id = pr.product
    where pr.id = ${priceId}
    limit 1
  `);
  const row = (result.rows as Record<string, unknown>[])[0];
  return row?.name as string | undefined;
}

/**
 * Sends a branded payment receipt email when a Stripe invoice is paid
 * (covers both the first subscription payment and every renewal). Called
 * from the webhook handler after `stripe.processWebhook` has synced the
 * event -- this only *reads* data that's already in the `stripe.*` mirror
 * plus our own owner mapping, it never talks to the Stripe API directly.
 *
 * Non-fatal on failure, matching the pattern used for verification emails:
 * a delivery problem should never fail the webhook or block the
 * subscription from activating.
 */
export async function sendBillingReceiptEmail(event: Stripe.Event): Promise<void> {
  if (event.type !== "invoice.payment_succeeded") return;

  try {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
    if (!customerId) return;

    const owner = await resolveOwner(customerId);
    if (!owner) {
      logger.warn({ customerId }, "Billing receipt: no owner mapped for Stripe customer, skipping email");
      return;
    }

    const line = invoice.lines?.data?.[0];
    const priceRef = line?.pricing?.price_details?.price;
    const priceId = typeof priceRef === "string" ? priceRef : priceRef?.id;
    const planName = (await resolvePlanName(priceId)) ?? line?.description ?? "ACCESS Ready subscription";

    const amountDisplay = formatCentsDisplay(invoice.amount_paid, invoice.currency);
    const periodDisplay = formatPeriodDisplay("month");
    const nextBillingEnd = line?.period?.end;
    const nextBillingDateDisplay = nextBillingEnd
      ? new Date(nextBillingEnd * 1000).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;

    const billingUrl = `${config.appUrl || ""}/billing`;

    await sendHtmlEmail({
      to: owner.email,
      subject: "Your ACCESS Ready payment receipt",
      html: billingConfirmationEmail({
        planName,
        amountDisplay,
        periodDisplay,
        nextBillingDateDisplay,
        billingUrl,
      }),
    });
  } catch (err) {
    // Non-fatal -- the payment and subscription are already recorded via the
    // Stripe sync; a missed receipt email should never fail the webhook.
    logger.error({ err }, "Failed to send billing receipt email");
  }
}
