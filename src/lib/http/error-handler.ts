import type { Response } from "express";
import { ZodError } from "zod";
import { config } from "../../config";
import { isClaudeCapacityError } from "../claude/queue";
import {
  AzureSpeechNotConfiguredError,
  AzureSpeechRequestError,
} from "../speech/azureSpeech";
import { AppError, isAppError } from "./app-error";
import { sendError } from "./api-response";

const isProduction = config.nodeEnv === "production";

export type ResolvedApiError = {
  status: number;
  message: string;
  details?: Record<string, unknown>;
  retryAfterSeconds?: number;
};

type PgErrorLike = {
  code?: string;
  constraint?: string;
  detail?: string;
};

function asPgError(err: unknown): PgErrorLike | null {
  if (!err || typeof err !== "object") return null;
  const direct = err as PgErrorLike;
  if (direct.code) return direct;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === "object" && (cause as PgErrorLike).code) {
    return cause as PgErrorLike;
  }
  return null;
}

function resolvePgError(err: unknown): ResolvedApiError | null {
  const pg = asPgError(err);
  if (!pg?.code) return null;

  switch (pg.code) {
    case "23505":
      return {
        status: 409,
        message: "Resource already exists",
        details: isProduction ? undefined : { constraint: pg.constraint, detail: pg.detail },
      };
    case "23503":
      return {
        status: 400,
        message: "Referenced resource does not exist",
        details: isProduction ? undefined : { constraint: pg.constraint },
      };
    case "23502":
      return { status: 400, message: "Missing required field" };
    case "22P02":
      return { status: 400, message: "Invalid identifier format" };
    default:
      return null;
  }
}

function resolveStripeError(err: unknown): ResolvedApiError | null {
  if (!err || typeof err !== "object") return null;
  const stripe = err as { type?: string; statusCode?: number; message?: string; code?: string };
  if (typeof stripe.type !== "string" || !stripe.type.startsWith("Stripe")) return null;

  const status =
    typeof stripe.statusCode === "number" && stripe.statusCode >= 400 && stripe.statusCode < 600
      ? stripe.statusCode
      : 502;

  return {
    status,
    message:
      status < 500
        ? (stripe.message ?? "Payment request failed")
        : isProduction
          ? "Payment service error"
          : (stripe.message ?? "Payment service error"),
    details: stripe.code ? { code: stripe.code } : undefined,
  };
}

/** Map any thrown value to a safe HTTP response shape. */
export function resolveApiError(err: unknown): ResolvedApiError {
  if (isClaudeCapacityError(err)) {
    return {
      status: 503,
      message: err.message,
      details: {
        code: err.code,
        retryAfterSeconds: err.retryAfterSeconds,
        jobId: err.jobId,
        kind: err.kind,
      },
      retryAfterSeconds: err.retryAfterSeconds,
    };
  }

  if (err instanceof AzureSpeechNotConfiguredError) {
    return { status: 503, message: "Speech service is not configured" };
  }

  if (err instanceof AzureSpeechRequestError) {
    return {
      status: 502,
      message: isProduction ? "Speech service request failed" : err.message,
    };
  }

  if (isAppError(err)) {
    return {
      status: err.status,
      message: err.exposeMessage || !isProduction ? err.message : "Internal server error",
      details:
        err.code || err.details
          ? { ...(err.details ?? {}), ...(err.code ? { code: err.code } : {}) }
          : undefined,
    };
  }

  if (err instanceof ZodError) {
    return {
      status: 400,
      message: "Validation failed",
      details: { issues: err.issues },
    };
  }

  const pgResolved = resolvePgError(err);
  if (pgResolved) return pgResolved;

  const stripeResolved = resolveStripeError(err);
  if (stripeResolved) return stripeResolved;

  const message = err instanceof Error ? err.message : "Internal server error";
  return {
    status: 500,
    message: isProduction ? "Internal server error" : message,
  };
}

/** Write a resolved error to the response using the standard envelope. */
export function sendResolvedError(res: Response, resolved: ResolvedApiError): void {
  if (resolved.retryAfterSeconds != null) {
    res.setHeader("Retry-After", String(resolved.retryAfterSeconds));
  }
  sendError(res, resolved.status, resolved.message, resolved.details);
}
