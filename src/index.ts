import dotenv from "dotenv";
if (process.env.NODE_ENV !== "production") {
  dotenv.config({ override: true });
}
import { runMigrations } from "stripe-replit-sync";
import app from "./app";
import { config } from "./config";
import { logger } from "./config/logger";
import { startLogCleanupJob } from "./lib/logCleanup";
import { startRenewalCrons } from "./lib/renewalCron";
import { getStripeSync } from "./lib/stripeClient";

const rawPort = process.env["PORT"] ?? "8080";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function initStripe(): Promise<void> {
  const databaseUrl = config.database.url;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL environment variable is required for Stripe integration.",
    );
  }

  await runMigrations({ databaseUrl });

  const stripeSync = await getStripeSync();

  const webhookBaseUrl = (config.appUrl || "").replace(/\/$/, "");
  const isLocal =
    !webhookBaseUrl ||
    webhookBaseUrl.includes("localhost") ||
    webhookBaseUrl.includes("127.0.0.1");

  if (!isLocal) {
    const webhookResult = await stripeSync.findOrCreateManagedWebhook(
      `${webhookBaseUrl}/api/stripe/webhook`,
    );
    logger.info(
      { webhook: webhookResult?.url },
      "Stripe managed webhook configured",
    );
  } else {
    logger.info("Skipping Stripe managed webhook on local APP_URL");
  }

  stripeSync
    .syncBackfill({ object: "all" })
    .then(() => logger.info("Stripe data synced"))
    .catch((err) => logger.error({ err }, "Error syncing Stripe data"));
}

try {
  await initStripe();
} catch (err) {
  logger.error({ err }, "Failed to initialize Stripe");
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startLogCleanupJob();
  startRenewalCrons();
});
export * from "./generated/api";
export * as generatedTypes from "./generated/types";
