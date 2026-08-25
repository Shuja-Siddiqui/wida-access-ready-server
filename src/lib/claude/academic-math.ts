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
import {
  buildSystemPrompt,
  BASE_BLOCK,
  LISTENING_CORE_BLOCK,
  OPTIONAL_LINE_VISUALS_BLOCK,
  MATH_SUBJECT_BLOCK,
  MATH_OUTPUT_SCHEMA,
} from "./prompts";
import { parseOptionDiagrams, parseVisual } from "./prompts/optional-line-visuals";
import type { ListeningContent } from "./listening";

const SYSTEM_PROMPT = buildSystemPrompt(
  "You are an academic listening content generator for Grade 6–8 English Language Learners. Generate a mathematics word problem read aloud by a teacher, plus comprehension questions that test whether the student understood the mathematical language and situation — not whether they can compute the answer.",
  BASE_BLOCK,
  LISTENING_CORE_BLOCK,
  OPTIONAL_LINE_VISUALS_BLOCK,
  MATH_SUBJECT_BLOCK,
  MATH_OUTPUT_SCHEMA,
);

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
      options: ["$0.80", "$1.50", "$3.00", "$2.30"],
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
        "Which fruit is cheaper",
      ],
      correct: 1,
      explanation: "She wants the total cost before checkout.",
    },
    {
      id: "3",
      type: "multiple_choice",
      question: "How many pounds of bananas does Maria buy?",
      options: ["One pound", "Three pounds", "Two pounds", "Four pounds"],
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
  canDo: { keyUse: string; action: string; items: string[] };
  mathUnit: string;
  mathScenario: string;
  tier3Vocabulary: string[];
  topic: string;
  isRetry?: boolean;
  lastSessionScore?: number | null;
  hasLibraryImage?: boolean;
}): Promise<ListeningContent> {
  const { questionCount, passageSentenceTarget, maxTokens } = academicSessionScale(params.level);

  const prompt = JSON.stringify({
    integer_level:          params.level,
    step_within_level:      params.stepWithinLevel,
    complexity_instruction: params.complexityInstruction,
    can_do: {
      key_use: params.canDo.keyUse,
      action:  params.canDo.action,
      items:   params.canDo.items,
    },
    oral_format:             params.oralFormat,
    math_unit:               params.mathUnit,
    math_scenario:           params.mathScenario,
    tier3_vocabulary:        params.tier3Vocabulary,
    topic:                   params.topic,
    is_retry:                params.isRetry ?? false,
    last_session_score:      params.lastSessionScore ?? null,
    question_count:          questionCount,
    passage_sentence_target: passageSentenceTarget,
    has_library_image:       params.hasLibraryImage ?? false,
  });

  try {
    const result = (await callClaude(SYSTEM_PROMPT, prompt, maxTokens)) as {
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

    return {
      audioScript: toDisplayText(result.audio_script),
      topic:       result.topic ?? params.topic,
      context:     result.context ?? "Teacher reading a word problem aloud to the class",
      visual:      parseVisual((result as { visual?: unknown }).visual),
      questions: (result.questions || []).map((q) => ({
        id:          q.id,
        type:        q.type,
        question:    toDisplayText(q.question),
        options:     q.options,
        correct:     q.correct,
        explanation: q.explanation,
        optionDiagrams: parseOptionDiagrams((q as { option_diagrams?: unknown }).option_diagrams),
        visual:      parseVisual((q as { visual?: unknown }).visual),
      })),
    };
  } catch {
    return FALLBACK_ACADEMIC_MATH;
  }
}
