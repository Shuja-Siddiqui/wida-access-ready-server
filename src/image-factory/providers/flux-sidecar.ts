/**
 * FLUX.1 Schnell sidecar — Image Factory local fallback provider.
 */

import { imageFactoryConfig } from "../config";
import { logger } from "../../config/logger";

const SIDECAR_TIMEOUT_MS = 600_000;

function sidecarUrl(): string {
  return imageFactoryConfig.flux.sidecarUrl;
}

function sidecarHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers = { ...extra };
  if (imageFactoryConfig.flux.sidecarToken) {
    headers.Authorization = `Bearer ${imageFactoryConfig.flux.sidecarToken}`;
  }
  return headers;
}

export interface FluxGenerateOptions {
  width?: number;
  height?: number;
  seed?: number;
  numInferenceSteps?: number;
}

export interface FluxGenerateResult {
  image: string;
  width: number;
  height: number;
  seed: number;
  numInferenceSteps: number;
}

export async function isFluxSidecarReady(): Promise<boolean> {
  try {
    const res = await fetch(`${sidecarUrl()}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    const json = (await res.json()) as { ready?: boolean };
    return json.ready === true;
  } catch {
    return false;
  }
}

export async function generateViaFluxSidecar(
  prompt: string,
  options: FluxGenerateOptions = {},
): Promise<FluxGenerateResult> {
  const ready = await isFluxSidecarReady();
  if (!ready) {
    throw new Error(
      `FLUX sidecar is not ready at ${sidecarUrl()}. Start flux-schnell-svc and retry.`,
    );
  }

  logger.info(
    { width: options.width, height: options.height, seed: options.seed },
    "image-factory: flux sidecar generate",
  );

  const res = await fetch(`${sidecarUrl()}/generate`, {
    method: "POST",
    headers: sidecarHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      prompt,
      width: options.width,
      height: options.height,
      seed: options.seed,
      num_inference_steps: options.numInferenceSteps,
    }),
    signal: AbortSignal.timeout(SIDECAR_TIMEOUT_MS),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`FLUX sidecar /generate failed (${res.status}): ${txt}`);
  }

  const data = (await res.json()) as {
    image: string;
    width: number;
    height: number;
    seed: number;
    num_inference_steps: number;
  };

  return {
    image: data.image,
    width: data.width,
    height: data.height,
    seed: data.seed,
    numInferenceSteps: data.num_inference_steps,
  };
}
