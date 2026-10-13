/**
 * AI-driven session mode for academic listening levels 1–2.
 * Chooses tap vs listen-and-read from framework + library image metadata.
 */

import { callClaude } from "./client";
import { CONTENT_KERNEL } from "./prompts/content/kernel";
import { LISTENING_L12_MODE_BLOCK } from "./prompts/content/listening-l12-mode";
import { frameworkPromptSlice } from "./standards";
import { serializeFrameworkTask, type FrameworkTask } from "./standards/2020";
import { kluSubjectPairingLine } from "../academic";
import { logger } from "../../config/logger";
import { dumpContentGenRequest } from "./dump-content-gen";

export type ListeningL12TapDelivery = "box_tap" | "text_choice";

export interface AcademicListeningL12ModeDecision {
  useTapMode: boolean;
  tapDelivery: ListeningL12TapDelivery;
  rationale?: string;
}

export async function decideAcademicListeningL12Mode(params: {
  framework: FrameworkTask;
  academicSubject: "math" | "science" | "social_studies" | "ela";
  subjectLabel: string;
  level: number;
  complexityInstruction: string;
  oralFormat: string;
  imageDescription: string;
  imageTags: string[];
  dinoDetectionCount: number;
  imageConcept?: string | null;
}): Promise<AcademicListeningL12ModeDecision> {
  const pairing = kluSubjectPairingLine(
    params.framework.key_language_use,
    params.academicSubject,
    params.subjectLabel,
  );

  const systemPrompt = [
    CONTENT_KERNEL,
    frameworkPromptSlice("2020"),
    LISTENING_L12_MODE_BLOCK,
    pairing,
    `Return ONLY JSON: { "use_tap_mode": boolean, "tap_delivery": "box_tap"|"text_choice", "rationale": string }`,
  ].join("\n\n");

  const userPrompt = JSON.stringify({
    domain:                  "listening",
    integer_level:           params.level,
    complexity_instruction:  params.complexityInstruction,
    oral_format:             params.oralFormat,
    framework:               serializeFrameworkTask(params.framework),
    academic_subject:        params.academicSubject,
    subject_label:           params.subjectLabel,
    image_description:       params.imageDescription,
    image_tags:              params.imageTags.slice(0, 12),
    dino_detection_count:    params.dinoDetectionCount,
    ...(params.imageConcept ? { image_concept: params.imageConcept } : {}),
    goal:                    "Decide use_tap_mode for this L1–2 listening session.",
  });

  dumpContentGenRequest("academic-listening-l12-mode", systemPrompt, userPrompt);

  try {
    const result = (await callClaude(systemPrompt, userPrompt, 400)) as Record<string, unknown>;
    const useTapMode = Boolean(result.use_tap_mode);
    const tapDelivery: ListeningL12TapDelivery =
      result.tap_delivery === "text_choice" ? "text_choice" : "box_tap";
    const rationale = typeof result.rationale === "string" ? result.rationale : undefined;

    logger.info(
      {
        useTapMode,
        tapDelivery,
        keyUse: params.framework.key_language_use,
        dinoCount: params.dinoDetectionCount,
        tagCount: params.imageTags.length,
        rationale,
      },
      "decideAcademicListeningL12Mode",
    );

    return {
      useTapMode,
      tapDelivery: useTapMode ? tapDelivery : "text_choice",
      rationale,
    };
  } catch (err) {
    logger.warn({ err }, "decideAcademicListeningL12Mode failed — using heuristic fallback");
    return fallbackListeningL12Mode(params);
  }
}

function fallbackListeningL12Mode(params: {
  framework: FrameworkTask;
  imageTags: string[];
  dinoDetectionCount: number;
}): AcademicListeningL12ModeDecision {
  const ku = params.framework.key_language_use;
  const hasBoxes = params.dinoDetectionCount >= 2;
  const hasTags = params.imageTags.length >= 1;

  if (ku === "Explain" && !hasBoxes) {
    return { useTapMode: false, tapDelivery: "text_choice", rationale: "Explain without reliable boxes" };
  }
  if ((ku === "Narrate" || ku === "Inform" || ku === "Argue") && hasTags) {
    return {
      useTapMode: true,
      tapDelivery: hasBoxes ? "box_tap" : "text_choice",
      rationale: `Heuristic: ${ku} with image targets`,
    };
  }
  if (hasBoxes && hasTags) {
    return { useTapMode: true, tapDelivery: "box_tap", rationale: "Heuristic: boxes + tags" };
  }
  return { useTapMode: false, tapDelivery: "text_choice", rationale: "Heuristic: listen-and-read" };
}
