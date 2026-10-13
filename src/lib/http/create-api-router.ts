import {
  Router,
  type IRouter,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";

type RouteHandler = RequestHandler | IRouter;

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "all"] as const;

/** Forward async rejections and sync throws to Express error middleware. */
function wrapHandler(handler: RouteHandler): RouteHandler {
  if (typeof handler !== "function") {
    return handler;
  }
  // Error-handling middleware — leave as-is (arity 4).
  if (handler.length >= 4) {
    return handler;
  }
  const wrapped: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = handler(req, res, next);
      if (result instanceof Promise) {
        result.catch(next);
      }
    } catch (err) {
      next(err);
    }
  };
  return wrapped;
}

function wrapHandlers(handlers: RouteHandler[]): RouteHandler[] {
  return handlers.map(wrapHandler);
}

/**
 * Express Router that automatically wraps every route handler and middleware
 * registered via HTTP verbs or `.use()`, so thrown errors and rejected
 * promises always reach the global error handler.
 */
export function createApiRouter(): IRouter {
  const router = Router();

  for (const method of HTTP_METHODS) {
    const original = router[method].bind(router) as (
      path: Parameters<IRouter["get"]>[0],
      ...handlers: RouteHandler[]
    ) => IRouter;

    router[method] = ((path: Parameters<IRouter["get"]>[0], ...handlers: RouteHandler[]) =>
      original(path, ...wrapHandlers(handlers))) as IRouter[typeof method];
  }

  const originalUse = router.use.bind(router);
  router.use = ((...args: RouteHandler[]) =>
    originalUse(...wrapHandlers(args))) as IRouter["use"];

  return router;
}
