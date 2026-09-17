import type { Response } from "express";

/**
 * Standard success envelope: `{ success: true, data }`.
 * Use for every JSON response that represents a successful operation.
 * Not for raw non-JSON responses (e.g. CSV export) or 204 No Content.
 */
export function sendSuccess<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

/**
 * Standard error envelope: `{ success: false, error, details? }`.
 * `details` carries any extra machine-readable context (e.g.
 * `{ requiresVerification: true }`) that a caller needs beyond the message.
 */
export function sendError(
  res: Response,
  status: number,
  error: string,
  details?: Record<string, unknown>,
): void {
  res.status(status).json(
    details !== undefined ? { success: false, error, details } : { success: false, error },
  );
}
