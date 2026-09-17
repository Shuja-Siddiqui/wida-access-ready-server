import path from "node:path";
import pino from "pino";
import { config } from "./index";

const isProduction = config.nodeEnv === "production";

// Logs are always written to disk (rotated daily via pino-roll) so that
// src/lib/jobs/logCleanup.ts has files to enforce the retention window against.
// In development we also pretty-print to the console for readability.
const fileTarget = {
  target: "pino-roll",
  options: {
    file: path.join(config.logging.dir, "app"),
    frequency: "daily",
    dateFormat: "yyyy-MM-dd",
    extension: ".log",
    mkdir: true,
  },
  level: config.logLevel,
};

export const logger = pino({
  level: config.logLevel,
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  transport: {
    targets: isProduction
      ? [fileTarget]
      : [
          { target: "pino-pretty", options: { colorize: true }, level: config.logLevel },
          fileTarget,
        ],
  },
});
