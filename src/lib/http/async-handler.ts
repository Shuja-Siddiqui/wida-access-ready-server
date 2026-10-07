import type { NextFunction, Request, RequestHandler, Response } from "express";

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/**
 * Wrap async route handlers so rejections reach Express error middleware.
 * Express 5 forwards these automatically; this wrapper documents intent and
 * keeps stack traces consistent when adding local logging later.
 */
export function asyncHandler(fn: AsyncRoute): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
