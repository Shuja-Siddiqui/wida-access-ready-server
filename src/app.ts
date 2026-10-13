import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./api";
import { logger } from "./config/logger";
import { WebhookHandlers } from "./lib/billing/webhookHandlers";
import { buildCorsOptions } from "./lib/security/cors";
import { resolveApiError, sendResolvedError } from "./lib/http/error-handler";
import { sendError } from "./lib/http/api-response";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Stripe webhook route MUST be registered before express.json() -- it needs
// the raw request body Buffer to verify the signature.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature" });
      return;
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      if (!Buffer.isBuffer(req.body)) {
        req.log.error("Stripe webhook body was not a Buffer -- check middleware order");
        res.status(500).json({ error: "Webhook processing error" });
        return;
      }
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (err) {
      req.log.error({ err }, "Stripe webhook processing failed");
      res.status(400).json({ error: "Webhook processing error" });
    }
  },
);

app.use(
  helmet({
    // Presigned S3 URLs and inline images may be loaded cross-origin.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(cookieParser());

app.use("/api", router);

// Unknown routes under /api — JSON envelope (not Express HTML).
app.use("/api", (_req, res) => {
  sendError(res, 404, "Not found");
});

// Global error handler — typed AppError, Zod, Claude capacity, and fallbacks.
app.use(
  (
    err: unknown,
    req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction,
  ) => {
    const resolved = resolveApiError(err);
    req.log?.error({ err, status: resolved.status, code: resolved.details?.code }, "API error");
    if (!res.headersSent) {
      sendResolvedError(res, resolved);
    }
  },
);

export default app;
