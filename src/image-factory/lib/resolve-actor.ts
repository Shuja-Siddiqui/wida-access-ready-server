import type { Request } from "express";
import { sendError } from "../../lib/http/api-response";
import type { Response } from "express";
import { resolveImageFactoryActorUserId } from "./admin-session";

const SUPER_ADMIN_ONLY =
  "Super admin access required to create or save factory images";

/**
 * Returns the acting super_admin users.id, or sends 401/403 and returns null.
 */
export function requireImageFactoryActorUserId(
  req: Request,
  res: Response,
): string | null {
  const userId = resolveImageFactoryActorUserId(req);

  if (req.auth && req.auth.role !== "super_admin") {
    sendError(res, 403, SUPER_ADMIN_ONLY);
    return null;
  }

  if (!userId) {
    if (req.internalJob) {
      sendError(
        res,
        401,
        "Log in as super_admin and open Image Factory once before cron can run",
      );
    } else {
      sendError(res, 401, "Authentication required");
    }
    return null;
  }

  return userId;
}
