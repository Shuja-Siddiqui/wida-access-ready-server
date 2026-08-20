import { schedule } from "node-cron";
import { eq, lte, sql, and } from "drizzle-orm";
import { db, subscriptionRenewalQueueTable, ownerStripeCustomersTable } from "../../db";
import { getUncachableStripeClient } from "./stripeClient";
import { logger } from "../config/logger";

// ── Populate renewal queue ────────────────────────────────────────────────────
// Runs daily at 00:05. Scans Stripe for:
//   1. Subscriptions that are `past_due` (missed automatic payment — need retry)
//   2. Subscriptions with `cancel_at_period_end = true` whose period ends within
//      3 days (proactive notice / last-chance charge attempt)
// For each, upserts a row into subscription_renewal_queue so the process cron
// can pick it up. Uses ON CONFLICT DO NOTHING so re-runs are idempotent.

async function populateRenewalQueue(): Promise<void> {
  logger.info("renewal-cron: starting populate-renewal-queue");

  const result = await db.execute(sql`
    select
      s.id        as subscription_id,
      s.status    as status,
      s.cancel_at_period_end as cancel_at_period_end,
      s.customer  as stripe_customer_id,
      si.current_period_end as current_period_end,
      osc.owner_id   as owner_id,
      osc.owner_type as owner_type
    from stripe.subscriptions s
    left join stripe.subscription_items si on si.subscription = s.id
    join owner_stripe_customers osc on osc.stripe_customer_id = s.customer
    where
      s.status = 'past_due'
      or (
        s.status = 'active'
        and s.cancel_at_period_end = true
        and si.current_period_end is not null
        and si.current_period_end <= extract(epoch from now() + interval '3 days')
      )
  `);

  const rows = result.rows as Array<{
    subscription_id: string;
    status: string;
    cancel_at_period_end: boolean;
    stripe_customer_id: string;
    current_period_end: string | null;
    owner_id: string;
    owner_type: string;
  }>;

  let inserted = 0;
  for (const row of rows) {
    const renewalDue = row.current_period_end
      ? new Date(Number(row.current_period_end) * 1000)
      : new Date(); // past_due: treat as due now

    try {
      await db
        .insert(subscriptionRenewalQueueTable)
        .values({
          subscriptionId: row.subscription_id,
          ownerId: row.owner_id,
          ownerType: row.owner_type,
          renewalDue,
          status: "pending",
        })
        .onConflictDoNothing();
      inserted++;
    } catch (err) {
      logger.warn({ err, subscriptionId: row.subscription_id }, "renewal-cron: failed to upsert queue row");
    }
  }

  logger.info({ found: rows.length, inserted }, "renewal-cron: populate-renewal-queue complete");
}

// ── Process renewal queue ─────────────────────────────────────────────────────
// Runs daily at 06:00, after the populate cron has filled the queue.
// For each pending row whose renewalDue is now or in the past:
//   1. Re-fetch the live subscription from Stripe
//   2. If it's already active/renewed — mark skipped (Stripe auto-renewed it)
//   3. Otherwise retrieve the latest open invoice and pay it with the customer's
//      default payment method (or any attached card)

async function processRenewalQueue(): Promise<void> {
  logger.info("renewal-cron: starting process-renewals");

  const pendingRows = await db
    .select()
    .from(subscriptionRenewalQueueTable)
    .where(
      and(
        eq(subscriptionRenewalQueueTable.status, "pending"),
        lte(subscriptionRenewalQueueTable.renewalDue, new Date()),
      ),
    );

  if (pendingRows.length === 0) {
    logger.info("renewal-cron: no pending renewals");
    return;
  }

  const stripe = await getUncachableStripeClient();
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of pendingRows) {
    const now = new Date();
    try {
      const subscription = await stripe.subscriptions.retrieve(row.subscriptionId, {
        expand: ["latest_invoice", "default_payment_method", "customer"],
      });

      // If Stripe already renewed it (period advanced / status is active) — skip
      const siResult = await db.execute(sql`
        select current_period_end from stripe.subscription_items
        where subscription = ${row.subscriptionId}
        limit 1
      `);
      const currentPeriodEnd = (siResult.rows[0] as { current_period_end: number } | undefined)
        ?.current_period_end;
      const renewedAt = currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null;

      if (subscription.status === "active" && renewedAt && renewedAt > row.renewalDue) {
        await db
          .update(subscriptionRenewalQueueTable)
          .set({ status: "skipped", attemptedAt: now, updatedAt: now })
          .where(eq(subscriptionRenewalQueueTable.id, row.id));
        skipped++;
        continue;
      }

      // Resolve the default payment method to use
      let paymentMethodId: string | undefined;
      if (
        subscription.default_payment_method &&
        typeof subscription.default_payment_method === "object"
      ) {
        paymentMethodId = subscription.default_payment_method.id;
      } else if (typeof subscription.default_payment_method === "string") {
        paymentMethodId = subscription.default_payment_method;
      } else {
        // Fall back to the customer's default
        const customer =
          typeof subscription.customer === "object" && subscription.customer !== null
            ? subscription.customer
            : await stripe.customers.retrieve(
                typeof subscription.customer === "string" ? subscription.customer : "",
              );
        if (!("deleted" in customer) && customer.invoice_settings?.default_payment_method) {
          paymentMethodId =
            typeof customer.invoice_settings.default_payment_method === "string"
              ? customer.invoice_settings.default_payment_method
              : customer.invoice_settings.default_payment_method.id;
        }
      }

      if (!paymentMethodId) {
        throw new Error("No saved payment method on file for this customer");
      }

      // Get the latest open/past_due invoice and pay it
      const invoiceId =
        typeof subscription.latest_invoice === "string"
          ? subscription.latest_invoice
          : subscription.latest_invoice?.id;

      if (!invoiceId) {
        throw new Error("No invoice found for subscription");
      }

      const invoice = await stripe.invoices.retrieve(invoiceId);

      if (invoice.status === "paid") {
        await db
          .update(subscriptionRenewalQueueTable)
          .set({ status: "skipped", attemptedAt: now, updatedAt: now })
          .where(eq(subscriptionRenewalQueueTable.id, row.id));
        skipped++;
        continue;
      }

      await stripe.invoices.pay(invoiceId, {
        payment_method: paymentMethodId,
        off_session: true,
      });

      await db
        .update(subscriptionRenewalQueueTable)
        .set({ status: "succeeded", attemptedAt: now, updatedAt: now })
        .where(eq(subscriptionRenewalQueueTable.id, row.id));
      succeeded++;
      logger.info({ subscriptionId: row.subscriptionId }, "renewal-cron: payment succeeded");
    } catch (err) {
      const failureReason = err instanceof Error ? err.message : String(err);
      await db
        .update(subscriptionRenewalQueueTable)
        .set({ status: "failed", attemptedAt: now, failureReason, updatedAt: now })
        .where(eq(subscriptionRenewalQueueTable.id, row.id));
      failed++;
      logger.error({ err, subscriptionId: row.subscriptionId }, "renewal-cron: payment failed");
    }
  }

  logger.info({ total: pendingRows.length, succeeded, failed, skipped }, "renewal-cron: process-renewals complete");
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
// Export a single function that starts both cron tasks. Called once from
// index.ts after the server is listening.

export function startRenewalCrons(): void {
  // Populate queue: every day at 00:05 (5 minutes after midnight)
  schedule("5 0 * * *", () => {
    populateRenewalQueue().catch((err) =>
      logger.error({ err }, "renewal-cron: unhandled error in populate-renewal-queue"),
    );
  });

  // Process queue: every day at 06:00
  schedule("0 6 * * *", () => {
    processRenewalQueue().catch((err) =>
      logger.error({ err }, "renewal-cron: unhandled error in process-renewals"),
    );
  });

  logger.info("renewal-cron: scheduled (populate at 00:05, process at 06:00 daily)");
}
