/**
 * Process-wide Claude request queue.
 *
 * Caps in-flight Anthropic calls so a class stampede waits instead of
 * opening hundreds of connections. Every job is logged. Nothing is
 * discarded without a typed error (saturated queue or wait timeout).
 */

import { config } from "../../config";
import { logger } from "../../config/logger";

export type ClaudeQueueFailCode =
  | "QUEUE_SATURATED"
  | "QUEUE_WAIT_TIMEOUT"
  | "CLAUDE_RETRY_EXHAUSTED";

export class ClaudeCapacityError extends Error {
  readonly code: ClaudeQueueFailCode;
  readonly retryAfterSeconds: number;
  readonly jobId: string | null;
  readonly kind: string;

  constructor(opts: {
    code: ClaudeQueueFailCode;
    message: string;
    retryAfterSeconds: number;
    jobId?: string | null;
    kind: string;
  }) {
    super(opts.message);
    this.name = "ClaudeCapacityError";
    this.code = opts.code;
    this.retryAfterSeconds = opts.retryAfterSeconds;
    this.jobId = opts.jobId ?? null;
    this.kind = opts.kind;
  }
}

export function isClaudeCapacityError(err: unknown): err is ClaudeCapacityError {
  return err instanceof ClaudeCapacityError;
}

export function rethrowIfClaudeCapacity(err: unknown): void {
  if (isClaudeCapacityError(err)) throw err;
}

export type ClaudeQueueSnapshot = {
  inFlight: number;
  waiting: number;
  maxConcurrent: number;
  maxQueued: number;
  waitTimeoutMs: number;
};

type QueueJob<T> = {
  id: string;
  kind: string;
  enqueuedAt: number;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
  waitTimer: ReturnType<typeof setTimeout>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function anthropicHttpStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const o = err as { status?: unknown; statusCode?: unknown };
  if (typeof o.status === "number") return o.status;
  if (typeof o.statusCode === "number") return o.statusCode;
  return undefined;
}

function retryAfterMs(err: unknown, fallbackMs: number): number {
  if (!err || typeof err !== "object") return fallbackMs;
  const headers = (err as { headers?: unknown }).headers;
  let raw: string | undefined;
  if (headers && typeof headers === "object") {
    const h = headers as { get?: (k: string) => string | null; "retry-after"?: string; "Retry-After"?: string };
    raw = h.get?.("retry-after") ?? h["retry-after"] ?? h["Retry-After"];
  }
  if (!raw) return fallbackMs;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(30_000, seconds * 1000);
  return fallbackMs;
}

function isRetryableClaudeError(err: unknown): boolean {
  const status = anthropicHttpStatus(err);
  if (status === 429 || status === 529 || status === 503 || status === 502) return true;
  if (err && typeof err === "object") {
    const name = (err as { name?: string }).name;
    const code = (err as { code?: string }).code;
    if (name === "APIConnectionError" || code === "ECONNRESET" || code === "ETIMEDOUT") return true;
  }
  return false;
}

class ClaudeRequestQueue {
  private waiting: QueueJob<unknown>[] = [];
  private inFlight = 0;
  private seq = 0;

  snapshot(): ClaudeQueueSnapshot {
    const q = config.anthropic.queue;
    return {
      inFlight: this.inFlight,
      waiting: this.waiting.length,
      maxConcurrent: q.maxConcurrent,
      maxQueued: q.maxQueued,
      waitTimeoutMs: q.waitTimeoutMs,
    };
  }

  enqueue<T>(kind: string, run: () => Promise<T>): Promise<T> {
    const q = config.anthropic.queue;
    const snap = this.snapshot();
    if (this.waiting.length >= q.maxQueued) {
      logger.error(
        {
          stage: "claude-queue",
          code: "QUEUE_SATURATED",
          kind,
          ...snap,
        },
        "Claude queue saturated — request rejected (not dropped silently)",
      );
      return Promise.reject(
        new ClaudeCapacityError({
          code: "QUEUE_SATURATED",
          kind,
          retryAfterSeconds: Math.max(2, Math.ceil(q.waitTimeoutMs / 4000)),
          message: "Practice AI is at capacity. Try again in a few seconds.",
        }),
      );
    }

    return new Promise<T>((resolve, reject) => {
      this.seq += 1;
      const id = `cq-${this.seq}`;
      const job: QueueJob<T> = {
        id,
        kind,
        enqueuedAt: Date.now(),
        run,
        resolve,
        reject,
        waitTimer: setTimeout(() => {
          const idx = this.waiting.indexOf(job as QueueJob<unknown>);
          if (idx < 0) return;
          this.waiting.splice(idx, 1);
          logger.error(
            {
              stage: "claude-queue",
              code: "QUEUE_WAIT_TIMEOUT",
              jobId: id,
              kind,
              waitedMs: Date.now() - job.enqueuedAt,
              ...this.snapshot(),
            },
            "Claude queue wait timed out — request rejected (not dropped silently)",
          );
          reject(
            new ClaudeCapacityError({
              code: "QUEUE_WAIT_TIMEOUT",
              kind,
              jobId: id,
              retryAfterSeconds: 5,
              message: "Practice AI is busy. Wait a moment and try again.",
            }),
          );
        }, q.waitTimeoutMs),
      };
      this.waiting.push(job as QueueJob<unknown>);
      logger.info(
        {
          stage: "claude-queue",
          event: "enqueue",
          jobId: id,
          kind,
          waitMsBudget: q.waitTimeoutMs,
          ...this.snapshot(),
        },
        "Claude queue enqueue",
      );
      this.pump();
    });
  }

  private pump(): void {
    const max = config.anthropic.queue.maxConcurrent;
    while (this.inFlight < max && this.waiting.length > 0) {
      const job = this.waiting.shift();
      if (!job) return;
      clearTimeout(job.waitTimer);
      this.inFlight += 1;
      logger.info(
        {
          stage: "claude-queue",
          event: "start",
          jobId: job.id,
          kind: job.kind,
          queuedMs: Date.now() - job.enqueuedAt,
          ...this.snapshot(),
        },
        "Claude queue start",
      );
      void this.execute(job);
    }
  }

  private async execute(job: QueueJob<unknown>): Promise<void> {
    const started = Date.now();
    try {
      const { result, attempts } = await this.runWithRetry(job);
      logger.info(
        {
          stage: "claude-queue",
          event: "complete",
          jobId: job.id,
          kind: job.kind,
          attempts,
          queuedMs: started - job.enqueuedAt,
          callMs: Date.now() - started,
          ...this.snapshot(),
        },
        "Claude queue complete",
      );
      job.resolve(result);
    } catch (err) {
      logger.error(
        {
          err,
          stage: "claude-queue",
          event: "failed",
          jobId: job.id,
          kind: job.kind,
          queuedMs: started - job.enqueuedAt,
          callMs: Date.now() - started,
          httpStatus: anthropicHttpStatus(err) ?? null,
          ...this.snapshot(),
        },
        "Claude queue job failed",
      );
      job.reject(err);
    } finally {
      this.inFlight = Math.max(0, this.inFlight - 1);
      this.pump();
    }
  }

  private async runWithRetry(job: QueueJob<unknown>): Promise<{ result: unknown; attempts: number }> {
    const retryMax = config.anthropic.queue.retryMax;
    const baseMs = config.anthropic.queue.retryBaseMs;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= retryMax; attempt++) {
      try {
        const result = await job.run();
        return { result, attempts: attempt };
      } catch (err) {
        lastErr = err;
        const status = anthropicHttpStatus(err);
        const retryable = isRetryableClaudeError(err) && attempt < retryMax;
        if (!retryable) {
          if (isRetryableClaudeError(err)) {
            throw new ClaudeCapacityError({
              code: "CLAUDE_RETRY_EXHAUSTED",
              kind: job.kind,
              jobId: job.id,
              retryAfterSeconds: Math.max(2, Math.ceil(retryAfterMs(err, baseMs * 4) / 1000)),
              message: "Practice AI is busy. Wait a moment and try again.",
            });
          }
          throw err;
        }
        const backoff = retryAfterMs(err, baseMs * 2 ** (attempt - 1));
        const jitter = Math.floor(Math.random() * 200);
        const waitMs = Math.min(20_000, backoff + jitter);
        logger.warn(
          {
            stage: "claude-queue",
            event: "retry",
            jobId: job.id,
            kind: job.kind,
            attempt,
            retryMax,
            httpStatus: status ?? null,
            backoffMs: waitMs,
          },
          "Claude retry after overload or connection error",
        );
        await sleep(waitMs);
      }
    }
    throw lastErr;
  }
}

const queue = new ClaudeRequestQueue();

/** Snapshot for ops logs. */
export function getClaudeQueueSnapshot(): ClaudeQueueSnapshot {
  return queue.snapshot();
}

/**
 * Run one Anthropic call through the shared queue.
 * `kind` is a short label (item-feedback, listening-content, vision-verify, …).
 */
export function runClaudeJob<T>(kind: string, run: () => Promise<T>): Promise<T> {
  return queue.enqueue(kind, run);
}
