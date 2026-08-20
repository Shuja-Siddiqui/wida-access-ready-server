// Central server configuration — all env vars live here, nowhere else.
// Every other server file imports from this module instead of reading process.env directly.

export const config = {
  // ── Runtime ───────────────────────────────────────────────────────────────
  port: Number(process.env.PORT ?? 8080),
  nodeEnv: process.env.NODE_ENV ?? "development",
  logLevel: process.env.LOG_LEVEL ?? "info",

  // ── File logging + retention ────────────────────────────────────────────
  // Logs are rotated daily to disk and auto-deleted after `retentionDays`
  // by a node-cron job (see src/lib/logCleanup.ts).
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
} as const;

export type Config = typeof config;
