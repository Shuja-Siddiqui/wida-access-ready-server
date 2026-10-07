/**
 * Academic Math Listening content generator — Grade 6-8 word problems, WIDA levels 3-6.
 *
 * System prompt: role + BASE_BLOCK + LISTENING_CORE_BLOCK + MATH_SUBJECT_BLOCK + MATH_OUTPUT_SCHEMA
 * No INPUT_FIELDS block — JSON field names are self-documenting.
 *
 * Permitted formats: multiple_choice, sequence_ordering, pair_matching
 * agree_disagree excluded — mathematical claims don't map to that format.
 * Questions test comprehension of mathematical language, not computation.
 */

import {
  callClaude,
  toDisplayText,
  academicSessionScale,
} from "./client";
import { MATH_SUBJECT_BLOCK } from "./prompts";
import { LIBRARY_IMAGE_LISTENING_EXTRA } from "./prompts/content/writing-image-passage";
import {
  buildAcademicListeningLibraryCurriculum,
  buildAcademicListeningLibraryPromptFields,
  finalizeAcademicListeningLibraryResult,
} from "./academicListeningLibrary";
import type { WritingLibraryCandidate } from "../content/writingLibraryCandidates";
import { parseOptionDiagrams, parseVisual } from "./prompts/optional-line-visuals";
import { buildListening2020SystemPrompt, buildListeningOutputSchema, type ListeningContent } from "./listening";
import { listeningAvailableFormats } from "../content/formatCapabilities";
import { frameworkTaskDescriptor, serializeFrameworkTask, type FrameworkTask } from "./standards/2020";
import { clampToThreeOptions } from "../choice-options";
import { logger } from "../../config/logger";
import { dumpContentGenRequest } from "./dump-content-gen";
import { mergePriorPractice, type PracticeReport } from "../practice-report";
import {
  academicPromptFieldsFromContext,
  type AcademicFrameworkFields,
} from "../academic/academicFrameworkContext";

// ── Fallback ──────────────────────────────────────────────────────────────────

export const FALLBACK_ACADEMIC_MATH: ListeningContent = {
  audioScript:
    "Listen carefully. A grocery store sells apples for one dollar and fifty cents per pound. Maria wants to buy three pounds of apples and two pounds of bananas. Bananas cost eighty cents per pound. She wants to know the total cost before she gets to the register.",
  topic: "Mathematics — Grade 6: Ratios & Rates",
  context: "Teacher reading a word problem aloud to the class",
  questions: [
    {
      id: "1",
      type: "multiple_choice",
      question: "How much does one pound of apples cost?",
      options: ["$0.80", "$1.50", "$3.00"],
      correct: 1,
      explanation: "The audio says apples cost $1.50 per pound.",
    },
    {
      id: "2",
      type: "multiple_choice",
      question: "What does Maria want to find out?",
      options: [
        "How many apples to buy",
        "The total cost of her purchase",
        "The price per banana",
      ],
      correct: 1,
      explanation: "She wants the total cost before checkout.",
    },
    {
      id: "3",
      type: "multiple_choice",
      question: "How many pounds of bananas does Maria buy?",
      options: ["One pound", "Three pounds", "Two pounds"],
      correct: 2,
      explanation: "The audio says two pounds of bananas.",
    },
  ],
};

// ── Generator ─────────────────────────────────────────────────────────────────

export async function generateAcademicMathListeningContent(params: {
  level: number;
  fractionalLevel: number;
  stepWithinLevel: number;
  complexityInstruction: string;
  oralFormat: string;
  permittedFormats: string[];
  framework: FrameworkTask;
  mathUnit: string;
  scenarioExamples: string[];
  tier3Vocabulary: string[];
  topic: string;
  isRetry?: boolean;
  lastSessionScore?: number | null;
  libraryCandidates?: WritingLibraryCandidate[];
  priorPracticeReport?: PracticeReport | null;
  frameworkContext?: Partial<AcademicFrameworkFields>;
}): Promise<ListeningContent> {
  const { questionCount, passageSentenceTarget, maxTokens } = academicSessionScale(params.level);
  const availableFormats = params.permittedFormats.length > 0
    ? params.permittedFormats
    : listeningAvailableFormats(params.level);
  const libraryCandidates = params.libraryCandidates ?? [];
  const curriculum = buildAcademicListeningLibraryCurriculum({
    unit:             params.mathUnit,
    topic:            params.topic,
    tier3Vocabulary:  params.tier3Vocabulary,
    scenarioExamples: params.scenarioExamples,
  });
  const { prepared, fields: libraryPromptFields } = buildAcademicListeningLibraryPromptFields({
    libraryCandidates,
    level:           params.level,
    keyUse:          params.framework.key_language_use,
    academicSubject: "math",
    domainNote:      LIBRARY_IMAGE_LISTENING_EXTRA,
    curriculum,
    passageSentenceTarget,
    frameworkContext: params.frameworkContext,
    unitField: {
      unit:             params.mathUnit,
      scenarioExamples: params.scenarioExamples,
      tier3Vocabulary:  params.tier3Vocabulary,
    },
  });
  const hasLibraryCandidates = prepared.candidates.length > 0;
  const schemaSection = buildListeningOutputSchema(
    params.level,
    availableFormats,
    questionCount,
    { libraryCompose: hasLibraryCandidates },
  );

  const systemPrompt = buildListening2020SystemPrompt(params.level, {
    academicContentLayer: MATH_SUBJECT_BLOCK,
    extraBlocks: [
      "Academic math listening: test whether the student understood the mathematical language and situation — not computation.",
    ],
    hasLibraryCandidates,
    schemaSection,
  });

  const prompt = JSON.stringify(mergePriorPractice({
    domain:                 "listening",
    integer_level:          params.level,
    step_within_level:      params.stepWithinLevel,
    complexity_instruction: params.complexityInstruction,
    framework:              serializeFrameworkTask(params.framework),
    goal:                   "Create one math listening task so the student can practice understanding language at framework.pld.",
    required_key_use:       params.framework.key_language_use,
    oral_format:             params.oralFormat,
    math_unit:               params.mathUnit,
    tier3_vocabulary:        params.tier3Vocabulary,
    topic:                   params.topic,
    is_retry:                params.isRetry ?? false,
    last_session_score:      params.lastSessionScore ?? null,
    question_count:          questionCount,
    available_question_formats: availableFormats,
    ...libraryPromptFields,
  }, params.priorPracticeReport));

  dumpContentGenRequest("academic-math", systemPrompt, prompt);
  try {
    const result = (await callClaude(systemPrompt, prompt, maxTokens)) as {
      selected_image_id?: string | null;
      audio_script: string;
      topic: string;
      context: string;
      questions: Array<{
        id: string;
        type: string;
        question: string;
        options: string[];
        correct: number;
        explanation: string;
      }>;
    };

    const taskDescriptor = frameworkTaskDescriptor(params.framework);
    const rawSelectedId = typeof result.selected_image_id === "string"
      ? result.selected_image_id.trim()
      : null;
    const finalized = finalizeAcademicListeningLibraryResult({
      rawSelectedId,
      audioScript:   toDisplayText(result.audio_script),
      prepared,
      allCandidates: libraryCandidates,
      curriculum,
      level:         params.level,
      keyUse:        params.framework.key_language_use,
      logLabel:      "academic-math",
    });
    return {
      taskDescriptor,
      canDoDescriptor: taskDescriptor,
      framework:       params.framework,
      selectedLibraryImageId: finalized.selectedLibraryImageId,
      audioScript: finalized.audioScript,
      topic:       result.topic ?? params.topic,
      context:     result.context ?? "Teacher reading a word problem aloud to the class",
      visual:      parseVisual((result as { visual?: unknown }).visual),
      questions: (result.questions || []).map((q) => {
        const three = clampToThreeOptions(q.options, q.correct);
        return {
        id:          q.id,
        type:        q.type,
        question:    toDisplayText(q.question),
        options:     three.options,
        correct:     three.correct,
        explanation: q.explanation,
        optionDiagrams: parseOptionDiagrams((q as { option_diagrams?: unknown }).option_diagrams)?.slice(0, 3),
        visual:      parseVisual((q as { visual?: unknown }).visual),
      };
      }),
    };
  } catch (err) {
    logger.error({ err }, "academic math listening generation failed, using fallback");
    return FALLBACK_ACADEMIC_MATH;
  }
}
