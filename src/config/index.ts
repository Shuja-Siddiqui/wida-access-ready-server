// Central server configuration — all env vars live here, nowhere else.
// Every other server file imports from this module instead of reading process.env directly.

import dotenv from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ESM hoists imports above index.ts dotenv.config(), so load .env here before reading process.env.
(function loadEnvFile() {
  const candidates = [
    path.join(process.cwd(), ".env"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env"),
  ];
  for (const envPath of candidates) {
    if (existsSync(envPath)) {
      dotenv.config({ path: envPath, override: true });
      return;
    }
  }
  dotenv.config();
})();

function envStr(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}

export const config = {
  // ── Runtime ───────────────────────────────────────────────────────────────
  port: Number(process.env.PORT ?? 8080),
  nodeEnv: process.env.NODE_ENV ?? "development",
  logLevel: process.env.LOG_LEVEL ?? "info",

  // ── File logging + retention ────────────────────────────────────────────
  // Logs are rotated daily to disk and auto-deleted after `retentionDays`
  // by a node-cron job (see src/lib/jobs/logCleanup.ts).
  logging: {
    dir: process.env.LOG_DIR ?? "logs",
    retentionDays: Number(process.env.LOG_RETENTION_DAYS ?? 20),
  },

  // ── App ───────────────────────────────────────────────────────────────────
  // Canonical public URL (e.g. https://accessready.app). Used to build reset
  // links when a request host header is not available or not trusted.
  appUrl: process.env.APP_URL ?? "",

  // ── Database ─────────────────────────────────────────────────────────────
  database: {
    url: process.env.DATABASE_URL ?? "",
  },

  // ── Sessions ─────────────────────────────────────────────────────────────
  session: {
    // Used for signing any server-side session cookies if added in future.
    secret: process.env.SESSION_SECRET ?? "change-me-in-production",
  },

  // ── Google OAuth ─────────────────────────────────────────────────────────
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    // Optional hard-coded redirect URI override; otherwise derived from request.
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
  },

  // ── Anthropic / AI ────────────────────────────────────────────────────────
  anthropic: {
    // Prefer the direct ANTHROPIC_API_KEY (hits api.anthropic.com) when it is
    // present — it is a real secret that always works. Fall back to the Replit
    // AI Integrations proxy only when no direct key is available, because the
    // proxy returns 404 unless the Anthropic integration is explicitly connected
    // in the Replit workspace settings.
    baseUrl: process.env.ANTHROPIC_API_KEY
      ? ""   // direct key → no proxy, hit api.anthropic.com
      : (process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL ?? ""),
    apiKey:
      process.env.ANTHROPIC_API_KEY ??
      process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ??
      "placeholder",
    model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5",
    // Separate model for the cheap vision-description step (Step 1 of object-detect).
    // Defaults to Haiku — it only lists 8 nouns so Sonnet quality is not needed.
    visionModel: process.env.ANTHROPIC_VISION_MODEL ?? "claude-haiku-4-5",
    /**
     * In-process FIFO. Caps concurrent Anthropic calls; extra work waits.
     * Saturated / wait-timeout throw ClaudeCapacityError (503) — never silent drop.
     */
    queue: {
      maxConcurrent: Math.max(1, Number(process.env.CLAUDE_MAX_CONCURRENT ?? 24)),
      maxQueued: Math.max(1, Number(process.env.CLAUDE_MAX_QUEUED ?? 512)),
      /** Must stay under nginx proxy_read_timeout (180s). */
      waitTimeoutMs: Math.max(5_000, Number(process.env.CLAUDE_QUEUE_WAIT_MS ?? 150_000)),
      retryMax: Math.max(1, Number(process.env.CLAUDE_RETRY_MAX ?? 3)),
      retryBaseMs: Math.max(100, Number(process.env.CLAUDE_RETRY_BASE_MS ?? 400)),
    },
  },

  // ── Pixabay (free image search for listening image_grid questions) ──────
  pixabay: {
    apiKey: process.env.PIXABAY_API_KEY ?? "",
  },

  // ── Azure Speech (STT/TTS) ───────────────────────────────────────────────
  azureSpeech: {
    key: process.env.AZURE_SPEECH_KEY ?? "",
    region: process.env.AZURE_SPEECH_REGION ?? "",
    // Optional custom endpoint (e.g. https://my-resource.cognitiveservices.azure.com).
    // When set, it overrides the default region-derived TTS and STT base URLs.
    endpoint: process.env.AZURE_SPEECH_ENDPOINT ?? "",
  },

  // ── Email / SMTP ─────────────────────────────────────────────────────────
  email: {
    from: process.env.EMAIL_FROM ?? "ACCESS Ready <noreply@accessready.app>",
    support: process.env.SUPPORT_EMAIL ?? "",
    smtpHost: process.env.SMTP_HOST ?? "",
    smtpPort: Number(process.env.SMTP_PORT ?? 587),
    smtpSecure: process.env.SMTP_SECURE === "true",
    // Set SMTP_TLS_REJECT_UNAUTHORIZED=false for self-signed / corporate certs.
    smtpTlsRejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false",
    smtpUser: process.env.SMTP_USER ?? "",
    smtpPass: process.env.SMTP_PASS ?? "", // optional — omit for unauthenticated relay
  },

  // ── Grounding DINO sidecar ──────────────────────────────────────────────
  dino: {
    sidecarUrl: (process.env.DINO_SIDECAR_URL ?? "http://localhost:8000").replace(/\/$/, ""),
    sidecarToken: process.env.DINO_SIDECAR_TOKEN ?? "",
  },

  // ── FLUX.1 Schnell sidecar (local image generation) ─────────────────────
  flux: {
    sidecarUrl: (process.env.FLUX_SIDECAR_URL ?? "http://localhost:8001").replace(/\/$/, ""),
    sidecarToken: process.env.FLUX_SIDECAR_TOKEN ?? "",
  },

  // ── Hugging Face Inference (cloud text-to-image; free tier with HF_TOKEN) ─
  huggingface: {
    inferenceToken: envStr("HF_TOKEN", "HUGGINGFACE_API_TOKEN", "HUGGINGFACE_HUB_TOKEN"),
    /** FLUX Schnell works well on the free Inference Providers quota. */
    imageModel: process.env.HF_IMAGE_MODEL ?? "black-forest-labs/FLUX.1-schnell",
    /** "auto" picks fal-ai for FLUX Schnell; hf-inference is deprecated for many models */
    imageProvider: process.env.HF_IMAGE_PROVIDER ?? "auto",
    defaultWidth: Number(process.env.HF_IMAGE_WIDTH ?? 768),
    defaultHeight: Number(process.env.HF_IMAGE_HEIGHT ?? 512),
    maxSide: Number(process.env.HF_IMAGE_MAX_SIDE ?? 1024),
    inferenceSteps: Number(process.env.HF_IMAGE_STEPS ?? 4),
    /** FLUX Schnell uses 0; SD models typically use 7–8. */
    guidanceScale: Number(process.env.HF_IMAGE_GUIDANCE_SCALE ?? 0),
  },

  // ── Per-student AI rate limit (sessions, scoring, speech, agent) ────────
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED !== "false",
    /** Rolling window length. */
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    /** Max AI/speech calls per student per window. */
    aiMaxPerWindow: Number(process.env.RATE_LIMIT_AI_MAX ?? 30),
    /** memory = one process; postgres = shared (default); redis = set REDIS_URL. */
    store: (process.env.RATE_LIMIT_STORE ?? "postgres") as "memory" | "postgres" | "redis",
    redisUrl: process.env.REDIS_URL ?? "",
    /** When true, reject requests if the rate-limit store is unavailable. */
    failClosed:
      process.env.RATE_LIMIT_FAIL_CLOSED === "true" ||
      (process.env.NODE_ENV === "production" && process.env.RATE_LIMIT_FAIL_CLOSED !== "false"),
    /** Auth endpoints (login, register, password reset) per IP. */
    authMax: Number(process.env.RATE_LIMIT_AUTH_MAX ?? 20),
    authWindowMs: Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS ?? 900_000),
    /** Contact form submissions per IP. */
    contactMax: Number(process.env.RATE_LIMIT_CONTACT_MAX ?? 5),
    contactWindowMs: Number(process.env.RATE_LIMIT_CONTACT_WINDOW_MS ?? 3_600_000),
    /** DINO / vision scan endpoints per IP (logged-in users + cron bypass via internal key). */
    imageOpsMax: Number(process.env.RATE_LIMIT_IMAGE_OPS_MAX ?? 30),
    imageOpsWindowMs: Number(process.env.RATE_LIMIT_IMAGE_OPS_WINDOW_MS ?? 60_000),
  },

  // ── Internal cron / background jobs ─────────────────────────────────────
  internalJob: {
    /** Shared secret for X-Internal-Job-Key header. Leave empty to disable. */
    apiKey: envStr("INTERNAL_JOB_API_KEY"),
  },

  /** In-process Image Factory cron (prompt → HF → DINO → library). */
  imageFactoryCron: {
    enabled: process.env.IMAGE_FACTORY_CRON_ENABLED === "true",
    /** Cron expression — default every 30 minutes. */
    schedule: process.env.IMAGE_FACTORY_CRON_SCHEDULE ?? "*/30 * * * *",
    /** Full pipeline runs per tick. Default 4 = one general image per SF (ela, math, science, social_studies). */
    batchSize: Math.max(1, Number(process.env.IMAGE_FACTORY_CRON_BATCH_SIZE ?? 4)),
    /** Pause between runs in a batch (ms). */
    delayBetweenMs: Math.max(0, Number(process.env.IMAGE_FACTORY_CRON_DELAY_MS ?? 10_000)),
    /** Optional pin: ela | math | science | social_studies */
    subject: envStr("IMAGE_FACTORY_CRON_SUBJECT"),
    /** Optional pin: 1–6 (unset = auto-pick with subject). */
    level: (() => {
      const n = Number(process.env.IMAGE_FACTORY_CRON_LEVEL ?? 0);
      return n >= 1 && n <= 6 ? n : undefined;
    })(),
    /** Run one batch immediately when the server starts. */
    runOnStartup: process.env.IMAGE_FACTORY_CRON_RUN_ON_STARTUP !== "false",
  },

  // ── HTTP security ─────────────────────────────────────────────────────────
  security: {
    /** Comma-separated allowed CORS origins (e.g. https://app.example.com). */
    corsAllowedOrigins: envStr("CORS_ALLOWED_ORIGINS")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },
} as const;

export type Config = typeof config;
