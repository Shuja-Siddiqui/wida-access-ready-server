/**
 * Send one preview of each ACCESS Ready email template (sample data).
 * Usage:
 *   npm run build
 *   node --env-file=.env scripts/send-all-email-previews.mjs [recipient@email.com]
 */
import nodemailer from "nodemailer";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const to = process.argv[2]?.trim() || "muhammadnomi425@gmail.com";
const from = process.env.EMAIL_FROM ?? "ACCESS Ready <noreply@accessready.app>";
const appUrl = (process.env.APP_URL || "https://accessready.app").replace(/\/$/, "");

const distTemplates = path.join(__dirname, "../dist/lib/mail/email-templates.mjs");
let templates;
try {
  templates = await import(pathToFileURL(distTemplates).href);
} catch (err) {
  console.error("Run npm run build in api-server first.\n", err?.message ?? err);
  process.exit(1);
}

const {
  verificationEmail,
  invitationEmail,
  educatorInvitationEmail,
  billingConfirmationEmail,
  passwordResetEmail,
  contactFormNotificationEmail,
  smtpTestEmail,
  emailLogoAttachment,
} = templates;

const logoAttachment = emailLogoAttachment?.() ?? null;
if (!logoAttachment) {
  console.warn("Logo file not found at api-server/assets/goelprep-logo.png — header image will be missing.");
}

const sampleLink = `${appUrl}/preview/sample-link?token=demo-not-real`;

const previews = [
  {
    subject: "[Preview] Welcome — verify your email",
    html: verificationEmail("Alex Student", `${sampleLink}&type=verify`),
  },
  {
    subject: "[Preview] Password reset",
    html: passwordResetEmail(`${sampleLink}&type=reset`),
  },
  {
    subject: "[Preview] Student invitation (teacher)",
    html: invitationEmail({
      inviteeName: "Jamie Rivera",
      inviterName: "Ms. Chen",
      inviterRole: "teacher",
      assessment: "ACCESS for ELLs",
      message: "We're excited to have you practice listening and reading this week!",
      inviteUrl: `${sampleLink}&type=invite-student`,
    }),
  },
  {
    subject: "[Preview] Student invitation (parent)",
    html: invitationEmail({
      inviteeName: "Sam Okonkwo",
      inviterName: "Jordan Okonkwo",
      inviterRole: "parent",
      inviteUrl: `${sampleLink}&type=invite-parent`,
    }),
  },
  {
    subject: "[Preview] Educator invitation (principal)",
    html: educatorInvitationEmail({
      inviteeName: "Taylor Brooks",
      inviterName: "Dr. Williams",
      inviteUrl: `${sampleLink}&type=invite-educator`,
    }),
  },
  {
    subject: "[Preview] Billing receipt",
    html: billingConfirmationEmail({
      planName: "Teacher Pro (Annual)",
      amountDisplay: "$149.00",
      periodDisplay: "per year",
      nextBillingDateDisplay: "October 15, 2027",
      billingUrl: `${appUrl}/teacher/billing`,
    }),
  },
  {
    subject: "[Preview] Contact form (admin inbox)",
    html: contactFormNotificationEmail({
      name: "Preview User",
      email: "preview@example.com",
      message: "This is a sample contact form message.\n\nIt shows how line breaks appear in the branded template.",
    }),
  },
  {
    subject: "[Preview] SMTP test",
    html: smtpTestEmail(from),
  },
];

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT ?? 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const secure = process.env.SMTP_SECURE === "true";
const tlsReject = process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false";

if (!host || !user) {
  console.error("Missing SMTP_HOST or SMTP_USER in .env");
  process.exit(1);
}

const tx = nodemailer.createTransport({
  host,
  port,
  secure,
  tls: { rejectUnauthorized: tlsReject },
  ...(pass ? { auth: { user, pass } } : {}),
});

console.log("Verifying SMTP…");
await tx.verify();
console.log(`Sending ${previews.length} template previews to ${to}…\n`);

for (const { subject, html } of previews) {
  const info = await tx.sendMail({
    from,
    to,
    subject,
    html,
    attachments: logoAttachment ? [logoAttachment] : [],
  });
  console.log("✓", subject);
  console.log("  ", info.messageId);
  await new Promise((r) => setTimeout(r, 800));
}

console.log("\nDone. Check inbox (and Spam) for messages prefixed with [Preview].");
