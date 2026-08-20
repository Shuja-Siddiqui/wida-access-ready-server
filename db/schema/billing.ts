import { pgTable, text, uuid, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const BILLING_PLANS = ["solo", "organization"] as const;
export type BillingPlan = typeof BILLING_PLANS[number];

export const OWNER_TYPES = ["solo", "organization"] as const;
export type OwnerType = typeof OWNER_TYPES[number];

// Maps an app owner (a studentId for solo plans, a teacherId for organization
// plans -- same polymorphic pattern used elsewhere in billing) to a Stripe
// customer. This is the ONLY billing-related table we own: everything else
// (products, prices, subscriptions, payment methods, invoices) lives in
// Stripe and is queried live from the `stripe.*` schema synced by
// stripe-replit-sync. See the `stripe` skill for why we never duplicate
// Stripe data in our own tables.
export const ownerStripeCustomersTable = pgTable(
  "owner_stripe_customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull(),
    ownerType: text("owner_type").notNull(), // OwnerType
    stripeCustomerId: text("stripe_customer_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.ownerId, table.ownerType)],
);

export const insertOwnerStripeCustomerSchema = createInsertSchema(ownerStripeCustomersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertOwnerStripeCustomer = z.infer<typeof insertOwnerStripeCustomerSchema>;
export type OwnerStripeCustomer = typeof ownerStripeCustomersTable.$inferSelect;

// ── Subscription renewal queue ───────────────────────────────────────────────
// Populated daily by the populate-renewal-queue cron: one row per
// (subscription, billing period) for past_due subscriptions and subscriptions
// approaching cancel_at_period_end. Processed daily by the process-renewals
// cron which attempts a Stripe invoice payment and updates the status.

export const RENEWAL_QUEUE_STATUSES = ["pending", "attempted", "succeeded", "failed", "skipped"] as const;
export type RenewalQueueStatus = typeof RENEWAL_QUEUE_STATUSES[number];

export const subscriptionRenewalQueueTable = pgTable(
  "subscription_renewal_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: text("subscription_id").notNull(),
    ownerId: uuid("owner_id").notNull(),
    ownerType: text("owner_type").notNull(), // OwnerType
    renewalDue: timestamp("renewal_due", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("pending"), // RenewalQueueStatus
    attemptedAt: timestamp("attempted_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.subscriptionId, table.renewalDue)],
);

export type SubscriptionRenewalQueueRow = typeof subscriptionRenewalQueueTable.$inferSelect;
