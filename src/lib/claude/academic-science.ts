/**
 * Academic Science Listening content generator — Grade 6-8, WIDA levels 3-6.
 *
 * System prompt: role + BASE_BLOCK + LISTENING_CORE_BLOCK + SCIENCE_SUBJECT_BLOCK + SCIENCE_OUTPUT_SCHEMA
 * No INPUT_FIELDS block — JSON field names are self-documenting.
 *
 * Permitted formats: all four (multiple_choice, sequence_ordering, pair_matching, agree_disagree)
 * agree_disagree included — science deals in evidence-based claims.
 * Questions test comprehension of scientific language, not memorized facts.
 */

import {
  callClaude,
  toDisplayText,
  academicSessionScale,
} from "./client";
import {
  buildSystemPrompt,
  OPTIONAL_LINE_VISUALS_BLOCK,
  SCIENCE_SUBJECT_BLOCK,
  SCIENCE_OUTPUT_SCHEMA,
  contentGenPrompt,
} from "./prompts";
import { parseOptionDiagrams, parseVisual } from "./prompts/optional-line-visuals";
import type { ListeningContent } from "./listening";
import { serializeCanDoForPrompt } from "../listeningContentEngine";
import { clampToThreeOptions } from "../choice-options";

const SYSTEM_PROMPT = buildSystemPrompt(
  contentGenPrompt("listening", 3),
  "Academic science listening: test scientific language and reasoning — not memorized facts.",
  OPTIONAL_LINE_VISUALS_BLOCK,
  SCIENCE_SUBJECT_BLOCK,
  SCIENCE_OUTPUT_SCHEMA,
);

// ── Fallback ──────────────────────────────────────────────────────────────────

export const FALLBACK_ACADEMIC_SCIENCE: ListeningContent = {
  audioScript:
    "Today we are going to look at how plants make their own food. This process is called photosynthesis — which means 'putting together with light.' A plant takes in three things: sunlight from the sky, water from the soil through its roots, and carbon dioxide from the air through tiny openings in its leaves. Inside the leaf, cells use the energy from sunlight to combine the water and carbon dioxide and turn them into sugar. The plant uses that sugar as food to grow. As a result, the plant releases oxygen into the air — and that is the oxygen that we breathe.",
  topic: "Science — Life Science: Cells",
  context: "Teacher explaining a science concept to the class",
  questions: [
    {
      id: "1",
      type: "multiple_choice",
      question: "According to the teacher, what three things does a plant need for photosynthesis?",
      options: [
        "Sunlight, water, and carbon dioxide",
        "Sunlight, oxygen, and soil",
        "Water, nitrogen, and carbon dioxide",
      ],
      correct: 0,
      explanation: "The audio names sunlight, water, and carbon dioxide.",
    },
    {
      id: "2",
      type: "multiple_choice",
      question: "What does the teacher say the plant releases as a result of photosynthesis?",
      options: ["Carbon dioxide", "Sugar", "Oxygen"],
      correct: 2,
      explanation: "The audio says the plant releases oxygen.",
    },
    {
      id: "3",
      type: "multiple_choice",
      question: "What does 'photosynthesis' mean according to the teacher?",
      options: [
        "Making food from soil",
        "Putting together with light",
        "Taking in oxygen",
      ],
      correct: 1,
      explanation: "The teacher defines it as 'putting together with light.'",
    },
  ],
};

// ── Generator ─────────────────────────────────────────────────────────────────

export async function generateAcademicScienceListeningContent(params: {
  level: number;
  fractionalLevel: number;
  stepWithinLevel: number;
  complexityInstruction: string;
  oralFormat: string;
  permittedFormats: string[];
  canDo: { keyUse: string; action: string; items: string[] };
  scienceUnit: string;
  scienceStrand: string;
  scienceScenario: string;
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
    can_do: serializeCanDoForPrompt(params.canDo, { level: params.level, domain: "LISTENING" }),
    oral_format:             params.oralFormat,
    science_unit:            params.scienceUnit,
    science_strand:          params.scienceStrand,
    science_scenario:        params.scienceScenario,
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
      context:     result.context ?? "Teacher explaining a science concept to the class",
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
    throw err;
  }
}
