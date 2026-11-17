/**
 * Resend district admin invitation email (new token). Usage:
 *   node --env-file=.env scripts/resend-district-admin-invite.mjs nomibabaoo82@gmail.com
 */
import crypto from "node:crypto";
import pg from "pg";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/resend-district-admin-invite.mjs <email>");
  process.exit(1);
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows } = await client.query(
  `SELECT id, invitee_name, inviter_name, metadata, invitee_role
   FROM invitations
   WHERE lower(invitee_email) = $1 AND invitee_role = 'district_admin' AND accepted_at IS NULL
   ORDER BY created_at DESC LIMIT 1`,
  [email],
);

if (!rows.length) {
  console.error("No pending district_admin invitation for", email);
  await client.end();
  process.exit(1);
}

const invite = rows[0];
let districtName = "your district";
try {
  const meta = JSON.parse(invite.metadata ?? "{}");
  if (meta.districtName) districtName = meta.districtName;
} catch {
  /* ignore */
}

const token = crypto.randomBytes(32).toString("hex");
const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

await client.query(
  `UPDATE invitations SET token_hash = $1, expires_at = $2 WHERE id = $3`,
  [tokenHash, expiresAt, invite.id],
);
await client.end();

const inviteUrl = `${appUrl}/accept-invite?token=${token}`;

const tx = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  tls: { rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false" },
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const subject = `District admin setup for ${districtName} — ACCESS Ready`;
const text = `Hi ${invite.invitee_name},

${invite.inviter_name} invited you to be the district administrator for ${districtName} on ACCESS Ready.

Accept your invitation (expires in 7 days):
${inviteUrl}

If you were not expecting this, you can ignore this email.`;

try {
  const info = await tx.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject,
    text,
    html: `<p>${text.replace(/\n/g, "<br/>")}</p><p><a href="${inviteUrl}">Accept invitation</a></p>`,
  });
  console.log("Sent:", info.messageId, info.response);
  console.log("Accept URL:", inviteUrl);
} catch (err) {
  console.error("Send failed:", err);
  console.log("Manual accept URL:", inviteUrl);
  process.exit(1);
}
