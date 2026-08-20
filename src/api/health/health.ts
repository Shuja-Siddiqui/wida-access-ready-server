import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "../../generated";
import { sendSuccess } from "../../lib/api-response";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  sendSuccess(res, data);
});

export default router;
