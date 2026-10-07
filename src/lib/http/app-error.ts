/**
 * Typed HTTP errors for API routes. Throw these instead of bare `Error`
 * when the client should receive a specific status code and message.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: Record<string, unknown>;
  /** When false, production responses use a generic message. */
  readonly exposeMessage: boolean;

  constructor(
    message: string,
    opts: {
      status?: number;
      code?: string;
      details?: Record<string, unknown>;
      exposeMessage?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.status = opts.status ?? 500;
    this.code = opts.code;
    this.details = opts.details;
    this.exposeMessage = opts.exposeMessage ?? this.status < 500;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export function badRequest(message: string, details?: Record<string, unknown>): AppError {
  return new AppError(message, { status: 400, details, exposeMessage: true });
}

export function notFound(message = "Not found"): AppError {
  return new AppError(message, { status: 404, exposeMessage: true });
}

export function forbidden(message = "Forbidden"): AppError {
  return new AppError(message, { status: 403, exposeMessage: true });
}

export function conflict(message: string, details?: Record<string, unknown>): AppError {
  return new AppError(message, { status: 409, details, exposeMessage: true });
}

export function unprocessable(message: string, details?: Record<string, unknown>): AppError {
  return new AppError(message, { status: 422, details, exposeMessage: true });
}

export function upstreamError(message: string, details?: Record<string, unknown>): AppError {
  return new AppError(message, { status: 502, details, exposeMessage: true });
}

export function serviceUnavailable(
  message: string,
  details?: Record<string, unknown>,
): AppError {
  return new AppError(message, { status: 503, details, exposeMessage: true });
}
