import type { CorsOptions } from "cors";
import { config } from "../../config/index";

/** Build CORS options from config — restrictive in production, permissive in dev. */
export function buildCorsOptions(): CorsOptions {
  const configured = config.security.corsAllowedOrigins;

  if (configured.length > 0) {
    return {
      origin: configured,
      credentials: true,
    };
  }

  if (config.nodeEnv === "development") {
    return {
      origin: true,
      credentials: true,
    };
  }

  if (config.appUrl) {
    return {
      origin: [config.appUrl],
      credentials: true,
    };
  }

  return {
    origin: false,
    credentials: true,
  };
}
