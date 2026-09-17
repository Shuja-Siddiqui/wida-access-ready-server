import { Router, type IRouter } from "express";
import { SubmitContactMessageBody, SubmitContactMessageResponse } from "../../generated";
import { sendHtmlEmail } from "../../lib/mail/mailer";
import { config } from "../../config/index";
import { sendError, sendSuccess } from "../../lib/http/api-response";

const router: IRouter = Router();

router.post("/contact", async (req, res): Promise<void> => {
  const parsed = SubmitContactMessageBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid contact form submission");
    sendError(res, 400, parsed.error.message);
    return;
  }

  const { name, email, message } = parsed.data;
  const recipient = config.email.from || "hello@fugeesfamily.org";

  try {
    await sendHtmlEmail({
      to: recipient,
      subject: `ACCESS Ready contact form: ${name}`,
      html: `
        <p><strong>From:</strong> ${name} (${email})</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, "<br />")}</p>
      `,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to send contact form email");
    sendError(res, 500, "Failed to send message. Please try again later.");
    return;
  }

  sendSuccess(res, SubmitContactMessageResponse.parse({ ok: true }));
});

export default router;
