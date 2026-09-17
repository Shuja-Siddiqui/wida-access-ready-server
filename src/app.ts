import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./api";
import { logger } from "./config/logger";
import { WebhookHandlers } from "./lib/billing/webhookHandlers";

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

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(cookieParser());

app.use("/api", router);

// Global error handler — catches any unhandled async throws and returns
// a clean JSON error instead of Express's default HTML response.
app.use(
  (
    err: unknown,
    req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction,
  ) => {
    const message = err instanceof Error ? err.message : "Internal server error";
    req.log?.error({ err }, "Unhandled error");
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: message });
    }
  },
);

export default app;
