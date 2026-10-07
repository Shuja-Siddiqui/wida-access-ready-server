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
  academicSessionScale,
} from "./client";
import {
  ELA_SUBJECT_BLOCK,
} from "./prompts";
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
      ],
      correct: 1,
      explanation: "The passage says every shelf was empty.",
    },
    {
      id: "2",
      type: "multiple_choice",
      question: "How did Maya feel when she first saw the empty shelves?",
      options: ["Confused", "Angry", "Sad"],
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
  framework: FrameworkTask;
  elaUnit: string;
  elaGenre: string;
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
    unit:             params.elaUnit,
    topic:            params.topic,
    tier3Vocabulary:  params.tier3Vocabulary,
    scenarioExamples: params.scenarioExamples,
  });
  const { prepared, fields: libraryPromptFields } = buildAcademicListeningLibraryPromptFields({
    libraryCandidates,
    level:           params.level,
    keyUse:          params.framework.key_language_use,
    academicSubject: "ela",
    domainNote:      LIBRARY_IMAGE_LISTENING_EXTRA,
    curriculum,
    passageSentenceTarget,
    frameworkContext: params.frameworkContext,
    unitField: {
      unit:             params.elaUnit,
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
    academicContentLayer: ELA_SUBJECT_BLOCK,
    extraBlocks: [
      "Academic ELA listening: test textual language — not prior ELA knowledge.",
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
    goal:                   "Create one ELA listening task so the student can practice understanding language at framework.pld.",
    required_key_use:       params.framework.key_language_use,
    oral_format:             params.oralFormat,
    ela_unit:                params.elaUnit,
    ela_genre:               params.elaGenre,
    tier3_vocabulary:        params.tier3Vocabulary,
    topic:                   params.topic,
    is_retry:                params.isRetry ?? false,
    last_session_score:      params.lastSessionScore ?? null,
    question_count:          questionCount,
    available_question_formats: availableFormats,
    ...libraryPromptFields,
    ...(params.elaGenre ? { genre: params.elaGenre } : {}),
  }, params.priorPracticeReport));

  dumpContentGenRequest("academic-ela", systemPrompt, prompt);
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
      logLabel:      "academic-ela",
    });
    return {
      taskDescriptor,
      canDoDescriptor: taskDescriptor,
      framework:       params.framework,
      selectedLibraryImageId: finalized.selectedLibraryImageId,
      audioScript: finalized.audioScript,
      topic:       result.topic ?? params.topic,
      context:     result.context ?? "Teacher reading a text aloud to the class",
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
    logger.error({ err }, "academic ELA listening generation failed, using fallback");
    return FALLBACK_ACADEMIC_ELA;
  }
}
