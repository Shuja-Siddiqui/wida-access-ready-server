/**
 * Branded HTML email templates for ACCESS Ready.
 * All templates share the hot-pink (#FF4D8D) header and Fugees Family footer.
 */

import { config } from "../config/index";

const support = config.email.support || "support@accessready.app";

function base(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
        style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#FF4D8D;padding:28px 40px;text-align:center;">
            <p style="margin:0;font-size:26px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">
              ACCESS Ready
            </p>
            <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.8);">
              by Fugees Family, Inc.
            </p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px 48px 32px;">
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#fafafa;border-top:1px solid #f0f0f0;padding:20px 48px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.6;">
              Need help? Email us at
              <a href="mailto:${support}" style="color:#FF4D8D;text-decoration:none;">${support}</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(label: string, url: string): string {
  return `
  <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
    <tr>
      <td style="background:#FF4D8D;border-radius:8px;">
        <a href="${url}"
          style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

function fallbackLink(url: string): string {
  return `
  <p style="margin:0 0 6px;font-size:13px;color:#71717a;">
    If the button doesn't work, copy and paste this link:
  </p>
  <p style="margin:0 0 28px;font-size:12px;color:#a1a1aa;word-break:break-all;">${url}</p>`;
}

// ── 1. Email Verification ───────────────────────────────────────────────────
export function verificationEmail(name: string, verificationUrl: string): string {
  return base(
    "Verify your ACCESS Ready email",
    `
    <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#18181b;">
      Welcome, ${name}! 👋
    </p>
    <p style="margin:0 0 28px;font-size:15px;color:#52525b;line-height:1.6;">
      You're one step away from starting your ELL exit prep journey.
      Please verify your email address to activate your account.
      This link expires in <strong>24 hours</strong>.
    </p>
    ${btn("Verify my email", verificationUrl)}
    ${fallbackLink(verificationUrl)}
    <p style="margin:0;font-size:13px;color:#71717a;line-height:1.6;">
      If you didn't create an ACCESS Ready account, you can safely ignore this email.
    </p>`,
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
  inviterRole: string; // 'teacher' | 'parent' | 'district_admin'
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

  const assessmentLine = assessment
    ? `<p style="margin:0 0 20px;font-size:14px;color:#52525b;">
        You'll be preparing for the <strong>${assessment}</strong> assessment.
       </p>`
    : "";

  const messageLine = message
    ? `<blockquote style="margin:0 0 24px;padding:12px 16px;background:#FFF5F8;border-left:3px solid #FF4D8D;border-radius:4px;">
        <p style="margin:0;font-size:14px;color:#52525b;font-style:italic;">"${message}"</p>
       </blockquote>`
    : "";

  return base(
    `You're invited to ACCESS Ready`,
    `
    <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#18181b;">
      Hi ${inviteeName}! 🎉
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.6;">
      Your ${roleLabel} <strong>${inviterName}</strong> has invited you to join
      <strong>ACCESS Ready</strong> — an adaptive ELL exit prep platform that
      helps you reach your language goals faster.
    </p>
    ${messageLine}
    ${assessmentLine}
    <p style="margin:0 0 28px;font-size:15px;color:#52525b;line-height:1.6;">
      Click below to set up your account. This invitation expires in
      <strong>7 days</strong>.
    </p>
    ${btn("Accept invitation", inviteUrl)}
    ${fallbackLink(inviteUrl)}
    <p style="margin:0;font-size:13px;color:#71717a;line-height:1.6;">
      If you weren't expecting this invitation, you can safely ignore this email.
    </p>`,
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
    `You're invited to join ACCESS Ready`,
    `
    <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#18181b;">
      Hi ${inviteeName}! 👋
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.6;">
      <strong>${inviterName}</strong> (Principal) has invited you to join
      <strong>ACCESS Ready</strong> as a teacher. ACCESS Ready is an adaptive
      ELL exit prep platform that helps your students reach their language goals faster.
    </p>
    <p style="margin:0 0 28px;font-size:15px;color:#52525b;line-height:1.6;">
      Click below to set up your password and activate your account.
      This invitation expires in <strong>7 days</strong>.
    </p>
    ${btn("Accept invitation & set password", inviteUrl)}
    ${fallbackLink(inviteUrl)}
    <p style="margin:0;font-size:13px;color:#71717a;line-height:1.6;">
      If you weren't expecting this invitation, you can safely ignore this email.
    </p>`,
  );
}

// ── 4. Billing confirmation (receipt after a successful Stripe payment) ────
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
  const nextBillingRow = nextBillingDateDisplay
    ? `
    <tr>
      <td style="padding:10px 0;font-size:14px;color:#71717a;">Next billing date</td>
      <td style="padding:10px 0;font-size:14px;color:#18181b;text-align:right;font-weight:700;">${nextBillingDateDisplay}</td>
    </tr>`
    : "";

  return base(
    "Your ACCESS Ready payment receipt",
    `
    <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#18181b;">
      Payment received ✅
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">
      Thanks! We've received your payment and your subscription is active.
      Here's a summary for your records:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
      style="margin:0 0 28px;border:1px solid #f0f0f0;border-radius:8px;padding:4px 20px;">
      <tr>
        <td style="padding:10px 0;font-size:14px;color:#71717a;border-bottom:1px solid #f5f5f5;">Plan</td>
        <td style="padding:10px 0;font-size:14px;color:#18181b;text-align:right;font-weight:700;border-bottom:1px solid #f5f5f5;">${planName}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;font-size:14px;color:#71717a;${nextBillingRow ? "border-bottom:1px solid #f5f5f5;" : ""}">Amount charged</td>
        <td style="padding:10px 0;font-size:14px;color:#18181b;text-align:right;font-weight:700;${nextBillingRow ? "border-bottom:1px solid #f5f5f5;" : ""}">${amountDisplay} ${periodDisplay}</td>
      </tr>
      ${nextBillingRow}
    </table>
    ${btn("View billing details", billingUrl)}
    ${fallbackLink(billingUrl)}
    <p style="margin:0;font-size:13px;color:#71717a;line-height:1.6;">
      Questions about this charge? Reach out any time — we're happy to help.
    </p>`,
  );
}

// ── 4. Password Reset (moved from auth.ts inline HTML) ─────────────────────
export function passwordResetEmail(resetUrl: string): string {
  return base(
    "Reset your ACCESS Ready password",
    `
    <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#18181b;">
      Reset your password
    </p>
    <p style="margin:0 0 28px;font-size:15px;color:#52525b;line-height:1.6;">
      We received a request to reset the password for your ACCESS Ready account.
      Click the button below — this link expires in <strong>1 hour</strong>.
    </p>
    ${btn("Reset password", resetUrl)}
    ${fallbackLink(resetUrl)}
    <p style="margin:0;font-size:13px;color:#71717a;line-height:1.6;">
      If you didn't request a password reset, you can safely ignore this
      email — your password won't change.
    </p>`,
  );
}
