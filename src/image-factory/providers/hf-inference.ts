/**
 * Hugging Face Inference Providers — Image Factory cloud text-to-image.
 */

import { imageFactoryConfig } from "../config";
import { logger } from "../../config/logger";

const INFERENCE_TIMEOUT_MS = 300_000;
const MAX_RETRIES = 8;

export interface HfGenerateOptions {
  width?: number;
  height?: number;
  seed?: number;
  numInferenceSteps?: number;
  guidanceScale?: number;
  negativePrompt?: string;
}

export interface HfGenerateResult {
  image: string;
  width: number;
  height: number;
  seed?: number;
  numInferenceSteps: number;
  model: string;
  provider: string;
}

interface InferenceRoute {
  url: string;
  provider: string;
  buildBody: (prompt: string, opts: {
    width: number;
    height: number;
    numInferenceSteps: number;
    guidanceScale: number;
    seed?: number;
    negativePrompt?: string;
  }) => Record<string, unknown>;
  parseSuccess: (
    res: Response,
    fallback: { width: number; height: number; seed?: number; numInferenceSteps: number },
  ) => Promise<HfGenerateResult>;
}

function roundDim(value: number, max: number): number {
  return Math.max(8, Math.min(max, Math.floor(value / 8) * 8));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bufferToDataUri(buffer: Buffer, mime: string): Promise<string> {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function downloadImageAsDataUri(url: string): Promise<{ dataUri: string; mime: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`Failed to download generated image (${res.status})`);
  }
  const mime = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
  const buffer = Buffer.from(await res.arrayBuffer());
  return { dataUri: await bufferToDataUri(buffer, mime), mime };
}

async function parseErrorBody(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { error?: string; detail?: unknown };
    if (json.error) return json.error;
    if (json.detail) return JSON.stringify(json.detail).slice(0, 500);
  } catch {
    // keep raw text
  }
  return text.slice(0, 500) || res.statusText;
}

function resolveRoutes(model: string, provider: string): InferenceRoute[] {
  const routes: InferenceRoute[] = [];
  const useFal =
    provider === "fal-ai" ||
    (provider === "auto" && model.toLowerCase().includes("flux.1-schnell"));

  if (useFal) {
    routes.push({
      url: "https://router.huggingface.co/fal-ai/fal-ai/flux/schnell",
      provider: "fal-ai",
      buildBody: (prompt, opts) => ({
        prompt,
        image_size: { width: opts.width, height: opts.height },
        num_inference_steps: opts.numInferenceSteps,
        ...(opts.seed != null ? { seed: opts.seed } : {}),
      }),
      parseSuccess: async (res, fallback) => {
        const json = (await res.json()) as {
          images?: Array<{ url: string; width?: number; height?: number }>;
          seed?: number;
        };
        const img = json.images?.[0];
        if (!img?.url) throw new Error("fal-ai returned no image URL");
        const { dataUri } = await downloadImageAsDataUri(img.url);
        return {
          image: dataUri,
          width: img.width ?? fallback.width,
          height: img.height ?? fallback.height,
          seed: json.seed ?? fallback.seed,
          numInferenceSteps: fallback.numInferenceSteps,
          model,
          provider: "fal-ai",
        };
      },
    });
  }

  if (provider !== "fal-ai") {
    const encoded = encodeURIComponent(model);
    const legacyUrls = provider && provider !== "auto"
      ? [`https://router.huggingface.co/${provider}/models/${encoded}`]
      : [
          `https://router.huggingface.co/hf-inference/models/${encoded}`,
          `https://api-inference.huggingface.co/models/${encoded}`,
        ];

    for (const url of legacyUrls) {
      routes.push({
        url,
        provider: provider === "auto" ? "hf-inference" : provider,
        buildBody: (prompt, opts) => ({
          inputs: prompt,
          parameters: {
            width: opts.width,
            height: opts.height,
            num_inference_steps: opts.numInferenceSteps,
            guidance_scale: opts.guidanceScale,
            ...(opts.seed != null ? { seed: opts.seed } : {}),
            ...(opts.negativePrompt ? { negative_prompt: opts.negativePrompt } : {}),
          },
        }),
        parseSuccess: async (res, fallback) => {
          const contentType = res.headers.get("content-type") ?? "image/png";
          const buffer = Buffer.from(await res.arrayBuffer());
          if (!contentType.startsWith("image/")) {
            throw new Error(`HF returned non-image (${contentType})`);
          }
          const mime = contentType.split(";")[0].trim();
          return {
            image: await bufferToDataUri(buffer, mime),
            width: fallback.width,
            height: fallback.height,
            seed: fallback.seed,
            numInferenceSteps: fallback.numInferenceSteps,
            model,
            provider: provider === "auto" ? "hf-inference" : provider,
          };
        },
      });
    }
  }

  return routes;
}

export function isHfInferenceConfigured(): boolean {
  return Boolean(imageFactoryConfig.huggingface.inferenceToken);
}

export async function generateViaHfInference(
  prompt: string,
  options: HfGenerateOptions = {},
): Promise<HfGenerateResult> {
  const token = imageFactoryConfig.huggingface.inferenceToken;
  if (!token) {
    throw new Error("HF_TOKEN is not configured in api-server/.env");
  }

  const { huggingface: hf } = imageFactoryConfig;
  const width = roundDim(options.width ?? hf.defaultWidth, hf.maxSide);
  const height = roundDim(options.height ?? hf.defaultHeight, hf.maxSide);
  const numInferenceSteps = options.numInferenceSteps ?? hf.inferenceSteps;
  const guidanceScale = options.guidanceScale ?? hf.guidanceScale;

  const routes = resolveRoutes(hf.imageModel, hf.imageProvider);
  if (routes.length === 0) {
    throw new Error(`No inference route for model ${hf.imageModel}`);
  }

  logger.info(
    { model: hf.imageModel, width, height, route: routes[0].url },
    "image-factory: hf inference generate",
  );

  let lastError = "HF Inference request failed";

  for (const route of routes) {
    const body = route.buildBody(prompt, {
      width,
      height,
      numInferenceSteps,
      guidanceScale,
      seed: options.seed,
      negativePrompt: options.negativePrompt,
    });

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetch(route.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS),
      });

      if (res.ok) {
        return route.parseSuccess(res, { width, height, seed: options.seed, numInferenceSteps });
      }

      if (res.status === 503 && attempt < MAX_RETRIES) {
        let waitMs = 15_000;
        try {
          const json = (await res.json()) as { estimated_time?: number };
          if (json.estimated_time != null) {
            waitMs = Math.min(120_000, Math.ceil(json.estimated_time * 1000) + 2000);
          }
        } catch {
          // default wait
        }
        await sleep(waitMs);
        continue;
      }

      lastError = await parseErrorBody(res);
      if (res.status === 404 || res.status === 410) break;
      throw new Error(`HF Inference failed (${res.status}): ${lastError}`);
    }
  }

  throw new Error(`HF Inference failed for ${hf.imageModel}: ${lastError}`);
}
