import type { Request } from "express";

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
