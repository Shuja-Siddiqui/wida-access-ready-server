/**
 * Send a one-off SMTP test email using api-server .env (EMAIL_FROM, SMTP_*).
 * Usage: node --env-file=.env scripts/send-smtp-test.mjs [recipient@email.com]
 *
 * Uses the same branded layout as production templates (build dist first, or falls back to simple HTML).
 */
import nodemailer from "nodemailer";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const to = process.argv[2]?.trim() || "muhammadnomi425@gmail.com";
const from = process.env.EMAIL_FROM ?? "ACCESS Ready <noreply@accessready.app>";
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

const distTemplates = path.join(__dirname, "../dist/lib/mail/email-templates.mjs");
let html;
let logoAttachment = null;
try {
  const mod = await import(pathToFileURL(distTemplates).href);
  if (typeof mod.smtpTestEmail !== "function") {
    throw new Error("smtpTestEmail export missing");
  }
  html = mod.smtpTestEmail(from);
  logoAttachment = mod.emailLogoAttachment?.() ?? null;
  console.log("Using branded template:", distTemplates);
  if (!logoAttachment) console.warn("Logo file not found — header image will be missing.");
} catch (err) {
  console.error(
    "Branded template not found. Run: npm run build  (in api-server)\n",
    err?.message ?? err,
  );
  process.exit(1);
}

const tx = nodemailer.createTransport({
  host,
  port,
  secure,
  tls: { rejectUnauthorized: tlsReject },
  ...(pass ? { auth: { user, pass } } : {}),
});

console.log("Verifying SMTP connection…");
await tx.verify();
console.log("Sending test email…", { from, to });

const info = await tx.sendMail({
  from,
  to,
  subject: "ACCESS Ready — SMTP test",
  html,
  attachments: logoAttachment ? [logoAttachment] : [],
});

console.log("Sent:", info.messageId);
console.log("Response:", info.response);
