/**
 * Library pipeline for Image Factory outputs — seeds from job metadata, no full vision describe.
 * Runs Grounding DINO without crop-verify (illustrations often fail Haiku YES/NO checks).
 */

import { logger } from "../../config/logger";
import { runDetection, type NormalisedDetection } from "../../api/images/detect-core";
import type { PipelineResult, SupportedMediaType } from "./image-pipeline";

const ALWAYS_CHECK = ["pencil", "pen", "marker", "eraser", "book"];

export interface FactoryPipelineSeed {
  suggestedObjects: string[];
  description: string;
  imageConcept: string | null;
  tier3Vocabulary?: string[];
}

function dedupeLower(labels: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    const t = raw.trim().toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Tier-3 words that are short concrete nouns — safe extra DINO queries. */
function tier3AsDinoHints(words: string[] | undefined): string[] {
  if (!words?.length) return [];
  return words.filter((w) => {
    const t = w.trim().toLowerCase();
    return t.length >= 2 && t.length <= 24 && /^[a-z][a-z\s-]*$/.test(t) && t.split(/\s+/).length <= 3;
  });
}

function buildDinoLabels(seed: FactoryPipelineSeed): string[] {
  return dedupeLower([
    ...seed.suggestedObjects,
    ...tier3AsDinoHints(seed.tier3Vocabulary),
    ...ALWAYS_CHECK,
  ]);
}

export async function runFactorySeededPipeline(
  image: string,
  _base64Data: string,
  _mediaType: SupportedMediaType,
  seed: FactoryPipelineSeed,
): Promise<PipelineResult> {
  const candidates = dedupeLower(seed.suggestedObjects);
  if (candidates.length === 0) {
    throw new Error("Job has no suggested objects for DINO");
  }

  const dinoLabels = buildDinoLabels(seed);
  logger.info({ dinoLabels, source: "factory-seed" }, "factory-pipeline: DINO detect");

  let detections: NormalisedDetection[] = [];
  let model: PipelineResult["detectionResults"]["model"] = "grounding_dino";

  try {
    const dinoResult = await runDetection(image, dinoLabels, { verify: false });
    detections = dinoResult.detections;
    model = dinoResult.model;
  } catch (err) {
    logger.warn({ err }, "factory-pipeline: DINO unavailable");
    throw err instanceof Error ? err : new Error("DINO detection failed");
  }

  const confirmedTags = dedupeLower(detections.map((d) => d.label));

  const description = seed.description.trim()
    || seed.imageConcept
    || candidates.join(", ");

  return {
    candidates,
    confirmedTags,
    description,
    imageConcept: seed.imageConcept,
    detectionResults: { detections, model },
    suggestedTopicIds: [],
  };
}
