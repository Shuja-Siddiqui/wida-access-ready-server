/**
 * Plain-text API access logs (one line per request) for operations and compliance.
 * Does not alter routing or auth — only appends to daily files under config.logging.dir.
 * Files share the same retention window as pino-roll logs (see logCleanup.ts).
 */

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { config } from "../../config/index";

function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Human-facing stakeholder bucket for log files and grep. */
export function resolveStakeholderLabel(req: Request): string {
  const auth = req.auth;
  if (!auth) return "public";
  if (auth.role) return auth.role;
  return auth.userType;
}

function logPath(suffix: string, day: string): string {
  return path.join(config.logging.dir, `api-access-${suffix}-${day}.log`);
}

async function appendLine(filePath: string, line: string): Promise<void> {
  await mkdir(config.logging.dir, { recursive: true });
  await appendFile(filePath, line, "utf8");
}

/**
 * Registers a `finish` handler so each HTTP response produces readable access lines.
 * Safe to mount globally; failures are swallowed so responses are never affected.
 */
export function apiAccessFileLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  const pathOnly = (req.originalUrl ?? req.url ?? "").split("?")[0] || "/";

  res.on("finish", () => {
    const run = async () => {
      const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
      const ts = new Date().toISOString();
      const stakeholder = resolveStakeholderLabel(req);
      const auth = req.auth;
      const actor = auth
        ? ` userId=${auth.userId} profileId=${auth.id} userType=${auth.userType}`
        : "";
      const reqId = req.id ?? "-";
      const line =
        `[${ts}] stakeholder=${stakeholder}${actor} ${req.method} ${pathOnly} ${res.statusCode} ${elapsedMs.toFixed(1)}ms reqId=${reqId}\n`;

      const day = utcDay();
      await appendLine(logPath("all", day), line);
      await appendLine(logPath(`stakeholder-${stakeholder}`, day), line);
    };

    void run().catch(() => {
      // Intentionally silent — logging must never break the API.
    });
  });

  next();
}