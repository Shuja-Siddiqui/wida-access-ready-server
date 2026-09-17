/**
 * Academic Social Studies Listening content generator — Grade 6-8, WIDA levels 3-6.
 *
 * System prompt: role + BASE_BLOCK + LISTENING_CORE_BLOCK + SOCIAL_STUDIES_SUBJECT_BLOCK + SS_OUTPUT_SCHEMA
 * No INPUT_FIELDS block — JSON field names are self-documenting.
 *
 * Permitted formats: all four (multiple_choice, sequence_ordering, pair_matching, agree_disagree)
 * agree_disagree is strong here — historical interpretation and civics involve claims and evidence.
 * Questions test comprehension of historical/civic language, not memorized facts.
 */

import {
  callClaude,
  toDisplayText,
  academicSessionScale,
} from "./client";
import {
  buildSystemPrompt,
  OPTIONAL_LINE_VISUALS_BLOCK,
  SOCIAL_STUDIES_SUBJECT_BLOCK,
  SOCIAL_STUDIES_OUTPUT_SCHEMA,
  contentGenPrompt,
} from "./prompts";
import { parseOptionDiagrams, parseVisual } from "./prompts/optional-line-visuals";
import type { ListeningContent } from "./listening";
import { serializeCanDoForPrompt } from "../content";
import { clampToThreeOptions } from "../choice-options";
import { logger } from "../../config/logger";
import { dumpContentGenRequest } from "./dump-content-gen";
import { mergePriorPractice, type PracticeReport } from "../practice-report";

const SYSTEM_PROMPT = buildSystemPrompt(
  contentGenPrompt("listening", 3),
  "Academic social studies listening: test historical and civic language — not memorized facts.",
  OPTIONAL_LINE_VISUALS_BLOCK,
  SOCIAL_STUDIES_SUBJECT_BLOCK,
  SOCIAL_STUDIES_OUTPUT_SCHEMA,
);

// ── Fallback ──────────────────────────────────────────────────────────────────

export const FALLBACK_ACADEMIC_SOCIAL_STUDIES: ListeningContent = {
  audioScript:
    "Today we are going to look at a turning point in American history. In seventeen seventy-three, a group of colonists in Boston decided they had had enough. The British government had passed a law called the Tea Act, which required colonists to pay a tax on tea — but the colonists had no representatives in the British Parliament. Their rallying cry became 'no taxation without representation.' On the night of December sixteenth, a group of colonists disguised as Mohawk Indians boarded three British ships in Boston Harbor and dumped three hundred and forty-two chests of tea into the water. This event became known as the Boston Tea Party.",
  topic: "U.S. History — The Road to Revolution",
  context: "Teacher narrating a historical event to the class",
  questions: [
    {
      id: "1",
      type: "multiple_choice",
      question: "According to the teacher, what was the Tea Act?",
      options: [
        "A law allowing colonists to grow tea",
        "A law requiring colonists to pay a tax on tea",
        "A trade agreement with the Mohawk Indians",
      ],
      correct: 1,
      explanation: "The audio says the Tea Act required colonists to pay a tax on tea.",
    },
    {
      id: "2",
      type: "multiple_choice",
      question: "What does 'no taxation without representation' mean in this passage?",
      options: [
        "Colonists did not want to pay any taxes",
        "Colonists wanted to be represented in Parliament before being taxed",
        "The Mohawk Indians refused to pay taxes",
      ],
      correct: 1,
      explanation: "The passage explains colonists had no representatives in Parliament.",
    },
    {
      id: "3",
      type: "multiple_choice",
      question: "What did the colonists do on the night of December sixteenth?",
      options: [
        "They attacked British soldiers",
        "They wrote a letter to the King",
        "They dumped chests of tea into the harbor",
      ],
      correct: 2,
      explanation: "The audio says they dumped three hundred and forty-two chests of tea.",
    },
  ],
};

// ── Generator ─────────────────────────────────────────────────────────────────

export async function generateAcademicSocialStudiesListeningContent(params: {
  level: number;
  fractionalLevel: number;
  stepWithinLevel: number;
  complexityInstruction: string;
  oralFormat: string;
  permittedFormats: string[];
  canDo: { keyUse: string; action: string; items: string[] };
  ssUnit: string;
  ssStrand: string;
  ssScenario: string;
  tier3Vocabulary: string[];
  topic: string;
  isRetry?: boolean;
  lastSessionScore?: number | null;
  hasLibraryImage?: boolean;
  priorPracticeReport?: PracticeReport | null;
}): Promise<ListeningContent> {
  const { questionCount, passageSentenceTarget, maxTokens } = academicSessionScale(params.level);

  const prompt = JSON.stringify(mergePriorPractice({
    integer_level:          params.level,
    step_within_level:      params.stepWithinLevel,
    complexity_instruction: params.complexityInstruction,
    can_do: serializeCanDoForPrompt(params.canDo, { level: params.level, domain: "LISTENING" }),
    oral_format:             params.oralFormat,
    ss_unit:                 params.ssUnit,
    ss_strand:               params.ssStrand,
    ss_scenario:             params.ssScenario,
    tier3_vocabulary:        params.tier3Vocabulary,
    topic:                   params.topic,
    is_retry:                params.isRetry ?? false,
    last_session_score:      params.lastSessionScore ?? null,
    question_count:          questionCount,
    passage_sentence_target: passageSentenceTarget,
    has_library_image:       params.hasLibraryImage ?? false,
  }, params.priorPracticeReport));

  dumpContentGenRequest("academic-social-studies", SYSTEM_PROMPT, prompt);
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
      context:     result.context ?? "Teacher narrating a historical event or social studies concept to the class",
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
    logger.error({ err }, "academic social studies listening generation failed, using fallback");
    return FALLBACK_ACADEMIC_SOCIAL_STUDIES;
  }
}
