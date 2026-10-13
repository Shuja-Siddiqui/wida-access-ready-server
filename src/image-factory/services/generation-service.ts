import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { imageGenerationJobsTable } from "../../../db/schema/image_generation";
import {
  generateImageFromPrompt,
  type GenerateImageOptions,
  type GenerateImageResult,
} from "../providers/generate";
import { isFluxSidecarReady } from "../providers/flux-sidecar";
import { isHfInferenceConfigured } from "../providers/hf-inference";

export type { GenerateImageResult, GenerateImageOptions };

export async function getGenerationBackendStatus() {
  const hfConfigured = isHfInferenceConfigured();
  const fluxReady = hfConfigured ? false : await isFluxSidecarReady();

  return {
    hfInferenceConfigured: hfConfigured,
    fluxSidecarReady: fluxReady,
    activeSource: hfConfigured ? "hf-inference" as const : fluxReady ? "flux-sidecar" as const : null,
  };
}

export async function generateImageAndLinkJob(
  prompt: string,
  options: GenerateImageOptions,
  jobId?: string,
): Promise<GenerateImageResult> {
  const result = await generateImageFromPrompt(prompt, options);

  if (jobId) {
    await db
      .update(imageGenerationJobsTable)
      .set({ status: "generated", hfPrompt: prompt })
      .where(eq(imageGenerationJobsTable.id, jobId));
  }

  return result;
}
