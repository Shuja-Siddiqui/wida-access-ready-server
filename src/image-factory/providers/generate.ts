/**
 * Unified Image Factory generation — HF cloud preferred, FLUX sidecar fallback.
 */

import { imageFactoryConfig } from "../config";
import { generateViaFluxSidecar, type FluxGenerateOptions } from "./flux-sidecar";
import { generateViaHfInference, isHfInferenceConfigured, type HfGenerateOptions } from "./hf-inference";

export type GenerateImageOptions = FluxGenerateOptions & HfGenerateOptions;

export interface GenerateImageResult {
  image: string;
  width: number;
  height: number;
  seed?: number;
  numInferenceSteps: number;
  source: "hf-inference" | "flux-sidecar";
  model?: string;
}

export async function generateImageFromPrompt(
  prompt: string,
  options: GenerateImageOptions = {},
): Promise<GenerateImageResult> {
  if (isHfInferenceConfigured()) {
    const result = await generateViaHfInference(prompt, options);
    return {
      image: result.image,
      width: result.width,
      height: result.height,
      seed: result.seed,
      numInferenceSteps: result.numInferenceSteps,
      source: "hf-inference",
      model: result.model,
    };
  }

  if (imageFactoryConfig.flux.sidecarUrl) {
    const result = await generateViaFluxSidecar(prompt, options);
    return {
      image: result.image,
      width: result.width,
      height: result.height,
      seed: result.seed,
      numInferenceSteps: result.numInferenceSteps,
      source: "flux-sidecar",
      model: "black-forest-labs/FLUX.1-schnell",
    };
  }

  throw new Error(
    "No image generator configured. Set HF_TOKEN or run the FLUX sidecar.",
  );
}
