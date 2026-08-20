import { getStripeSync, constructStripeWebhookEvent } from "./stripeClient";
import { sendBillingReceiptEmail } from "./billingReceipt";
import { logger } from "../config/logger";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
          "Received type: " + typeof payload + ". " +
          "This usually means express.json() parsed the body before reaching this handler. " +
          "FIX: Ensure webhook route is registered BEFORE app.use(express.json()).",
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // Parsed separately from the sync above (which only mirrors Stripe data
    // into our DB and doesn't expose the event) so we can react to specific
    // event types, e.g. emailing a receipt after a successful payment.
    // Never let this block or fail the webhook response.
    try {
      const event = await constructStripeWebhookEvent(payload, signature);
      await sendBillingReceiptEmail(event);
    } catch (err) {
      logger.error({ err }, "Failed to process billing receipt email for Stripe webhook event");
    }
  }
}
