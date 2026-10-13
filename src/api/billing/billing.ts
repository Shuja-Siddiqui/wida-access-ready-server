import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import {
  db,
  ownerStripeCustomersTable,
  studentsTable,
  profilesTable,
  districtAdminsTable,
  usersTable,
  subscriptionRenewalQueueTable,
  billingConfigTable,
} from "../../../db";
import {
  GetSubscriptionQueryParams,
  CreateCheckoutSessionBody as CheckoutBody,
  CreateBillingPortalSessionBody as PortalBody,
  GetBillingAdminSummaryParams,
  ListPaymentMethodsQueryParams,
  CheckoutWithSavedCardBody as SavedCardBody,
} from "../../generated";
import { sendError, sendSuccess } from "../../lib/http/api-response";
import { requireAuth, requireOwnerAccess, requireTeacherAccess } from "../../middlewares/auth";
import { getUncachableStripeClient, getStripePublishableKey } from "../../lib/billing/stripeClient";
import { getRequestOrigin } from "../../lib/http/request-origin";

const router: IRouter = Router();

type OwnerType = "solo" | "organization";
type PlanId = "solo" | "organization";

// ── Display-string formatting (server-only) ─────────────────────────────
// All price/period rendering must happen here, never on the client. The
// frontend renders `displayPrice`/`displayPeriod`/etc. as opaque strings —
// it must never divide priceCents by 100, multiply by seatCount, or run
// Intl.NumberFormat itself. See Task #14 review notes.
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

interface PlanRow {
  planId: PlanId;
  stripeProductId: string;
  stripePriceId: string;
  name: string;
  priceCents: number;
  currency: string;
  unit: string;
  displayPrice: string;
  displayPeriod: string;
}

// ── Config-table fallback ───────────────────────────────────────────────────
// When Stripe is not connected (no stripe schema / no synced rows) we fall
// back to billing_config, which the super-admin can update via PATCH /admin/pricing.
async function getConfigPlans(): Promise<PlanRow[]> {
  const rows = await db.select().from(billingConfigTable);
  return rows.map((row) => {
    const planId = row.planId as PlanId;
    const unit = planId === "organization" ? "seat/month" : "month";
    return {
      planId,
      stripeProductId: "",
      stripePriceId: "",
      name: row.name,
      priceCents: row.priceCents,
      currency: row.currency,
      unit,
      displayPrice: formatCentsDisplay(row.priceCents, row.currency),
      displayPeriod: formatPeriodDisplay(unit),
    };
  });
}

// ── Live plan lookup — queried straight from stripe.products/stripe.prices,
// never duplicated into our own tables (see the `stripe` skill). Products are
// tagged with metadata.planId ("solo" | "organization") by the seed script.
// Falls back to billing_config when Stripe is not connected.
async function getPlans(): Promise<PlanRow[]> {
  try {
    const result = await db.execute(sql`
      select
        p.metadata->>'planId' as plan_id,
        p.id as product_id,
        p.name as name,
        pr.id as price_id,
        pr.unit_amount as unit_amount,
        pr.currency as currency,
        pr.recurring->>'interval' as interval
      from "stripe"."products" p
      join "stripe"."prices" pr on pr.product = p.id
      where p.active = true
        and pr.active = true
        and p.metadata->>'planId' in ('solo', 'organization')
      order by plan_id
    `);

    const stripePlans = (result.rows as Record<string, unknown>[]).map((row) => {
      const planId = row.plan_id as PlanId;
      const priceCents = Number(row.unit_amount ?? 0);
      const currency = (row.currency as string) ?? "usd";
      const unit = planId === "organization" ? "seat/month" : (row.interval as string) ?? "month";
      return {
        planId,
        stripeProductId: row.product_id as string,
        stripePriceId: row.price_id as string,
        name: row.name as string,
        priceCents,
        currency,
        unit,
        displayPrice: formatCentsDisplay(priceCents, currency),
        displayPeriod: formatPeriodDisplay(unit),
      };
    });

    // If Stripe returned plans, use them; otherwise fall back to billing_config.
    if (stripePlans.length > 0) return stripePlans;
  } catch {
    // Stripe schema not present — fall through to config fallback.
  }

  return getConfigPlans();
}

async function getPlanByPlanId(planId: PlanId): Promise<PlanRow | undefined> {
  const plans = await getPlans();
  return plans.find((plan) => plan.planId === planId);
}

async function getOwnerStripeCustomerId(ownerId: string, ownerType: OwnerType): Promise<string | undefined> {
  const [row] = await db
    .select({ stripeCustomerId: ownerStripeCustomersTable.stripeCustomerId })
    .from(ownerStripeCustomersTable)
    .where(
      and(
        eq(ownerStripeCustomersTable.ownerId, ownerId),
        eq(ownerStripeCustomersTable.ownerType, ownerType),
      ),
    )
    .limit(1);
  return row?.stripeCustomerId;
}

async function resolveOwnerIdentity(
  ownerId: string,
  ownerType: OwnerType,
): Promise<{ email: string; name: string } | undefined> {
  if (ownerType === "solo") {
    const [row] = await db
      .select({ email: usersTable.email, name: studentsTable.name })
      .from(studentsTable)
      .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
      .where(eq(studentsTable.id, ownerId))
      .limit(1);
    if (!row) return undefined;
    return { email: row.email, name: row.name ?? row.email };
  }

  // Try guardians first (teachers, principals, parents)
  const [guardianRow] = await db
    .select({ email: usersTable.email, name: usersTable.name })
    .from(profilesTable)
    .innerJoin(usersTable, eq(profilesTable.userId, usersTable.id))
    .where(eq(profilesTable.id, ownerId))
    .limit(1);
  if (guardianRow) return { email: guardianRow.email, name: guardianRow.name ?? guardianRow.email };

  // Fall back to district admins
  const [daRow] = await db
    .select({ email: usersTable.email, name: usersTable.name })
    .from(districtAdminsTable)
    .innerJoin(usersTable, eq(districtAdminsTable.userId, usersTable.id))
    .where(eq(districtAdminsTable.id, ownerId))
    .limit(1);
  if (daRow) return { email: daRow.email, name: daRow.name ?? daRow.email };

  return undefined;
}

async function findOrCreateStripeCustomer(ownerId: string, ownerType: OwnerType): Promise<string> {
  const existing = await getOwnerStripeCustomerId(ownerId, ownerType);
  if (existing) return existing;

  const identity = await resolveOwnerIdentity(ownerId, ownerType);
  if (!identity) {
    throw new Error("Owner not found");
  }

  const stripe = await getUncachableStripeClient();
  const customer = await stripe.customers.create({
    email: identity.email,
    name: identity.name,
    metadata: { ownerId, ownerType },
  });

  await db
    .insert(ownerStripeCustomersTable)
    .values({ ownerId, ownerType, stripeCustomerId: customer.id })
    .onConflictDoNothing();

  return customer.id;
}

interface SubscriptionRow {
  id: string;
  ownerId: string;
  ownerType: OwnerType;
  planId: PlanId;
  status: string;
  seatCount: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

async function getOwnerSubscription(ownerId: string, ownerType: OwnerType): Promise<SubscriptionRow | undefined> {
  const stripeCustomerId = await getOwnerStripeCustomerId(ownerId, ownerType);
  if (!stripeCustomerId) return undefined;

  // `current_period_end` no longer lives on the top-level subscription row in
  // this Stripe API version — it moved to each subscription item — so it's
  // read from `si.current_period_end`, not `s.current_period_end` (see the
  // `stripe` skill note on line-item pricing shape drift).
  const result = await db.execute(sql`
    select
      s.id as id,
      s.status as status,
      s.cancel_at_period_end as cancel_at_period_end,
      si.current_period_end as current_period_end,
      s.created as created,
      si.quantity as quantity,
      p.metadata->>'planId' as plan_id
    from "stripe"."subscriptions" s
    left join "stripe"."subscription_items" si on si.subscription = s.id
    left join "stripe"."prices" pr on pr.id = si.price
    left join "stripe"."products" p on p.id = pr.product
    where s.customer = ${stripeCustomerId}
    order by s.created desc
    limit 1
  `);

  const row = (result.rows as Record<string, unknown>[])[0];
  if (!row) return undefined;

  return {
    id: row.id as string,
    ownerId,
    ownerType,
    planId: (row.plan_id as PlanId) ?? ownerType,
    status: row.status as string,
    seatCount: Number(row.quantity ?? 1),
    currentPeriodEnd: row.current_period_end ? new Date(Number(row.current_period_end) * 1000).toISOString() : null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    createdAt: new Date(Number(row.created) * 1000).toISOString(),
  };
}

// ── Plans ────────────────────────────────────────────────────────────────
router.get("/billing/plans", async (_req, res): Promise<void> => {
  const plans = await getPlans();
  sendSuccess(res, plans);
});

// ── Subscription lookup ─────────────────────────────────────────────────
router.get(
  "/billing/subscription",
  requireAuth,
  requireOwnerAccess((req) => req.query.ownerId as string | undefined),
  async (req, res): Promise<void> => {
    const parsed = GetSubscriptionQueryParams.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, parsed.error.message);
      return;
    }

    const subscription = await getOwnerSubscription(parsed.data.ownerId, parsed.data.ownerType as OwnerType);
    if (!subscription) {
      sendError(res, 404, "No subscription found");
      return;
    }

    sendSuccess(res, subscription);
  },
);

// ── Checkout: create a real Stripe Checkout Session; client redirects ──
router.post(
  "/billing/checkout",
  requireAuth,
  requireOwnerAccess((req) => (req.body as { ownerId?: string } | undefined)?.ownerId),
  async (req, res): Promise<void> => {
    const parsed = CheckoutBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, parsed.error.message);
      return;
    }
    const { ownerId, ownerType, planId, seatCount } = parsed.data;

    const plan = await getPlanByPlanId(planId as PlanId);
    if (!plan) {
      sendError(res, 400, "This plan is not configured in Stripe yet");
      return;
    }

    let stripeCustomerId: string;
    try {
      stripeCustomerId = await findOrCreateStripeCustomer(ownerId, ownerType as OwnerType);
    } catch {
      sendError(res, 404, "Owner not found");
      return;
    }

    const stripe = await getUncachableStripeClient();
    const origin = getRequestOrigin(req);
    const quantity = planId === "organization" ? Math.max(1, seatCount ?? 1) : 1;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: plan.stripePriceId, quantity }],
      success_url: `${origin}/billing?checkout=success`,
      cancel_url: `${origin}/billing?checkout=cancel`,
      metadata: { ownerId, ownerType, planId },
      subscription_data: { metadata: { ownerId, ownerType, planId } },
    });

    if (!session.url) {
      sendError(res, 500, "Failed to create checkout session");
      return;
    }

    sendSuccess(res, { url: session.url });
  },
);

// ── Public Stripe config: publishable key only, needed to mount an embedded
// (in-app) payment form via Stripe.js. Never expose the secret key here.
// Returns { publishableKey: null } when Stripe is not connected so the client
// can degrade gracefully (hide the new-card Elements form) instead of crashing.
router.get("/billing/config", async (_req, res): Promise<void> => {
  try {
    const publishableKey = await getStripePublishableKey();
    sendSuccess(res, { publishableKey });
  } catch {
    sendSuccess(res, { publishableKey: null });
  }
});

// ── Checkout intent: create an incomplete subscription + PaymentIntent so
// the client can confirm payment in-app with an embedded Stripe Elements
// form, instead of redirecting to Stripe-hosted Checkout. ──────────────
router.post(
  "/billing/checkout-intent",
  requireAuth,
  requireOwnerAccess((req) => (req.body as { ownerId?: string } | undefined)?.ownerId),
  async (req, res): Promise<void> => {
    const parsed = CheckoutBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, parsed.error.message);
      return;
    }
    const { ownerId, ownerType, planId, seatCount } = parsed.data;

    const plan = await getPlanByPlanId(planId as PlanId);
    if (!plan) {
      sendError(res, 400, "This plan is not configured yet");
      return;
    }

    // Verify Stripe is reachable before touching customer / subscription records.
    let stripe: Awaited<ReturnType<typeof getUncachableStripeClient>>;
    try {
      stripe = await getUncachableStripeClient();
    } catch {
      sendError(res, 503, "Payment processing is not configured. Please contact support.");
      return;
    }

    let stripeCustomerId: string;
    try {
      stripeCustomerId = await findOrCreateStripeCustomer(ownerId, ownerType as OwnerType);
    } catch {
      sendError(res, 404, "Owner not found");
      return;
    }

    const quantity = planId === "organization" ? Math.max(1, seatCount ?? 1) : 1;

    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: plan.stripePriceId, quantity }],
      payment_behavior: "default_incomplete",
      // Card only -- this app is US-only and only accepts card payments, so
      // we must not let Stripe's automatic payment methods surface Cash App
      // Pay, Link, bank debits, or other currency/region-specific methods.
      payment_settings: {
        save_default_payment_method: "on_subscription",
        payment_method_types: ["card"],
      },
      metadata: { ownerId, ownerType, planId },
    });

    const invoiceId =
      typeof subscription.latest_invoice === "string"
        ? subscription.latest_invoice
        : subscription.latest_invoice?.id;

    if (!invoiceId) {
      sendError(res, 500, "Failed to create an invoice for this subscription");
      return;
    }

    // As of the Stripe API version used by this account, `payment_intent` is
    // no longer embedded on the invoice itself -- it moved to
    // `invoice.payments`, a list of `InvoicePayment` records each pointing at
    // the underlying PaymentIntent. Expanding `latest_invoice.payment_intent`
    // on the subscription create call (the old pattern) silently returns
    // nothing in this version, so we look it up via `payments` instead.
    const invoiceWithPayments = await stripe.invoices.retrieve(invoiceId, {
      expand: ["payments"],
    });
    const paymentIntentId = invoiceWithPayments.payments?.data.find(
      (invoicePayment) => invoicePayment.payment.type === "payment_intent",
    )?.payment.payment_intent;

    const clientSecret =
      typeof paymentIntentId === "string"
        ? (await stripe.paymentIntents.retrieve(paymentIntentId)).client_secret
        : paymentIntentId?.client_secret;

    if (!clientSecret) {
      sendError(res, 500, "Failed to create a payment intent for this subscription");
      return;
    }

    sendSuccess(res, { clientSecret, subscriptionId: subscription.id });
  },
);

// ── Billing portal: manage payment methods / cancel via Stripe-hosted UI ─
router.post(
  "/billing/portal",
  requireAuth,
  requireOwnerAccess((req) => (req.body as { ownerId?: string } | undefined)?.ownerId),
  async (req, res): Promise<void> => {
    const parsed = PortalBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, parsed.error.message);
      return;
    }
    const { ownerId, ownerType } = parsed.data;

    const stripeCustomerId = await getOwnerStripeCustomerId(ownerId, ownerType as OwnerType);
    if (!stripeCustomerId) {
      sendError(res, 404, "No Stripe customer found for this owner");
      return;
    }

    const stripe = await getUncachableStripeClient();
    const origin = getRequestOrigin(req);

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${origin}/billing`,
    });

    sendSuccess(res, { url: session.url });
  },
);

// ── Admin summary: seats + estimated monthly cost for a teacher's roster ─
// `seatCount` query param lets the client preview the cost for a not-yet-
// submitted seat count (e.g. while the teacher is still typing it into the
// checkout form) without doing any price math client-side — the multiplication
// and formatting both happen here, and the frontend just renders the
// resulting `display*` strings verbatim.
router.get("/billing/admin/summary/:teacherId", requireAuth, requireTeacherAccess("teacherId"), async (req, res): Promise<void> => {
  const params = GetBillingAdminSummaryParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, params.error.message);
    return;
  }

  const students = await db
    .select({ id: studentsTable.id })
    .from(studentsTable)
    .where(eq(studentsTable.guardianId, params.data.teacherId));

  const actualSeatCount = students.length;
  const requestedSeatCount = Number(req.query.seatCount);
  const seatCountForEstimate =
    Number.isInteger(requestedSeatCount) && requestedSeatCount > 0 ? requestedSeatCount : actualSeatCount;

  const plan = await getPlanByPlanId("organization");
  const pricePerSeatCents = plan?.priceCents ?? 0;
  const currency = plan?.currency ?? "usd";
  const estimatedMonthlyCostCents = seatCountForEstimate * pricePerSeatCents;

  const subscription = await getOwnerSubscription(params.data.teacherId, "organization");

  sendSuccess(res, {
    teacherId: params.data.teacherId,
    seatCount: actualSeatCount,
    pricePerSeatCents,
    estimatedMonthlyCostCents,
    currency,
    displayPricePerSeat: `${formatCentsDisplay(pricePerSeatCents, currency)} ${formatPeriodDisplay("seat/month")}`,
    displayEstimatedMonthlyCost: `${formatCentsDisplay(estimatedMonthlyCostCents, currency)} ${formatPeriodDisplay("month")}`,
    subscription: subscription ?? undefined,
  });
});

// ── Saved payment methods ─────────────────────────────────────────────────────
// Returns the cards stored against this owner's Stripe customer so the
// checkout UI can offer "use a saved card" instead of re-entering details.
router.get(
  "/billing/payment-methods",
  requireAuth,
  requireOwnerAccess((req) => req.query.ownerId as string | undefined),
  async (req, res): Promise<void> => {
    const parsed = ListPaymentMethodsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, parsed.error.message);
      return;
    }

    const stripeCustomerId = await getOwnerStripeCustomerId(
      parsed.data.ownerId,
      parsed.data.ownerType as OwnerType,
    );

    if (!stripeCustomerId) {
      // No Stripe customer yet → no saved cards, not an error
      sendSuccess(res, { paymentMethods: [] });
      return;
    }

    const stripe = await getUncachableStripeClient();

    // Fetch the customer to resolve their default payment method id
    const customer = await stripe.customers.retrieve(stripeCustomerId);
    const defaultPmId =
      !("deleted" in customer) && customer.invoice_settings?.default_payment_method
        ? typeof customer.invoice_settings.default_payment_method === "string"
          ? customer.invoice_settings.default_payment_method
          : customer.invoice_settings.default_payment_method.id
        : null;

    const pmList = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: "card",
      limit: 10,
    });

    const paymentMethods = pmList.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand ?? "unknown",
      last4: pm.card?.last4 ?? "••••",
      expMonth: pm.card?.exp_month ?? 0,
      expYear: pm.card?.exp_year ?? 0,
      isDefault: pm.id === defaultPmId,
    }));

    sendSuccess(res, { paymentMethods });
  },
);

// ── Checkout with saved card ──────────────────────────────────────────────────
// Creates a new Stripe subscription and immediately confirms payment using a
// previously-saved PaymentMethod — no Elements form needed on the client.
router.post(
  "/billing/checkout-with-saved-card",
  requireAuth,
  requireOwnerAccess((req) => (req.body as { ownerId?: string } | undefined)?.ownerId),
  async (req, res): Promise<void> => {
    const parsed = SavedCardBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, parsed.error.message);
      return;
    }
    const { ownerId, ownerType, planId, seatCount, paymentMethodId } = parsed.data;

    const plan = await getPlanByPlanId(planId as PlanId);
    if (!plan) {
      sendError(res, 400, "This plan is not configured yet");
      return;
    }

    // Verify Stripe is reachable before touching customer / subscription records.
    let stripe: Awaited<ReturnType<typeof getUncachableStripeClient>>;
    try {
      stripe = await getUncachableStripeClient();
    } catch {
      sendError(res, 503, "Payment processing is not configured. Please contact support.");
      return;
    }

    let stripeCustomerId: string;
    try {
      stripeCustomerId = await findOrCreateStripeCustomer(ownerId, ownerType as OwnerType);
    } catch {
      sendError(res, 404, "Owner not found");
      return;
    }

    const quantity = planId === "organization" ? Math.max(1, seatCount ?? 1) : 1;

    // Attach and set as default before subscribing so Stripe uses it automatically
    try {
      await stripe.paymentMethods.attach(paymentMethodId, { customer: stripeCustomerId });
    } catch {
      // Already attached — ignore the "already attached" error
    }
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: plan.stripePriceId, quantity }],
      default_payment_method: paymentMethodId,
      payment_settings: {
        save_default_payment_method: "on_subscription",
        payment_method_types: ["card"],
      },
      metadata: { ownerId, ownerType, planId },
      // Attempt payment immediately (synchronous) since we have a saved card
      payment_behavior: "error_if_incomplete",
    });

    sendSuccess(res, {
      subscriptionId: subscription.id,
      status: subscription.status,
    });
  },
);

export default router;
