/**
 * Speaking content generator — one oral prompt with scaffold and scoring guidance.
 */

import { callClaude, toDisplayText, toDisplayTextOrNull } from "./client";
import { logger } from "../../config/logger";
import { buildLibraryImageSceneUserFields } from "./prompts/academic-image-anchor";
import {
  buildLevel1PassageFromLibraryMeta,
  LIBRARY_IMAGE_SPEAKING_EXTRA,
} from "./prompts/content/writing-image-passage";
import { parseVisual } from "./prompts/optional-line-visuals";
import { buildContentSystemPrompt } from "./prompts/content/system-prompt";
import {
  frameworkTaskDescriptor,
  serializeFrameworkTask,
  type FrameworkTask,
} from "./standards/2020";
import { dumpContentGenRequest } from "./dump-content-gen";
import { ACCESS_LANGUAGE_FORMS } from "../wida-access-rubric";
import { mergePriorPractice, type PracticeReport } from "../practice-report";
import {
  academicPromptFieldsFromContext,
  type AcademicFrameworkFields,
} from "../academic/academicFrameworkContext";

const ACCESS_SCORING_DIMENSIONS = [...ACCESS_LANGUAGE_FORMS];

function buildSpeakingOutputSchema(params: {
  level: number;
  allowedPromptTypes: string[];
}): string {
  const { level, allowedPromptTypes } = params;

  return [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `OUTPUT SCHEMA — LEVEL ${level}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `{`,
    `  "task_descriptor": "<echo 2–3 language_functions this session assesses>",`,
    ``,
    `  "prompt": "<the speaking task the student sees — job only; do NOT paste scaffold into this string>",`,
    `  "visual": null,`,
    ``,
    `  "prompt_type": "<chosen from available_prompt_types>",`,
    `  /* Pick one that best fits framework.language_functions: ${allowedPromptTypes.join(" | ")} */`,
    ``,
    `  "response_length": "<word_or_phrase | 1_2_sentences | 3_5_sentences | paragraph | extended — you choose from framework.pld>",`,
    ``,
    `  "scaffold": null,  /* sentence frame / starter ONLY — you choose; null if student should open independently */`,
    ``,
    `  "target_seconds": { "min": <number>, "max": <number> },`,
    ``,
    `  "scoring_dimensions": ["discourse", "sentence", "word_phrase"],`,
    ``,
    `  "exit_tip": "<one coaching sentence for exit_proximity mode — or null for standard mode>"`,
    `}`,
    ``,
    `SCHEMA ENFORCEMENT RULES`,
    `• Return every key in this OUTPUT SCHEMA. Never omit a field. Use null only where this schema shows null.`,
    `• You choose prompt_type, scaffold, response_length, and target_seconds from framework.pld and language_functions.`,
    `• prompt_type MUST be one of: ${allowedPromptTypes.join(", ")} — choose from framework.language_functions, not key-use habit.`,
    `• scaffold is null when no frame is needed. Never duplicate scaffold text inside prompt.`,
    `• prompt must NOT mention the scaffold or its absence.`,
    `• scoring_dimensions MUST be discourse, sentence, word_phrase (ACCESS Language Forms).`,
  ].join("\n");
}

function normalizeScoringDimensions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return ACCESS_SCORING_DIMENSIONS;
  const dims = raw.filter((d): d is string => typeof d === "string" && d.trim().length > 0);
  return dims.length > 0 ? dims : ACCESS_SCORING_DIMENSIONS;
}

export interface SpeakingContent {
  canDoDescriptor: string;
  taskDescriptor: string;
  framework: FrameworkTask;
  keyUse?: string;
  canDoAction?: string;
  canDoItems?: string[];
  prompt: string;
  visual?: string;
  promptType: string;
  responseLength: string;
  scaffold: string | null;
  targetSeconds: { min: number; max: number };
  scoringDimensions: string[];
  exitTip: string | null;
}

const FALLBACK_FRAMEWORK: FrameworkTask = {
  edition: "2020",
  eld_standard: { id: "4", name: "Language for Science" },
  key_language_use: "Explain",
  mode: "expressive",
  reference_code: null,
  language_expectations: ["Generate and convey initial thinking"],
  language_functions: [{ function: "Generate and convey initial thinking", language_features: [] }],
  pld: {
    level: 3,
    framing: "",
    discourse_organization: "",
    discourse_cohesion: "",
    discourse_density: "",
    sentence: "",
    word_phrase: "",
  },
};

const FALLBACK_SPEAKING: SpeakingContent = {
  canDoDescriptor: "Generate and convey initial thinking",
  taskDescriptor: "Generate and convey initial thinking",
  framework: FALLBACK_FRAMEWORK,
  prompt: "Describe what you did to prepare for a school project. What steps did you take?",
  promptType: "explanatory",
  responseLength: "3_5_sentences",
  scaffold: null,
  targetSeconds: { min: 30, max: 60 },
  scoringDimensions: ["discourse", "sentence", "word_phrase"],
  exitTip: null,
};

export async function generateSpeakingContent(params: {
  assessment: string;
  level: number;
  fractionalLevel: number;
  stepWithinLevel: number;
  complexityInstruction: string;
  discourseType: string;
  /** WIDA level calibration hints — AI chooses final values in its response. */
  responseLength?: string;
  allowedPromptTypes: string[];
  targetSeconds?: { min: number; max: number };
  framework: FrameworkTask;
  topic: string;
  gradeBand: string;
  mode: "standard" | "exit_proximity";
  isTelpas?: boolean;
  academicContentLayer?: string;
  academicSubject?: string;
  hasLibraryImage?: boolean;
  imageTags?: string[];
  imageDescription?: string;
  imageConcept?: string;
  priorPracticeReport?: PracticeReport | null;
  academicUnit?: string;
  scenarioExamples?: string[];
  tier3Vocabulary?: string[];
  academicFramework?: Partial<AcademicFrameworkFields>;
}): Promise<SpeakingContent> {
  const schemaSection = buildSpeakingOutputSchema({
    level:              params.level,
    allowedPromptTypes: params.allowedPromptTypes,
  });
  const hasLibraryImage = params.hasLibraryImage ?? false;
  const systemPrompt = buildContentSystemPrompt("speaking", params.level, schemaSection, {
    academicContentLayer: params.academicContentLayer,
    hasLibraryImage,
  });

  const keyUse = params.framework.key_language_use;
  const userPrompt = JSON.stringify(mergePriorPractice({
    domain:                 "speaking",
    assessment:             params.assessment,
    level:                  params.level,
    fractional_level:       params.fractionalLevel,
    step_within_level:      params.stepWithinLevel,
    grade_band:             params.gradeBand,
    mode:                   params.mode,
    topic:                  params.topic,
    curriculum_topic:       params.topic,
    framework:              serializeFrameworkTask(params.framework),
    goal:                   "Create one speaking prompt so the student can practice producing language at framework.pld (end of this integer level).",
    complexity_instruction: params.complexityInstruction,
    discourse_expectation:  params.discourseType,
    ...(params.responseLength
      ? { typical_response_length: params.responseLength }
      : {}),
    available_prompt_types: params.allowedPromptTypes,
    ...(params.targetSeconds
      ? { typical_target_seconds: params.targetSeconds }
      : {}),
    required_key_use:       keyUse,
    ...buildLibraryImageSceneUserFields({
      level:           params.level,
      keyUse,
      hasLibraryImage,
      imageDescription: params.imageDescription ?? undefined,
      imageTags:       params.imageTags,
      imageConcept:    params.imageConcept,
      academicSubject: params.academicSubject,
      libraryImageNote: LIBRARY_IMAGE_SPEAKING_EXTRA,
    }),
    ...(params.academicSubject && !hasLibraryImage ? { academic_subject: params.academicSubject } : {}),
    ...academicPromptFieldsFromContext({
      unit: params.academicUnit,
      scenarioExamples: params.scenarioExamples,
      tier3Vocabulary: params.tier3Vocabulary,
      ...params.academicFramework,
    }),
  }, params.priorPracticeReport));

  dumpContentGenRequest("speaking", systemPrompt, userPrompt);
  try {
    const result = (await callClaude(systemPrompt, userPrompt)) as {
      task_descriptor?: string;
      can_do_descriptor?: string;
      prompt: string;
      prompt_type: string;
      response_length: string;
      scaffold: string | null;
      target_seconds: { min: number; max: number };
      scoring_dimensions: string[];
      exit_tip: string | null;
    };

    const taskDescriptor = result.task_descriptor ?? result.can_do_descriptor
      ?? frameworkTaskDescriptor(params.framework);
    const fnItems = params.framework.language_functions.map((f) => f.function);

    return {
      canDoDescriptor:   taskDescriptor,
      taskDescriptor,
      framework:       params.framework,
      keyUse,
      canDoAction:       fnItems[0] ?? "",
      canDoItems:        fnItems,
      prompt:            toDisplayText(result.prompt),
      visual:            parseVisual((result as { visual?: unknown }).visual),
      promptType:        result.prompt_type ?? params.allowedPromptTypes[0] ?? "descriptive",
      responseLength:    result.response_length ?? params.responseLength ?? "3_5_sentences",
      scaffold:          toDisplayTextOrNull(result.scaffold),
      targetSeconds:     params.isTelpas
        ? { min: 45, max: 90 }
        : (result.target_seconds ?? params.targetSeconds ?? { min: 30, max: 60 }),
      scoringDimensions: normalizeScoringDimensions(result.scoring_dimensions),
      exitTip:           toDisplayTextOrNull(result.exit_tip),
    };
  } catch (err) {
    logger.error({ err, stage: "speaking-content", framework: params.framework }, "speaking content generation failed, using fallback");
    const fnItems = params.framework.language_functions.map((f) => f.function);
    return {
      ...FALLBACK_SPEAKING,
      framework:       params.framework,
      canDoDescriptor: frameworkTaskDescriptor(params.framework),
      taskDescriptor:  frameworkTaskDescriptor(params.framework),
      keyUse,
      canDoAction:     fnItems[0] ?? "",
      canDoItems:      fnItems,
      prompt: params.hasLibraryImage
        ? `Tell about this: ${buildLevel1PassageFromLibraryMeta({
            tags: params.imageTags ?? [],
            imageConcept: params.imageConcept,
          })}`
        : FALLBACK_SPEAKING.prompt,
      scaffold: null,
      targetSeconds: params.isTelpas ? { min: 45, max: 90 } : (params.targetSeconds ?? FALLBACK_SPEAKING.targetSeconds),
      responseLength: params.responseLength ?? FALLBACK_SPEAKING.responseLength,
      scoringDimensions: ACCESS_SCORING_DIMENSIONS,
    };
  }
}
