/**
 * Speaking content generator — one oral prompt with scaffold and scoring guidance.
 *
 * Schema is built dynamically per call (level + allowedPromptTypes + responseLength +
 * scaffoldRequired) so Claude always sees the exact field shapes, enum values, and
 * scoring dimensions valid for this session.
 */

import { callClaude, toDisplayText, toDisplayTextOrNull } from "./client";
import { logger } from "../../config/logger";
import { OPTIONAL_LINE_VISUALS_BLOCK, parseVisual } from "./prompts/optional-line-visuals";
import { buildSystemPrompt } from "./prompts/compose";
import { contentGenPrompt } from "./prompts/content";
import type { CanDoEntry } from "../content";
import { serializeCanDoForPrompt } from "../content";
import { dumpContentGenRequest } from "./dump-content-gen";
import { ACCESS_LANGUAGE_FORMS } from "../wida-access-rubric";
import { mergePriorPractice, type PracticeReport } from "../practice-report";

// ── Per-level schema tables ───────────────────────────────────────────────────

/**
 * ACCESS Language Forms (Discourse / Sentence / Word-Phrase), not homemade
 * pronunciation/fluency checklists. Category scoring is Exemplary–No Response.
 */
const ACCESS_SCORING_DIMENSIONS = [...ACCESS_LANGUAGE_FORMS];

/**
 * Whether the scaffold field should be a string or null at each level.
 * Levels 1–3: always provide a sentence frame.
 * Levels 4–6: scaffold is null (student generates their own language).
 */
const SCAFFOLD_REQUIRED_AT_LEVEL: Record<number, boolean> = {
  1: true, 2: true, 3: true, 4: false, 5: false, 6: false,
};

// ── Schema builder ────────────────────────────────────────────────────────────

/**
 * Builds the OUTPUT SCHEMA section for this specific call.
 * Shows the exact prompt_type options, response_length, scoring dimensions,
 * and scaffold nullability for this level.
 */
function buildSpeakingOutputSchema(params: {
  level: number;
  allowedPromptTypes: string[];
  responseLength: string;
  scaffoldRequired: boolean;
  targetSeconds: { min: number; max: number };
}): string {
  const { level, allowedPromptTypes, responseLength, scaffoldRequired, targetSeconds } = params;
  const scoringDims = ACCESS_SCORING_DIMENSIONS;
  const scaffoldShape = scaffoldRequired
    ? `"<sentence frame / starter that models the prompt_type — e.g. 'First… Then… Finally…'>"`
    : `null  /* Level ${level}: no scaffold; student generates their own opening */`;

  return [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `OUTPUT SCHEMA — LEVEL ${level}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `{`,
    `  "can_do_descriptor": "<WIDA action + chosen can_do item>",`,
    ``,
    `  "prompt": "<the speaking task the student sees — sized to response_length>",`,
    `  /* Task must be answerable in: ${responseLength.replace(/_/g, " ")} */`,
    `  "visual": null,`,
    ``,
    `  "prompt_type": "${allowedPromptTypes[0]}",`,
    `  /* MUST be exactly one of: ${allowedPromptTypes.join(" | ")} */`,
    `  /* These values are derived from the CanDo for this level + key use:`,
    `     wh_answer       → answer a Wh-question in 1–5 words (Inform/Narrate L1)`,
    `     yes_no          → yes/no with a brief reason (Argue L1)`,
    `     descriptive     → describe an object, person, or place (Explain L1–2)`,
    `     narrative       → retell events with sequence (Narrate L2–3)`,
    `     explanatory     → explain how/why (Explain L3–6)`,
    `     summary         → paraphrase/summarize content ideas (Inform L4)`,
    `     argumentative   → state and defend a position with evidence (Argue L2–6)`,
    `     extended_report → organized oral report from multiple sources (Inform L5–6) */`,
    ``,
    `  "response_length": "${responseLength}",`,
    `  /* Echo this value exactly — do not change it */`,
    `  /* Interpretation:`,
    `     word_or_phrase  (L1) → 1–5 words, yes/no, or single Wh-answer`,
    `     1_2_sentences   (L2) → short modeled sentences`,
    `     3_5_sentences   (L3) → multi-sentence with transitions and tenses`,
    `     paragraph       (L4) → one developed paragraph with hedging/connectors`,
    `     extended        (L5–6) → sustained oral discourse */`,
    ``,
    `  "scaffold": ${scaffoldShape},`,
    ``,
    `  "target_seconds": { "min": ${targetSeconds.min}, "max": ${targetSeconds.max} },`,
    `  /* Echo these values — do not modify */`,
    ``,
    `  "scoring_dimensions": ${JSON.stringify(scoringDims)},`,
    `  /* ACCESS Language Forms: Discourse, Sentence, Word-Phrase.`,
    `     Score the response later on Exemplary / Strong / Adequate / Attempted / No Response. */`,
    ``,
    `  "exit_tip": "<one coaching sentence for exit_proximity mode — or null for standard mode>"`,
    `}`,
    ``,
    `SCHEMA ENFORCEMENT RULES`,
    `• Return every key in this OUTPUT SCHEMA. Never omit a field. Use null only where this schema shows null.`,
    `• prompt_type MUST be one of: ${allowedPromptTypes.join(", ")}.`,
    `• response_length MUST be echoed as-is: "${responseLength}".`,
    `• scoring_dimensions MUST be discourse, sentence, word_phrase (ACCESS Language Forms).`,
    scaffoldRequired
      ? `• scaffold MUST be a non-null sentence frame at Level ${level}.`
      : `• scaffold MUST be null at Level ${level} — do not provide a frame.`,
    `• target_seconds MUST echo the input values: { "min": ${targetSeconds.min}, "max": ${targetSeconds.max} }.`,
  ].join("\n");
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SpeakingContent {
  canDoDescriptor: string;
  /** Official WIDA Can Do used to generate this prompt (not Claude's paraphrase). */
  keyUse?: string;
  canDoAction?: string;
  canDoItems?: string[];
  prompt: string;
  visual?: string;
  /** One of: wh_answer | yes_no | descriptive | narrative | explanatory | summary | argumentative | extended_report */
  promptType: string;
  /** One of: word_or_phrase | 1_2_sentences | 3_5_sentences | paragraph | extended */
  responseLength: string;
  scaffold: string | null;
  targetSeconds: { min: number; max: number };
  scoringDimensions: string[];
  exitTip: string | null;
}

// ── Fallback ──────────────────────────────────────────────────────────────────

const FALLBACK_SPEAKING: SpeakingContent = {
  canDoDescriptor: "Explain by describing situations from modeled sentences",
  prompt: "Describe what you did to prepare for a school project. What steps did you take?",
  promptType: "explanatory",
  responseLength: "3_5_sentences",
  scaffold: "First, I... Then, I... Finally, I...",
  targetSeconds: { min: 30, max: 60 },
  scoringDimensions: ["discourse", "sentence", "word_phrase"],
  exitTip: null,
};

// ── Generator ─────────────────────────────────────────────────────────────────

export async function generateSpeakingContent(params: {
  assessment: string;
  level: number;
  fractionalLevel: number;
  stepWithinLevel: number;
  complexityInstruction: string;
  discourseType: string;
  scaffoldRequired: boolean;
  responseLength: string;
  allowedPromptTypes: string[];
  targetSeconds: { min: number; max: number };
  canDo: CanDoEntry;
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
}): Promise<SpeakingContent> {
  // Build a level-specific output schema and combine with the static base prompt
  const schemaSection = buildSpeakingOutputSchema({
    level:              params.level,
    allowedPromptTypes: params.allowedPromptTypes,
    responseLength:     params.responseLength,
    scaffoldRequired:   params.scaffoldRequired,
    targetSeconds:      params.targetSeconds,
  });
  const systemPrompt = buildSystemPrompt(
    contentGenPrompt("speaking", params.level),
    OPTIONAL_LINE_VISUALS_BLOCK,
    params.academicContentLayer ?? "",
    schemaSection,
  );

  const userPrompt = JSON.stringify(mergePriorPractice({
    domain:                 "speaking",
    assessment:             params.assessment,
    level:                  params.level,
    fractional_level:       params.fractionalLevel,
    step_within_level:      params.stepWithinLevel,
    grade_band:             params.gradeBand,
    mode:                   params.mode,
    topic:                  params.hasLibraryImage
      ? (params.imageConcept?.trim() || params.imageDescription?.trim().slice(0, 160) || params.topic)
      : params.topic,
    curriculum_topic:       params.topic,
    can_do:                 serializeCanDoForPrompt(params.canDo, { level: params.level, domain: "SPEAKING" }),
    complexity_instruction: params.complexityInstruction,
    discourse_type:         params.discourseType,
    scaffold_required:      params.scaffoldRequired,
    response_length:        params.responseLength,
    allowed_prompt_types:   params.allowedPromptTypes,
    target_seconds:         params.targetSeconds,
    required_key_use:       params.canDo.keyUse,
    has_library_image:      params.hasLibraryImage ?? false,
    image_tags:             params.imageTags ?? [],
    image_description:      params.imageDescription ?? null,
    image_concept:          params.imageConcept ?? null,
    ...(params.academicSubject ? { academic_subject: params.academicSubject } : {}),
  }, params.priorPracticeReport));

  logger.info(
    {
      stage: "speaking-content → Claude",
      level: params.level,
      keyUse: params.canDo?.keyUse ?? null,
      canDoAction: params.canDo?.action ?? null,
      canDoItems: params.canDo?.items ?? [],
      canDoPresent: Boolean(params.canDo?.items?.length),
      discourseType: params.discourseType,
      responseLength: params.responseLength,
      allowedPromptTypes: params.allowedPromptTypes,
      topic: params.topic,
      hasLibraryImage: params.hasLibraryImage ?? false,
      imageTags: params.imageTags ?? [],
      userPrompt: userPrompt.slice(0, 1200),
    },
    "speaking content request",
  );

  dumpContentGenRequest("speaking", systemPrompt, userPrompt);
  try {
    const result = (await callClaude(systemPrompt, userPrompt)) as {
      can_do_descriptor: string;
      prompt: string;
      prompt_type: string;
      response_length: string;
      scaffold: string | null;
      target_seconds: { min: number; max: number };
      scoring_dimensions: string[];
      exit_tip: string | null;
    };

    logger.info(
      {
        stage: "speaking-content ← Claude",
        canDoDescriptor: result.can_do_descriptor ?? "",
        prompt: toDisplayText(result.prompt).slice(0, 240),
        scaffold: toDisplayTextOrNull(result.scaffold),
        promptType: result.prompt_type,
        responseLength: result.response_length,
      },
      "speaking content result",
    );

    return {
      canDoDescriptor:   result.can_do_descriptor ?? "",
      keyUse:            params.canDo.keyUse,
      canDoAction:       params.canDo.action,
      canDoItems:        params.canDo.items,
      prompt:            toDisplayText(result.prompt),
      visual:            parseVisual((result as { visual?: unknown }).visual),
      promptType:        result.prompt_type ?? params.allowedPromptTypes[0] ?? "descriptive",
      responseLength:    result.response_length ?? params.responseLength,
      scaffold:          toDisplayTextOrNull(result.scaffold),
      targetSeconds:     params.isTelpas ? { min: 45, max: 90 } : (result.target_seconds ?? params.targetSeconds),
      scoringDimensions: ACCESS_SCORING_DIMENSIONS,
      exitTip:           toDisplayTextOrNull(result.exit_tip),
    };
  } catch (err) {
    logger.error({ err, stage: "speaking-content", canDo: params.canDo }, "speaking content generation failed, using fallback");
    return {
      ...FALLBACK_SPEAKING,
      canDoDescriptor: params.canDo.action || FALLBACK_SPEAKING.canDoDescriptor,
      keyUse: params.canDo.keyUse,
      canDoAction: params.canDo.action,
      canDoItems: params.canDo.items,
      prompt: (params.imageTags?.length)
        ? `Look at the photo. Name ${params.imageTags.slice(0, 3).join(", ")}.`
        : FALLBACK_SPEAKING.prompt,
      scaffold: params.scaffoldRequired ? FALLBACK_SPEAKING.scaffold : null,
      targetSeconds: params.isTelpas ? { min: 45, max: 90 } : params.targetSeconds,
      responseLength: params.responseLength,
      scoringDimensions: ACCESS_SCORING_DIMENSIONS,
    };
  }
}
