import type { Request } from "express";
import { config } from "../../config/index";

// The app sits behind Replit's shared reverse proxy (and, in production,
// whatever load balancer sits in front of it), so `req.protocol`/`req.get("host")`
// reflect the internal proxy connection, not what the browser actually sees.
// Always prefer the forwarded headers when present.
function forwardedProto(req: Request): string {
  const header = req.headers["x-forwarded-proto"];
  if (typeof header === "string" && header.length > 0) return header.split(",")[0].trim();
  return req.protocol;
}

function forwardedHost(req: Request): string {
  const header = req.headers["x-forwarded-host"];
  if (typeof header === "string" && header.length > 0) return header.split(",")[0].trim();
  return req.get("host") ?? "";
}

export function getRequestOrigin(req: Request): string {
  return `${forwardedProto(req)}://${forwardedHost(req)}`;
}

/**
 * Base URL for links in emails (reset password, verify email, invites).
 * Prefer APP_URL so dev/prod match the student app — not the api-server Host header.
 */
export function getFrontendAppUrl(req: Request): string {
  const configured = config.appUrl?.trim().replace(/\/$/, "");
  if (configured) return configured;
  return getRequestOrigin(req);
}
