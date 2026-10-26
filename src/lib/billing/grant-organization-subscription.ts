import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, ownerStripeCustomersTable } from "../../../db";

export type GrantSeatMode = "set" | "add";

export interface GrantOrganizationSubscriptionInput {
  /** district_admins.id or profiles.id (organization owner) */
  ownerId: string;
  email: string;
  name: string;
  seatCount: number;
  /** When an active sub exists: replace quantity (set) or increase by seatCount (add). Default add. */
  mode?: GrantSeatMode;
}

export interface GrantOrganizationSubscriptionResult {
  stripeCustomerId: string;
  subscriptionId: string;
  seatCount: number;
  mockCheckout: true;
}

/** True when checkout should succeed locally without calling Stripe APIs. */
export function isBillingMockSuccess(): boolean {
  if (process.env.BILLING_MOCK_SUCCESS === "false") return false;
  if (process.env.BILLING_MOCK_SUCCESS === "true") return true;
  return process.env.NODE_ENV !== "production";
}

async function resolveOrganizationPriceId(): Promise<string> {
  try {
    const result = await db.execute(sql`
      select pr.id as price_id
      from "stripe"."products" p
      join "stripe"."prices" pr on pr.product = p.id
      where p.metadata->>'planId' = 'organization'
      limit 1
    `);
    const priceId = (result.rows as Record<string, unknown>[])[0]?.price_id as string | undefined;
    if (priceId) return priceId;
  } catch {
    /* stripe schema optional */
  }
  return "price_mock_organization";
}

async function resolveStripeAccountId(): Promise<string> {
  try {
    const result = await db.execute(sql`
      select _account_id as account_id
      from "stripe"."subscriptions"
      limit 1
    `);
    const accountId = (result.rows as Record<string, unknown>[])[0]?.account_id as string | undefined;
    if (accountId) return accountId;
  } catch {
    /* ignore */
  }
  return "acct_mock";
}

async function loadSubscriptionTemplate(): Promise<Record<string, unknown> | null> {
  try {
    const result = await db.execute(sql`
      select _raw_data as raw
      from "stripe"."subscriptions"
      where status = 'active'
      limit 1
    `);
    const raw = (result.rows as Record<string, unknown>[])[0]?.raw;
    if (raw && typeof raw === "object") return structuredClone(raw as Record<string, unknown>);
  } catch {
    /* ignore */
  }
  return null;
}

async function loadSubscriptionItemTemplate(): Promise<Record<string, unknown> | null> {
  try {
    const result = await db.execute(sql`
      select _raw_data as raw
      from "stripe"."subscription_items"
      limit 1
    `);
    const raw = (result.rows as Record<string, unknown>[])[0]?.raw;
    if (raw && typeof raw === "object") return structuredClone(raw as Record<string, unknown>);
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Writes an active organization subscription into the synced Stripe tables
 * (same shape real webhooks use). Used for dev / mock checkout until live Stripe is enabled.
 */
export async function grantOrganizationSubscription(
  input: GrantOrganizationSubscriptionInput,
): Promise<GrantOrganizationSubscriptionResult> {
  const mode = input.mode ?? "add";
  const requested = Math.max(1, Math.floor(input.seatCount));
  const priceId = await resolveOrganizationPriceId();
  const accountId = await resolveStripeAccountId();
  const nowSec = Math.floor(Date.now() / 1000);
  const periodEndSec = nowSec + 365 * 24 * 60 * 60;

  const metadata = {
    planId: "organization",
    ownerId: input.ownerId,
    ownerType: "organization",
    mockCheckout: "true",
  };

  const [existingOwner] = await db
    .select({ stripeCustomerId: ownerStripeCustomersTable.stripeCustomerId })
    .from(ownerStripeCustomersTable)
    .where(
      and(
        eq(ownerStripeCustomersTable.ownerId, input.ownerId),
        eq(ownerStripeCustomersTable.ownerType, "organization"),
      ),
    )
    .limit(1);

  let customerId = existingOwner?.stripeCustomerId;

  if (!customerId) {
    customerId = `cus_mock_${crypto.randomBytes(8).toString("hex")}`;
    const customerRaw = {
      id: customerId,
      object: "customer",
      email: input.email,
      name: input.name || input.email,
      created: nowSec,
      livemode: false,
      metadata: { ownerId: input.ownerId, ownerType: "organization", mockCheckout: "true" },
    };
    await db.execute(sql`
      insert into "stripe"."customers" (_raw_data, _account_id)
      values (${JSON.stringify(customerRaw)}::jsonb, ${accountId})
    `);
    await db
      .insert(ownerStripeCustomersTable)
      .values({
        ownerId: input.ownerId,
        ownerType: "organization",
        stripeCustomerId: customerId,
      })
      .onConflictDoUpdate({
        target: [ownerStripeCustomersTable.ownerId, ownerStripeCustomersTable.ownerType],
        set: { stripeCustomerId: customerId },
      });
  }

  const existingSubResult = await db.execute(sql`
    select id, status
    from "stripe"."subscriptions"
    where customer = ${customerId}
    order by created desc nulls last
    limit 1
  `);
  const existingSub = (existingSubResult.rows as Record<string, unknown>[])[0];

  let subscriptionId = existingSub?.id as string | undefined;
  let itemId: string | undefined;
  let targetSeatCount = requested;

  if (existingSub?.status === "active" && subscriptionId) {
    const itemRow = await db.execute(sql`
      select id, quantity from "stripe"."subscription_items"
      where subscription = ${subscriptionId}
      limit 1
    `);
    itemId = (itemRow.rows as Record<string, unknown>[])[0]?.id as string | undefined;
    const currentQty = Number((itemRow.rows as Record<string, unknown>[])[0]?.quantity ?? 0);
    targetSeatCount = mode === "set" ? requested : currentQty + requested;

    if (itemId) {
      const itemRawRow = await db.execute(sql`
        select _raw_data as raw from "stripe"."subscription_items" where id = ${itemId}
      `);
      const itemRaw = (itemRawRow.rows as Record<string, unknown>[])[0]?.raw as Record<string, unknown> | undefined;
      if (itemRaw) {
        const updated = structuredClone(itemRaw);
        updated.quantity = targetSeatCount;
        updated.current_period_end = periodEndSec;
        updated.price = priceId;
        await db.execute(sql`
          update "stripe"."subscription_items"
          set _raw_data = ${JSON.stringify(updated)}::jsonb
          where id = ${itemId}
        `);
      }
    }

    const subRawRow = await db.execute(sql`
      select _raw_data as raw from "stripe"."subscriptions" where id = ${subscriptionId}
    `);
    const subRaw = (subRawRow.rows as Record<string, unknown>[])[0]?.raw as Record<string, unknown> | undefined;
    if (subRaw) {
      const updated = structuredClone(subRaw);
      updated.metadata = metadata;
      updated.status = "active";
      updated.quantity = targetSeatCount;
      const items = updated.items as { data?: Record<string, unknown>[] } | undefined;
      if (items?.data?.[0]) {
        items.data[0].quantity = targetSeatCount;
        items.data[0].current_period_end = periodEndSec;
        items.data[0].price = priceId;
      }
      await db.execute(sql`
        update "stripe"."subscriptions"
        set _raw_data = ${JSON.stringify(updated)}::jsonb
        where id = ${subscriptionId}
      `);
    }
  } else {
    subscriptionId = `sub_mock_${crypto.randomBytes(8).toString("hex")}`;
    itemId = `si_mock_${crypto.randomBytes(8).toString("hex")}`;
    targetSeatCount = requested;

    const subTemplate =
      (await loadSubscriptionTemplate()) ??
      ({
        object: "subscription",
        items: { data: [{}] },
      } as Record<string, unknown>);

    subTemplate.id = subscriptionId;
    subTemplate.customer = customerId;
    subTemplate.status = "active";
    subTemplate.created = nowSec;
    subTemplate.start_date = nowSec;
    subTemplate.billing_cycle_anchor = nowSec;
    subTemplate.metadata = metadata;
    subTemplate.cancel_at_period_end = false;
    subTemplate.quantity = targetSeatCount;

    const items = subTemplate.items as { data?: Record<string, unknown>[] } | undefined;
    if (!items?.data?.length) {
      subTemplate.items = { data: [{}] };
    }
    const itemSlot = (subTemplate.items as { data: Record<string, unknown>[] }).data[0];
    itemSlot.id = itemId;
    itemSlot.subscription = subscriptionId;
    itemSlot.quantity = targetSeatCount;
    itemSlot.price = priceId;
    itemSlot.current_period_start = nowSec;
    itemSlot.current_period_end = periodEndSec;

    await db.execute(sql`
      insert into "stripe"."subscriptions" (_raw_data, _account_id)
      values (${JSON.stringify(subTemplate)}::jsonb, ${accountId})
    `);

    const itemTemplate =
      (await loadSubscriptionItemTemplate()) ??
      ({
        object: "subscription_item",
      } as Record<string, unknown>);

    itemTemplate.id = itemId;
    itemTemplate.subscription = subscriptionId;
    itemTemplate.quantity = targetSeatCount;
    itemTemplate.price = priceId;
    itemTemplate.created = nowSec;
    itemTemplate.current_period_start = nowSec;
    itemTemplate.current_period_end = periodEndSec;

    await db.execute(sql`
      insert into "stripe"."subscription_items" (_raw_data, _account_id)
      values (${JSON.stringify(itemTemplate)}::jsonb, ${accountId})
    `);
  }

  return {
    stripeCustomerId: customerId,
    subscriptionId: subscriptionId!,
    seatCount: targetSeatCount,
    mockCheckout: true,
  };
}
