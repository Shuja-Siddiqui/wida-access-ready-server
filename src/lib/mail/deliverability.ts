import type { SendMailOptions } from "nodemailer";
import { config } from "../../config/index";

/** RFC 3834 — automated transactional mail (not bulk marketing). */
export function transactionalMailHeaders(): SendMailOptions["headers"] {
  return {
    "Auto-Submitted": "auto-generated",
    "X-Auto-Response-Suppress": "All",
  };
}

export function resolveReplyTo(): string | undefined {
  const reply = config.email.replyTo?.trim();
  if (reply) return reply;
  const support = config.email.support?.trim();
  if (support) return support;
  return undefined;
}
