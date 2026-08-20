/**
 * One-time script: creates the Solo and Organization products + prices in Stripe,
 * then syncs them into the local stripe.* schema so the billing UI picks them up.
 *
 * Run: node api-server/scripts/seed-stripe-products.mjs
 */

import Stripe from "stripe";

// ── Fetch credentials from Replit connector API (same as stripeClient.ts) ──
const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
const xReplitToken = process.env.REPL_IDENTITY
  ? "repl " + process.env.REPL_IDENTITY
  : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

if (!hostname || !xReplitToken) {
  console.error("❌ Missing REPLIT_CONNECTORS_HOSTNAME or REPL_IDENTITY. Run inside Replit.");
  process.exit(1);
}

const resp = await fetch(
  `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
  { headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken }, signal: AbortSignal.timeout(10_000) }
);

const data = await resp.json();
const settings = data.items?.[0]?.settings;

if (!settings?.secret) {
  console.error("❌ Stripe integration not connected or missing secret key.");
  process.exit(1);
}

const stripe = new Stripe(settings.secret);

// ── Check for existing products ───────────────────────────────────────────
const existing = await stripe.products.list({ limit: 100, active: true });
const existingSolo = existing.data.find(p => p.metadata?.planId === "solo");
const existingOrg  = existing.data.find(p => p.metadata?.planId === "organization");

// ── Solo plan ─────────────────────────────────────────────────────────────
let soloProduct;
if (existingSolo) {
  console.log(`ℹ️  Solo product already exists: ${existingSolo.id}`);
  soloProduct = existingSolo;
} else {
  soloProduct = await stripe.products.create({
    name: "Personal",
    metadata: { planId: "solo" },
  });
  console.log(`✅ Created Solo product: ${soloProduct.id}`);
}

const soloPrice = await stripe.prices.create({
  product: soloProduct.id,
  unit_amount: 2000, // $20/mo
  currency: "usd",
  recurring: { interval: "month" },
  metadata: { planId: "solo" },
});
await stripe.products.update(soloProduct.id, { default_price: soloPrice.id });
console.log(`✅ Solo price: ${soloPrice.id}  ($20/mo)`);

// ── Organization plan ────────────────────────────────────────────────────
let orgProduct;
if (existingOrg) {
  console.log(`ℹ️  Organization product already exists: ${existingOrg.id}`);
  orgProduct = existingOrg;
} else {
  orgProduct = await stripe.products.create({
    name: "Organization",
    metadata: { planId: "organization" },
  });
  console.log(`✅ Created Organization product: ${orgProduct.id}`);
}

const orgPrice = await stripe.prices.create({
  product: orgProduct.id,
  unit_amount: 2000, // $20/seat/mo
  currency: "usd",
  recurring: { interval: "month" },
  metadata: { planId: "organization" },
});
await stripe.products.update(orgProduct.id, { default_price: orgPrice.id });
console.log(`✅ Organization price: ${orgPrice.id}  ($20/seat/mo)`);

console.log("\n🎉 Stripe products seeded. The server will sync them on next request.");
