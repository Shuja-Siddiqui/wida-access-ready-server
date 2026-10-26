import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { logger } from "../../config/logger";
import { config } from "../../config/index";
import { emailLogoAttachment } from "./email-logo";
import { htmlToPlainText } from "./html-to-text";
import { resolveReplyTo, transactionalMailHeaders } from "./deliverability";

let transporter: Transporter | null = null;

function hasSmtpConfig(): boolean {
  return Boolean(config.email.smtpHost && config.email.smtpPort && config.email.smtpUser);
}

function getTransporter(): Transporter | null {
  if (!hasSmtpConfig()) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: config.email.smtpHost,
    port: config.email.smtpPort,
    secure: config.email.smtpSecure,
    tls: {
      rejectUnauthorized: config.email.smtpTlsRejectUnauthorized,
    },
    ...(config.email.smtpPass
      ? { auth: { user: config.email.smtpUser, pass: config.email.smtpPass } }
      : {}),
  });
  return transporter;
}

export function isEmailDeliveryConfigured(): boolean {
  return hasSmtpConfig();
}

export async function sendHtmlEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string | string[];
  subject: string;
  html: string;
  /** Plain-text body; auto-generated from HTML when omitted. */
  text?: string;
}): Promise<void> {
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!list.length) return;

  const tx = getTransporter();
  if (!tx) {
    logger.warn({ to: list, subject }, "SMTP not configured; skipped email delivery");
    return;
  }

  const from = config.email.from;
  const smtpUser = config.email.smtpUser?.trim().toLowerCase();
  const fromMatch = from.match(/<([^>]+)>/);
  const fromAddr = (fromMatch?.[1] ?? from).trim().toLowerCase();
  if (smtpUser && fromAddr && fromAddr !== smtpUser) {
    logger.warn(
      { fromAddr, smtpUser },
      "EMAIL_FROM address does not match SMTP_USER — providers often mark this as spam",
    );
  }

  const plain = text?.trim() || htmlToPlainText(html);
  const replyTo = resolveReplyTo();
  const logo = emailLogoAttachment();

  await tx.sendMail({
    from,
    to: list,
    replyTo: replyTo || undefined,
    subject: subject.trim(),
    text: plain,
    html,
    headers: transactionalMailHeaders(),
    attachments: logo ? [logo] : undefined,
  });
}
