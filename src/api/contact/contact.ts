import type { IRouter } from "express";
import { createApiRouter } from "../../lib/http/create-api-router";
import { SubmitContactMessageBody, SubmitContactMessageResponse } from "../../generated";
import { sendHtmlEmail } from "../../lib/mail/mailer";
import { contactFormNotificationEmail } from "../../lib/mail/email-templates";
import { config } from "../../config/index";
import { sendError, sendSuccess } from "../../lib/http/api-response";
import { rateLimitContact } from "../../middlewares/rate-limit-public";

const router: IRouter = createApiRouter();

router.post("/contact", rateLimitContact(), async (req, res): Promise<void> => {
  const parsed = SubmitContactMessageBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid contact form submission");
    sendError(res, 400, parsed.error.message);
    return;
  }

  const { name, email, message } = parsed.data;
  const recipient = config.email.support || config.email.from || "support@accessready.app";

  try {
    await sendHtmlEmail({
      to: recipient,
      subject: `ACCESS Ready contact form: ${name}`,
      html: contactFormNotificationEmail({ name, email, message }),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to send contact form email");
    sendError(res, 500, "Failed to send message. Please try again later.");
    return;
  }

  sendSuccess(res, SubmitContactMessageResponse.parse({ ok: true }));
});

export default router;
