/**
 * Branded HTML email templates for ACCESS Ready.
 * Colors align with access-ready/client/styles/theme.css (Blossom pink primary).
 */

import { config } from "../../config/index";
import { emailLogoSrc } from "./email-logo";

/** Brand palette (email-safe hex; gradients approximated for clients). */
const BRAND = {
  pink: "#FF4D8D",
  pinkHover: "#FF77A9",
  pinkSoft: "#FFF5F8",
  trustBlue: "#0F7AE5",
  growthGreen: "#33CC00",
  logoGold: "#FFB800",
  logoTeal: "#00B8B8",
  text: "#18181b",
  textMuted: "#52525b",
  textSubtle: "#71717a",
  border: "#f0f0f0",
  canvas: "#f4f4f5",
  card: "#ffffff",
} as const;

const TAGLINE = "Adaptive ELL exit prep for K–12";
const PRODUCT_NAME = "ACCESS Ready";

const support = config.email.support || "support@accessready.app";
const appUrl = (config.appUrl || "https://accessready.app").replace(/\/$/, "");
const logoSrc = emailLogoSrc();
const year = new Date().getFullYear();

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(raw: string): string {
  return escapeHtml(raw).replace(/'/g, "&#39;");
}

/** Inbox preview line only — avoid long hidden blocks (spam filters treat that as cloaking). */
function preheader(text: string): string {
  const t = escapeHtml(text.slice(0, 140));
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f4f4f5;">${t}</div>`;
}

function brandStripe(): string {
  return `
  <tr>
    <td style="padding:0;line-height:0;font-size:0;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td width="25%" height="4" style="background:${BRAND.trustBlue};font-size:0;line-height:0;">&nbsp;</td>
          <td width="25%" height="4" style="background:${BRAND.growthGreen};font-size:0;line-height:0;">&nbsp;</td>
          <td width="25%" height="4" style="background:${BRAND.logoGold};font-size:0;line-height:0;">&nbsp;</td>
          <td width="25%" height="4" style="background:${BRAND.pink};font-size:0;line-height:0;">&nbsp;</td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function emailHeader(): string {
  return `
  ${brandStripe()}
  <tr>
    <td style="background:${BRAND.pink};padding:32px 40px 28px;text-align:center;">
      <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto;">
        <tr>
          <td style="padding-bottom:12px;">
            <img src="${escapeAttr(logoSrc)}" alt="${PRODUCT_NAME}" width="180" height="auto"
              style="display:block;margin:0 auto;max-width:180px;height:auto;border:0;background:#ffffff;border-radius:10px;padding:8px 14px;" />
          </td>
        </tr>
        <tr>
          <td>
            <p style="margin:0;font-size:12px;font-weight:600;color:rgba(255,255,255,0.95);letter-spacing:0.04em;">
              ${PRODUCT_NAME}
            </p>
            <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.85);line-height:1.4;">
              ${TAGLINE}
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function emailFooter(): string {
  return `
  <tr>
    <td style="background:#fafafa;border-top:1px solid ${BRAND.border};padding:24px 40px;text-align:center;">
      <p style="margin:0 0 8px;font-size:13px;color:${BRAND.textMuted};line-height:1.5;">
        Questions? Email
        <a href="mailto:${escapeAttr(support)}" style="color:${BRAND.pink};font-weight:600;text-decoration:none;">${escapeHtml(support)}</a>
      </p>
      <p style="margin:0 0 12px;font-size:12px;color:${BRAND.textSubtle};line-height:1.5;">
        <a href="${escapeAttr(appUrl)}" style="color:${BRAND.textSubtle};text-decoration:underline;">${escapeHtml(appUrl.replace(/^https?:\/\//, ""))}</a>
      </p>
      <p style="margin:0 0 8px;font-size:11px;color:#a1a1aa;line-height:1.5;">
        This is a transactional message about your ${PRODUCT_NAME} account. You received it because someone used your email on our platform.
      </p>
      <p style="margin:0;font-size:11px;color:#a1a1aa;">
        © ${year} ${PRODUCT_NAME}. All rights reserved.
      </p>
    </td>
  </tr>`;
}

function base(title: string, body: string, previewText?: string): string {
  const preview = previewText ? preheader(previewText) : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.canvas};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  ${preview}
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${BRAND.canvas};padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
        style="max-width:560px;background:${BRAND.card};border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(24,24,27,0.08);border:1px solid ${BRAND.border};">
        ${emailHeader()}
        <tr>
          <td style="padding:36px 40px 32px;">
            ${body}
          </td>
        </tr>
        ${emailFooter()}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function h1(text: string): string {
  return `<p style="margin:0 0 8px;font-size:22px;font-weight:800;color:${BRAND.text};letter-spacing:-0.02em;line-height:1.25;">${text}</p>`;
}

function lead(html: string): string {
  return `<p style="margin:0 0 24px;font-size:15px;color:${BRAND.textMuted};line-height:1.65;">${html}</p>`;
}

function finePrint(html: string): string {
  return `<p style="margin:0;font-size:13px;color:${BRAND.textSubtle};line-height:1.6;">${html}</p>`;
}

function primaryBtn(label: string, url: string): string {
  const safeUrl = escapeAttr(url);
  const safeLabel = escapeHtml(label);
  return `
  <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 20px;">
    <tr>
      <td align="center" style="border-radius:10px;background:${BRAND.pink};">
        <a href="${safeUrl}" target="_blank"
          style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;mso-padding-alt:0;">
          ${safeLabel}
        </a>
      </td>
    </tr>
  </table>`;
}

function fallbackLink(url: string): string {
  return `
  <p style="margin:0 0 6px;font-size:13px;color:${BRAND.textSubtle};">If the button doesn't work, copy and paste this link:</p>
  <p style="margin:0 0 24px;font-size:12px;color:#a1a1aa;word-break:break-all;line-height:1.5;">
    <a href="${escapeAttr(url)}" style="color:${BRAND.pink};text-decoration:none;">${escapeHtml(url)}</a>
  </p>`;
}

function quoteBlock(message: string): string {
  const safe = escapeHtml(message);
  return `
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;">
    <tr>
      <td style="padding:14px 18px;background:${BRAND.pinkSoft};border-left:4px solid ${BRAND.pink};border-radius:0 8px 8px 0;">
        <p style="margin:0;font-size:14px;color:${BRAND.textMuted};font-style:italic;line-height:1.55;">"${safe}"</p>
      </td>
    </tr>
  </table>`;
}

function keyValueTable(rows: { label: string; value: string; last?: boolean }[]): string {
  const trs = rows
    .map((row, i) => {
      const border = row.last || i === rows.length - 1 ? "" : `border-bottom:1px solid ${BRAND.border};`;
      return `
      <tr>
        <td style="padding:12px 0;font-size:14px;color:${BRAND.textSubtle};${border}">${escapeHtml(row.label)}</td>
        <td style="padding:12px 0;font-size:14px;color:${BRAND.text};text-align:right;font-weight:700;${border}">${row.value}</td>
      </tr>`;
    })
    .join("");
  return `
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
    style="margin:0 0 28px;border:1px solid ${BRAND.border};border-radius:12px;padding:4px 20px;background:#fafafa;">
    ${trs}
  </table>`;
}

// ── 1. Email verification ───────────────────────────────────────────────────
export function verificationEmail(name: string, verificationUrl: string): string {
  const safeName = escapeHtml(name);
  return base(
    "Verify your ACCESS Ready email",
    `
    ${h1(`Welcome, ${safeName}!`)}
    ${lead(
      `You're one step away from starting your ELL exit prep journey. Verify your email to activate your <strong>${PRODUCT_NAME}</strong> account. This link expires in <strong>24 hours</strong>.`,
    )}
    ${primaryBtn("Verify my email", verificationUrl)}
    ${fallbackLink(verificationUrl)}
    ${finePrint(`If you didn't create a ${PRODUCT_NAME} account, you can safely ignore this email.`)}
    `,
    "Verify your email to activate your ACCESS Ready account.",
  );
}

// ── 2. Invitation (teacher → student, parent → child, district → student) ──
export function invitationEmail({
  inviteeName,
  inviterName,
  inviterRole,
  assessment,
  message,
  inviteUrl,
}: {
  inviteeName: string;
  inviterName: string;
  inviterRole: string;
  assessment?: string;
  message?: string;
  inviteUrl: string;
}): string {
  const roleLabel =
    inviterRole === "parent"
      ? "parent"
      : inviterRole === "district_admin"
        ? "district administrator"
        : "teacher";

  const assessmentBlock = assessment
    ? lead(`You'll be preparing for the <strong>${escapeHtml(assessment)}</strong> assessment.`)
    : "";

  const messageBlock = message ? quoteBlock(message) : "";

  return base(
    "You're invited to ACCESS Ready",
    `
    ${h1(`Hi ${escapeHtml(inviteeName)}!`)}
    ${lead(
      `Your ${roleLabel} <strong>${escapeHtml(inviterName)}</strong> invited you to <strong>${PRODUCT_NAME}</strong> — ${TAGLINE.toLowerCase()}.`,
    )}
    ${messageBlock}
    ${assessmentBlock}
    ${lead(`Accept below to set up your account. This invitation expires in <strong>7 days</strong>.`)}
    ${primaryBtn("Accept invitation", inviteUrl)}
    ${fallbackLink(inviteUrl)}
    ${finePrint("If you weren't expecting this invitation, you can safely ignore this email.")}
    `,
    `${inviterName} invited you to ACCESS Ready.`,
  );
}

// ── 3. Educator invitation (principal → teacher) ────────────────────────────
export function educatorInvitationEmail({
  inviteeName,
  inviterName,
  inviteUrl,
}: {
  inviteeName: string;
  inviterName: string;
  inviteUrl: string;
}): string {
  return base(
    "Your ACCESS Ready teacher invitation",
    `
    ${h1(`Hi ${escapeHtml(inviteeName)},`)}
    ${lead(
      `<strong>${escapeHtml(inviterName)}</strong>, your school principal, invited you to join <strong>${PRODUCT_NAME}</strong> as a teacher.`,
    )}
    ${lead(`Use the link below to accept and choose a password. The link expires in <strong>7 days</strong>.`)}
    ${primaryBtn("Accept invitation", inviteUrl)}
    ${fallbackLink(inviteUrl)}
    ${finePrint("If you were not expecting this, you can ignore this email. No account will be created unless you use the link.")}
    `,
    `${inviterName} invited you to ACCESS Ready as a teacher.`,
  );
}

// ── 3b. Principal invitation (district admin → principal) ───────────────────
export function principalInvitationEmail({
  inviteeName,
  inviterName,
  schoolName,
  inviteUrl,
}: {
  inviteeName: string;
  inviterName: string;
  schoolName: string;
  inviteUrl: string;
}): string {
  return base(
    "Your ACCESS Ready principal invitation",
    `
    ${h1(`Hi ${escapeHtml(inviteeName)},`)}
    ${lead(
      `<strong>${escapeHtml(inviterName)}</strong> invited you to be the principal for <strong>${escapeHtml(schoolName)}</strong> on <strong>${PRODUCT_NAME}</strong>.`,
    )}
    ${lead(`Use the link below to accept, set your password, and finish setting up the school. The link expires in <strong>7 days</strong>.`)}
    ${primaryBtn("Accept invitation", inviteUrl)}
    ${fallbackLink(inviteUrl)}
    ${finePrint("If you were not expecting this, you can ignore this email. The school will not be created unless you accept.")}
    `,
    `Principal invitation for ${schoolName} on ACCESS Ready.`,
  );
}

/** Subject lines — specific, no shouty marketing phrasing (spam filters). */
export function principalInvitationSubject(schoolName: string): string {
  return `Principal setup for ${schoolName} — ACCESS Ready`;
}

// ── 3c. District admin invitation (super admin → district admin) ─────────────
export function districtAdminInvitationEmail({
  inviteeName,
  inviterName,
  districtName,
  inviteUrl,
}: {
  inviteeName: string;
  inviterName: string;
  districtName: string;
  inviteUrl: string;
}): string {
  return base(
    "Your ACCESS Ready district administrator invitation",
    `
    ${h1(`Hi ${escapeHtml(inviteeName)},`)}
    ${lead(
      `<strong>${escapeHtml(inviterName)}</strong> invited you to be the district administrator for <strong>${escapeHtml(districtName)}</strong> on <strong>${PRODUCT_NAME}</strong>.`,
    )}
    ${lead(`Use the link below to accept, set your password, and access your district dashboard. The link expires in <strong>7 days</strong>.`)}
    ${primaryBtn("Accept invitation", inviteUrl)}
    ${fallbackLink(inviteUrl)}
    ${finePrint("If you were not expecting this, you can ignore this email. No account will be created unless you accept.")}
    `,
    `District admin invitation for ${districtName} on ACCESS Ready.`,
  );
}

export function districtAdminInvitationSubject(districtName: string): string {
  return `District admin setup for ${districtName} — ACCESS Ready`;
}

export function userInvitationSubject(inviterName: string): string {
  return `${inviterName} — your ACCESS Ready invitation`;
}

// ── 4. Billing confirmation ───────────────────────────────────────────────────
export function billingConfirmationEmail({
  planName,
  amountDisplay,
  periodDisplay,
  nextBillingDateDisplay,
  billingUrl,
}: {
  planName: string;
  amountDisplay: string;
  periodDisplay: string;
  nextBillingDateDisplay: string | null;
  billingUrl: string;
}): string {
  const rows: { label: string; value: string; last?: boolean }[] = [
    { label: "Plan", value: escapeHtml(planName) },
    { label: "Amount charged", value: `${escapeHtml(amountDisplay)} ${escapeHtml(periodDisplay)}` },
  ];
  if (nextBillingDateDisplay) {
    rows.push({ label: "Next billing date", value: escapeHtml(nextBillingDateDisplay), last: true });
  } else {
    rows[rows.length - 1]!.last = true;
  }

  return base(
    "Your ACCESS Ready payment receipt",
    `
    ${h1("Payment received")}
    ${lead("Thanks! We've received your payment and your subscription is active. Here's a summary for your records:")}
    ${keyValueTable(rows)}
    ${primaryBtn("View billing details", billingUrl)}
    ${fallbackLink(billingUrl)}
    ${finePrint("Questions about this charge? Reply to this email or contact support — we're happy to help.")}
    `,
    `Receipt for your ${planName} subscription.`,
  );
}

// ── 5. Password reset ───────────────────────────────────────────────────────
export function passwordResetEmail(resetUrl: string): string {
  return base(
    "Reset your ACCESS Ready password",
    `
    ${h1("Reset your password")}
    ${lead(
      `We received a request to reset the password for your <strong>${PRODUCT_NAME}</strong> account. Use the button below — this link expires in <strong>1 hour</strong>.`,
    )}
    ${primaryBtn("Reset password", resetUrl)}
    ${fallbackLink(resetUrl)}
    ${finePrint("If you didn't request a password reset, ignore this email — your password won't change.")}
    `,
    "Reset your ACCESS Ready password (expires in 1 hour).",
  );
}

// ── 6. Contact form (to support / admin inbox) ──────────────────────────────
export function contactFormNotificationEmail({
  name,
  email,
  message,
}: {
  name: string;
  email: string;
  message: string;
}): string {
  const bodyHtml = escapeHtml(message).replace(/\n/g, "<br />");
  return base(
    "New contact form message",
    `
    ${h1("New contact message")}
    ${lead("Someone submitted the public contact form on ACCESS Ready:")}
    ${keyValueTable([
      { label: "Name", value: escapeHtml(name) },
      { label: "Email", value: `<a href="mailto:${escapeAttr(email)}" style="color:${BRAND.pink};text-decoration:none;">${escapeHtml(email)}</a>` },
      { label: "Received", value: escapeHtml(new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })), last: true },
    ])}
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 8px;">
      <tr>
        <td style="padding:16px 18px;background:#fafafa;border:1px solid ${BRAND.border};border-radius:12px;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:${BRAND.textSubtle};text-transform:uppercase;letter-spacing:0.06em;">Message</p>
          <p style="margin:0;font-size:15px;color:${BRAND.text};line-height:1.65;">${bodyHtml}</p>
        </td>
      </tr>
    </table>
    `,
    `Contact form from ${name}`,
  );
}

/** Branded SMTP connectivity test (scripts/send-smtp-test.mjs). */
export { emailLogoAttachment } from "./email-logo";

export function smtpTestEmail(fromDisplay: string): string {
  return base(
    "ACCESS Ready SMTP test",
    `
    ${h1("SMTP test successful")}
    ${lead(`This message confirms your mail server settings for <strong>${PRODUCT_NAME}</strong> are working.`)}
    ${keyValueTable([
      { label: "From", value: escapeHtml(fromDisplay) },
      { label: "Sent at", value: escapeHtml(new Date().toISOString()), last: true },
    ])}
    ${finePrint("You can delete this email.")}
    `,
    "ACCESS Ready SMTP configuration test.",
  );
}
