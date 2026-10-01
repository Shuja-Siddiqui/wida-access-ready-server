/**
 * Image Factory runtime config — HF + FLUX settings (super-admin image generation only).
 */
import { config } from "../config/index";

export const imageFactoryConfig = {
  huggingface: config.huggingface,
  flux: config.flux,
} as const;
