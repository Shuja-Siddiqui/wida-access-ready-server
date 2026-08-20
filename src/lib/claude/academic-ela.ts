/**
 * Academic ELA Listening content generator — Grade 6-8, WIDA levels 3-6.
 *
 * System prompt: role + BASE_BLOCK + LISTENING_CORE_BLOCK + ELA_SUBJECT_BLOCK + ELA_OUTPUT_SCHEMA
 * No INPUT_FIELDS block — JSON field names are self-documenting.
 *
 * Permitted formats: all four (multiple_choice, sequence_ordering, pair_matching, agree_disagree)
 * agree_disagree works well for claims about author intent, character motivation, and argument texts.
 * Questions test comprehension of textual/literary language, not prior ELA knowledge.
 */

import {
  callClaude,
  toDisplayText,
  PASSAGE_SENTENCE_TARGETS,
  LEVEL_QUESTION_COUNT,
  LEVEL_MAX_TOKENS,
} from "./client";
import {
  buildSystemPrompt,
  BASE_BLOCK,
  LISTENING_CORE_BLOCK,
  ELA_SUBJECT_BLOCK,
  ELA_OUTPUT_SCHEMA,
} from "./prompts";
import type { ListeningContent } from "./listening";

const SYSTEM_PROMPT = buildSystemPrompt(
  "You are an academic listening content generator for Grade 6–8 English Language Learners. Generate an ELA passage presented as a teacher reading a literary or informational text aloud, plus comprehension questions that test whether the student understood the textual and literary language — not whether they have prior ELA knowledge.",
  BASE_BLOCK,
  LISTENING_CORE_BLOCK,
  ELA_SUBJECT_BLOCK,
  ELA_OUTPUT_SCHEMA,
);

// ── Fallback ──────────────────────────────────────────────────────────────────

export const FALLBACK_ACADEMIC_ELA: ListeningContent = {
  audioScript:
    "Listen to this short story. Maya walked into the school library and stopped. Every shelf was empty — the books were gone. Her heart sank. She loved this library more than any place at school. A note on the librarian's desk read: 'Books moved to Room 204 for renovation. Back in two weeks.' Maya smiled with relief. She grabbed her backpack and headed to Room 204.",
  topic: "ELA — Grade 6–8: Narrative Structure",
  context: "Teacher reading a short story excerpt to the class",
  questions: [
    {
      id: "1",
      type: "multiple_choice",
      question: "Why did Maya stop when she walked into the library?",
      options: [
        "The library was closed",
        "The shelves were empty",
        "She forgot her backpack",
        "The librarian stopped her",
      ],
      correct: 1,
      explanation: "The passage says every shelf was empty.",
    },
    {
      id: "2",
      type: "multiple_choice",
      question: "How did Maya feel when she first saw the empty shelves?",
      options: ["Confused", "Angry", "Sad", "Excited"],
      correct: 2,
      explanation: "The passage says 'her heart sank.'",
    },
    {
      id: "3",
      type: "multiple_choice",
      question: "What does 'her heart sank' tell us about Maya's feeling?",
      options: [
        "She felt surprised",
        "She felt disappointed",
        "She felt scared",
        "She felt bored",
      ],
      correct: 1,
      explanation: "Heart sank means she felt disappointed.",
    },
  ],
};

// ── Generator ─────────────────────────────────────────────────────────────────

export async function generateAcademicElaListeningContent(params: {
  level: number;
  fractionalLevel: number;
  stepWithinLevel: number;
  complexityInstruction: string;
  oralFormat: string;
  permittedFormats: string[];
  canDo: { keyUse: string; action: string; items: string[] };
  elaUnit: string;
  elaGenre: string;
  elaScenario: string;
  tier3Vocabulary: string[];
  topic: string;
  isRetry?: boolean;
  lastSessionScore?: number | null;
}): Promise<ListeningContent> {
  const clampedLevel = Math.min(Math.max(params.level, 3), 6);
  const questionCount = LEVEL_QUESTION_COUNT[clampedLevel] ?? 3;
  const passageSentenceTarget =
    PASSAGE_SENTENCE_TARGETS[clampedLevel] ?? PASSAGE_SENTENCE_TARGETS[3];
  const maxTokens = LEVEL_MAX_TOKENS[clampedLevel] ?? 1500;

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
    ela_unit:                params.elaUnit,
    ela_genre:               params.elaGenre,
    ela_scenario:            params.elaScenario,
    tier3_vocabulary:        params.tier3Vocabulary,
    topic:                   params.topic,
    is_retry:                params.isRetry ?? false,
    last_session_score:      params.lastSessionScore ?? null,
    question_count:          questionCount,
    passage_sentence_target: passageSentenceTarget,
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
      context:     result.context ?? "Teacher reading a text aloud to the class",
      questions: (result.questions || []).map((q) => ({
        id:          q.id,
        type:        q.type,
        question:    toDisplayText(q.question),
        options:     q.options,
        correct:     q.correct,
        explanation: q.explanation,
      })),
    };
  } catch {
    return FALLBACK_ACADEMIC_ELA;
  }
}
