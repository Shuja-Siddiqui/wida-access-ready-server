import type { Logger } from "pino";
import { isEmailDeliveryConfigured, sendHtmlEmail } from "./mailer";

export type SendHtmlEmailOptions = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

export type EmailDeliveryResult = { sent: true } | { sent: false; error: unknown };

/**
 * Sends transactional mail and returns whether delivery succeeded.
 * Callers must surface `sent: false` in the API response — never treat failure as success silently.
 */
export async function deliverTransactionalEmail(
  options: SendHtmlEmailOptions,
  log: Logger | undefined,
  logContext: Record<string, unknown>,
): Promise<EmailDeliveryResult> {
  if (!isEmailDeliveryConfigured()) {
    log?.warn({ ...logContext, to: options.to }, "SMTP not configured — email not sent");
    return { sent: false, error: new Error("SMTP not configured") };
  }
  try {
    await sendHtmlEmail(options);
    return { sent: true };
  } catch (error) {
    log?.warn({ err: error, ...logContext, to: options.to }, "Transactional email delivery failed");
    return { sent: false, error };
  }
}
