import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { logger } from "../config/logger";
import { config } from "../config/index";

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
}: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<void> {
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!list.length) return;

  const tx = getTransporter();
  if (!tx) {
    logger.warn({ to: list, subject }, "SMTP not configured; skipped email delivery");
    return;
  }

  await tx.sendMail({
    from: config.email.from,
    to: list,
    subject,
    html,
  });
}
