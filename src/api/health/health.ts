import type { IRouter } from "express";
import { createApiRouter } from "../../lib/http/create-api-router";
import { HealthCheckResponse } from "../../generated";
import { sendSuccess } from "../../lib/http/api-response";

const router: IRouter = createApiRouter();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  sendSuccess(res, data);
});

export default router;
